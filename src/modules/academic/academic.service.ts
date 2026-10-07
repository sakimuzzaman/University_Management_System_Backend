import {
  EnrollmentStatus,
  PaymentStatus,
  Role,
  SemesterStatus,
} from "../../generated/prisma/enums";
import { prisma } from "../../config/prisma";
import { ApiError } from "../../utils/ApiError";
import { getPagination, pageMeta } from "../../utils/pagination";
import { calculateCourseOutcome, gradeForPercentage } from "./grade";
import { Prisma } from "../../generated/prisma/client";

type Actor = { id: string; role: Role };
type PageQuery = { page?: number; limit?: number };

const semesterSelect = {
  id: true,
  name: true,
  code: true,
  startDate: true,
  endDate: true,
  status: true,
  tuitionFee: true,
  maxCredits: true,
  createdAt: true,
} satisfies Prisma.SemesterSelect;

const sectionSelect = {
  id: true,
  courseId: true,
  semesterId: true,
  instructorId: true,
  sectionCode: true,
  capacity: true,
  enrolledCount: true,
  schedule: true,
  createdAt: true,
  course: {
    select: {
      id: true,
      code: true,
      title: true,
      credits: true,
      departmentId: true,
      programId: true,
    },
  },
  semester: {
    select: {
      id: true,
      name: true,
      code: true,
      status: true,
      startDate: true,
      endDate: true,
      maxCredits: true,
    },
  },
  instructor: {
    select: {
      id: true,
      employeeId: true,
      designation: true,
      user: { select: { id: true, name: true } },
    },
  },
} satisfies Prisma.SectionSelect;

const examSelect = {
  id: true,
  sectionId: true,
  title: true,
  type: true,
  examDate: true,
  maxMarks: true,
  weight: true,
  createdAt: true,
} satisfies Prisma.ExamSelect;

function dateOnly(value: Date) {
  return new Date(
    Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()),
  );
}

function isPrismaCode(error: unknown, code: string) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === code
  );
}

async function auditTx(
  tx: Prisma.TransactionClient,
  actorId: string,
  action: string,
  entity: string,
  entityId: string,
  ipAddress?: string,
  metadata: Prisma.InputJsonValue = {},
) {
  await tx.auditLog.create({
    data: {
      actorId,
      action,
      entity,
      entityId,
      ipAddress: ipAddress ?? null,
      metadata,
    },
  });
}

/* ----------------------------- Semesters ----------------------------- */

export async function createSemester(
  input: {
    name: string;
    code: string;
    startDate: Date;
    endDate: Date;
    tuitionFee: number;
    maxCredits?: number;
  },
  actor: Actor,
  ipAddress?: string,
) {
  if (input.endDate <= input.startDate) {
    throw new ApiError(400, "End date must be after start date");
  }

  return prisma.$transaction(async (tx) => {
    const semester = await tx.semester.create({
      data: {
        ...input,
        tuitionFee: new Prisma.Decimal(input.tuitionFee),
        maxCredits: input.maxCredits ?? 18,
      },
      select: semesterSelect,
    });

    await auditTx(tx, actor.id, "CREATE_SEMESTER", "Semester", semester.id, ipAddress);
    return semester;
  });
}

export async function listSemesters(query: PageQuery & { status?: SemesterStatus }) {
  const { page, limit, skip } = getPagination(query);
  const where: Prisma.SemesterWhereInput = {
    deletedAt: null,
    ...(query.status ? { status: query.status } : {}),
  };

  const [items, total] = await Promise.all([
    prisma.semester.findMany({
      where,
      skip,
      take: limit,
      orderBy: { startDate: "desc" },
      select: semesterSelect,
    }),
    prisma.semester.count({ where }),
  ]);

  return { items, meta: pageMeta(total, page, limit) };
}

export async function getSemester(id: string) {
  const semester = await prisma.semester.findFirst({
    where: { id, deletedAt: null },
    select: semesterSelect,
  });
  if (!semester) throw new ApiError(404, "Semester not found");
  return semester;
}

export async function updateSemester(
  id: string,
  input: {
    name?: string;
    startDate?: Date;
    endDate?: Date;
    tuitionFee?: number;
    maxCredits?: number;
  },
  actor: Actor,
  ipAddress?: string,
) {
  return prisma.$transaction(async (tx) => {
    const current = await tx.semester.findFirst({
      where: { id, deletedAt: null },
    });
    if (!current) throw new ApiError(404, "Semester not found");

    const startDate = input.startDate ?? current.startDate;
    const endDate = input.endDate ?? current.endDate;
    if (endDate <= startDate) {
      throw new ApiError(400, "End date must be after start date");
    }

    const semester = await tx.semester.update({
      where: { id },
      data: {
        name: input.name,
        startDate,
        endDate,
        tuitionFee:
          input.tuitionFee === undefined
            ? undefined
            : new Prisma.Decimal(input.tuitionFee),
        maxCredits: input.maxCredits,
      },
      select: semesterSelect,
    });

    await auditTx(tx, actor.id, "UPDATE_SEMESTER", "Semester", id, ipAddress, input);
    return semester;
  });
}

export async function updateSemesterStatus(
  id: string,
  nextStatus: SemesterStatus,
  actor: Actor,
  ipAddress?: string,
) {
  const transitions: Record<SemesterStatus, SemesterStatus[]> = {
    UPCOMING: [SemesterStatus.REGISTRATION_OPEN],
    REGISTRATION_OPEN: [SemesterStatus.ONGOING],
    ONGOING: [SemesterStatus.COMPLETED],
    COMPLETED: [],
  };

  return prisma.$transaction(async (tx) => {
    const semester = await tx.semester.findFirst({
      where: { id, deletedAt: null },
    });
    if (!semester) throw new ApiError(404, "Semester not found");

    if (semester.status === nextStatus) return semester;

    if (!transitions[semester.status].includes(nextStatus)) {
      throw new ApiError(
        409,
        `Invalid semester status transition: ${semester.status} → ${nextStatus}`,
      );
    }

    const updated = await tx.semester.update({
      where: { id },
      data: { status: nextStatus },
      select: semesterSelect,
    });

    await auditTx(
      tx,
      actor.id,
      "CHANGE_SEMESTER_STATUS",
      "Semester",
      id,
      ipAddress,
      { from: semester.status, to: nextStatus },
    );

    return updated;
  });
}

export async function softDeleteSemester(
  id: string,
  actor: Actor,
  ipAddress?: string,
) {
  return prisma.$transaction(async (tx) => {
    const semester = await tx.semester.findFirst({
      where: { id, deletedAt: null },
    });
    if (!semester) throw new ApiError(404, "Semester not found");

    const [sectionCount, paymentCount] = await Promise.all([
      tx.section.count({ where: { semesterId: id } }),
      tx.payment.count({ where: { semesterId: id } }),
    ]);

    if (sectionCount || paymentCount) {
      throw new ApiError(409, "Cannot delete a semester with sections or payments");
    }

    const deletedAt = new Date();
    await tx.semester.update({ where: { id }, data: { deletedAt } });
    await auditTx(tx, actor.id, "DELETE_SEMESTER", "Semester", id, ipAddress);

    return { id, deletedAt };
  });
}

/* ------------------------------ Sections ----------------------------- */

async function assertCanManageSection(
  tx: Prisma.TransactionClient,
  sectionId: string,
  actor: Actor,
) {
  if (actor.role !== Role.ADMIN && actor.role !== Role.INSTRUCTOR) {
    throw new ApiError(403, "You cannot manage this section");
  }

  const section = await tx.section.findFirst({
    where: { id: sectionId, deletedAt: null },
    include: { course: true, semester: true },
  });
  if (!section) throw new ApiError(404, "Section not found");

  if (actor.role === Role.INSTRUCTOR) {
    const profile = await tx.instructorProfile.findUnique({
      where: { userId: actor.id },
      select: { id: true },
    });

    if (!profile || section.instructorId !== profile.id) {
      throw new ApiError(403, "You are not assigned to this section");
    }
  }

  return section;
}

export async function createSection(
  input: {
    courseId: string;
    semesterId: string;
    instructorProfileId?: string;
    sectionCode: string;
    capacity: number;
    schedule?: string;
  },
  actor: Actor,
  ipAddress?: string,
) {
  return prisma.$transaction(async (tx) => {
    const [course, semester] = await Promise.all([
      tx.course.findFirst({
        where: { id: input.courseId, deletedAt: null },
      }),
      tx.semester.findFirst({
        where: { id: input.semesterId, deletedAt: null },
      }),
    ]);

    if (!course) throw new ApiError(404, "Course not found");
    if (!semester) throw new ApiError(404, "Semester not found");
    if (semester.status === SemesterStatus.COMPLETED) {
      throw new ApiError(409, "Cannot add sections to a completed semester");
    }

    if (input.instructorProfileId) {
      const instructor = await tx.instructorProfile.findFirst({
        where: {
          id: input.instructorProfileId,
          departmentId: course.departmentId,
        },
      });
      if (!instructor) {
        throw new ApiError(400, "Instructor must belong to the course department");
      }
    }

    const section = await tx.section.create({
      data: {
        courseId: input.courseId,
        semesterId: input.semesterId,
        instructorId: input.instructorProfileId ?? null,
        sectionCode: input.sectionCode,
        capacity: input.capacity,
        schedule: input.schedule ?? null,
      },
      select: sectionSelect,
    });

    await auditTx(tx, actor.id, "CREATE_SECTION", "Section", section.id, ipAddress);
    return { ...section, availableSeats: section.capacity - section.enrolledCount };
  });
}

export async function listSections(
  query: PageQuery & {
    semesterId?: string;
    courseId?: string;
    instructorId?: string;
    q?: string;
  },
  actor: Actor,
) {
  const { page, limit, skip } = getPagination(query);
  const filters: Prisma.SectionWhereInput[] = [
    { deletedAt: null },
    { course: { is: { deletedAt: null } } },
    { semester: { is: { deletedAt: null } } },
  ];

  if (query.semesterId) filters.push({ semesterId: query.semesterId });
  if (query.courseId) filters.push({ courseId: query.courseId });

  if (query.q) {
    filters.push({
      course: {
        is: {
          OR: [
            { title: { contains: query.q, mode: "insensitive" } },
            { code: { contains: query.q, mode: "insensitive" } },
          ],
        },
      },
    });
  }

  if (actor.role === Role.INSTRUCTOR) {
    filters.push({ instructor: { is: { userId: actor.id } } });
  } else if (actor.role === Role.ADMIN && query.instructorId) {
    filters.push({ instructorId: query.instructorId });
  }

  const where: Prisma.SectionWhereInput = { AND: filters };

  const [items, total] = await Promise.all([
    prisma.section.findMany({
      where,
      skip,
      take: limit,
      orderBy: [{ course: { code: "asc" } }, { sectionCode: "asc" }],
      select: sectionSelect,
    }),
    prisma.section.count({ where }),
  ]);

  return {
    items: items.map((section) => ({
      ...section,
      availableSeats: section.capacity - section.enrolledCount,
    })),
    meta: pageMeta(total, page, limit),
  };
}

export async function getSection(id: string, actor: Actor) {
  if (actor.role === Role.INSTRUCTOR) {
    await prisma.$transaction((tx) => assertCanManageSection(tx, id, actor));
  }

  const section = await prisma.section.findFirst({
    where: {
      id,
      deletedAt: null,
      course: { is: { deletedAt: null } },
      semester: { is: { deletedAt: null } },
    },
    select: sectionSelect,
  });

  if (!section) throw new ApiError(404, "Section not found");
  return { ...section, availableSeats: section.capacity - section.enrolledCount };
}

export async function updateSection(
  id: string,
  input: { capacity?: number; schedule?: string | null },
  actor: Actor,
  ipAddress?: string,
) {
  return prisma.$transaction(
    async (tx) => {
      const current = await tx.section.findFirst({
        where: { id, deletedAt: null },
      });
      if (!current) throw new ApiError(404, "Section not found");

      if (input.capacity !== undefined && input.capacity < current.enrolledCount) {
        throw new ApiError(409, "Capacity cannot be lower than current enrollment");
      }

      const updated = await tx.section.update({
        where: { id },
        data: { capacity: input.capacity, schedule: input.schedule },
        select: sectionSelect,
      });

      await auditTx(tx, actor.id, "UPDATE_SECTION", "Section", id, ipAddress, input);
      return { ...updated, availableSeats: updated.capacity - updated.enrolledCount };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}

export async function assignInstructor(
  id: string,
  instructorProfileId: string | null,
  actor: Actor,
  ipAddress?: string,
) {
  return prisma.$transaction(async (tx) => {
    const section = await tx.section.findFirst({
      where: { id, deletedAt: null },
      include: { course: true },
    });
    if (!section) throw new ApiError(404, "Section not found");

    if (instructorProfileId) {
      const instructor = await tx.instructorProfile.findFirst({
        where: {
          id: instructorProfileId,
          departmentId: section.course.departmentId,
        },
      });
      if (!instructor) {
        throw new ApiError(400, "Instructor must belong to the course department");
      }
    }

    const updated = await tx.section.update({
      where: { id },
      data: { instructorId: instructorProfileId },
      select: sectionSelect,
    });

    await auditTx(
      tx,
      actor.id,
      "ASSIGN_INSTRUCTOR",
      "Section",
      id,
      ipAddress,
      { instructorProfileId },
    );

    return { ...updated, availableSeats: updated.capacity - updated.enrolledCount };
  });
}

export async function softDeleteSection(
  id: string,
  actor: Actor,
  ipAddress?: string,
) {
  return prisma.$transaction(
    async (tx) => {
      const section = await tx.section.findFirst({
        where: { id, deletedAt: null },
      });
      if (!section) throw new ApiError(404, "Section not found");

      const [enrollments, attendance, exams] = await Promise.all([
        tx.enrollment.count({ where: { sectionId: id } }),
        tx.attendance.count({ where: { sectionId: id } }),
        tx.exam.count({ where: { sectionId: id } }),
      ]);

      if (enrollments || attendance || exams) {
        throw new ApiError(409, "Cannot delete a section with academic records");
      }

      const deletedAt = new Date();
      await tx.section.update({ where: { id }, data: { deletedAt } });
      await auditTx(tx, actor.id, "DELETE_SECTION", "Section", id, ipAddress);

      return { id, deletedAt };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}

/* ----------------------------- Enrollment ---------------------------- */

async function hasPassedPrerequisite(
  tx: Prisma.TransactionClient,
  studentId: string,
  courseId: string,
) {
  const attempts = await tx.enrollment.findMany({
    where: {
      studentId,
      deletedAt: null,
      status: { in: [EnrollmentStatus.ENROLLED, EnrollmentStatus.COMPLETED] },
      section: {
        is: {
          courseId,
          deletedAt: null,
          semester: {
            is: {
              status: SemesterStatus.COMPLETED,
              deletedAt: null,
            },
          },
        },
      },
    },
    select: {
      section: {
        select: {
          exams: {
            where: { deletedAt: null },
            select: {
              maxMarks: true,
              weight: true,
              results: {
                where: { studentId, published: true },
                select: { marks: true },
              },
            },
          },
        },
      },
    },
  });

  return attempts.some(({ section }) => {
    const outcome = calculateCourseOutcome(section.exams);
    return (
      outcome.hasAllResults &&
      outcome.weightsComplete &&
      outcome.percentage !== null &&
      outcome.percentage >= 50
    );
  });
}

export async function enrollInSection(
  sectionId: string,
  actor: Actor,
  ipAddress?: string,
) {
  if (actor.role !== Role.STUDENT) {
    throw new ApiError(403, "Only students can enroll in sections");
  }

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await prisma.$transaction(
        async (tx) => {
          const student = await tx.studentProfile.findUnique({
            where: { userId: actor.id },
            select: { id: true, programId: true },
          });
          if (!student) {
            throw new ApiError(409, "Complete your student profile first");
          }

          const section = await tx.section.findFirst({
            where: {
              id: sectionId,
              deletedAt: null,
              course: { is: { deletedAt: null } },
              semester: { is: { deletedAt: null } },
            },
            include: {
              course: {
                select: {
                  id: true,
                  code: true,
                  title: true,
                  credits: true,
                  programId: true,
                },
              },
              semester: {
                select: {
                  id: true,
                  status: true,
                  maxCredits: true,
                },
              },
            },
          });

          if (!section) throw new ApiError(404, "Section not found");

          if (section.semester.status !== SemesterStatus.REGISTRATION_OPEN) {
            throw new ApiError(409, "Registration is not open for this semester");
          }

          if (student.programId !== section.course.programId) {
            throw new ApiError(403, "This course is not in your declared program");
          }

          const payment = await tx.payment.findUnique({
            where: {
              userId_semesterId: {
                userId: actor.id,
                semesterId: section.semesterId,
              },
            },
            select: { status: true },
          });

          if (payment?.status !== PaymentStatus.SUCCEEDED) {
            throw new ApiError(402, "Pay semester tuition before enrolling");
          }

          const existing = await tx.enrollment.findUnique({
            where: {
              studentId_sectionId: {
                studentId: student.id,
                sectionId,
              },
            },
          });

          if (existing && existing.status !== EnrollmentStatus.DROPPED) {
            throw new ApiError(409, "You are already enrolled in this section");
          }

          const sameCourse = await tx.enrollment.findFirst({
            where: {
              studentId: student.id,
              status: EnrollmentStatus.ENROLLED,
              deletedAt: null,
              section: {
                is: {
                  courseId: section.courseId,
                  semesterId: section.semesterId,
                  deletedAt: null,
                },
              },
            },
          });

          if (sameCourse) {
            throw new ApiError(
              409,
              "You are already enrolled in another section of this course",
            );
          }

          const prerequisites = await tx.coursePrerequisite.findMany({
            where: { courseId: section.courseId },
            select: {
              prerequisiteId: true,
              prerequisite: { select: { code: true, title: true } },
            },
          });

          for (const prerequisite of prerequisites) {
            const passed = await hasPassedPrerequisite(
              tx,
              student.id,
              prerequisite.prerequisiteId,
            );
            if (!passed) {
              throw new ApiError(
                409,
                `Prerequisite not completed: ${prerequisite.prerequisite.code} — ${prerequisite.prerequisite.title}`,
              );
            }
          }

          const currentEnrollments = await tx.enrollment.findMany({
            where: {
              studentId: student.id,
              status: EnrollmentStatus.ENROLLED,
              deletedAt: null,
              section: { is: { semesterId: section.semesterId } },
            },
            select: {
              section: {
                select: { course: { select: { credits: true } } },
              },
            },
          });

          const currentCredits = currentEnrollments.reduce(
            (total, enrollment) => total + enrollment.section.course.credits,
            0,
          );

          if (currentCredits + section.course.credits > section.semester.maxCredits) {
            throw new ApiError(
              409,
              `The semester credit limit is ${section.semester.maxCredits}`,
            );
          }

          // This is an atomic capacity claim. The transaction rolls it back if
          // enrollment creation or any later operation fails.
          const seat = await tx.section.updateMany({
            where: {
              id: section.id,
              deletedAt: null,
              enrolledCount: { lt: section.capacity },
            },
            data: { enrolledCount: { increment: 1 } },
          });

          if (seat.count !== 1) {
            throw new ApiError(409, "This section is full");
          }

          const enrollment = existing
            ? await tx.enrollment.update({
                where: { id: existing.id },
                data: {
                  status: EnrollmentStatus.ENROLLED,
                  droppedAt: null,
                  deletedAt: null,
                  enrolledAt: new Date(),
                },
              })
            : await tx.enrollment.create({
                data: {
                  studentId: student.id,
                  sectionId,
                  status: EnrollmentStatus.ENROLLED,
                },
              });

          await auditTx(
            tx,
            actor.id,
            existing ? "REACTIVATE_ENROLLMENT" : "CREATE_ENROLLMENT",
            "Enrollment",
            enrollment.id,
            ipAddress,
            {
              sectionId,
              courseId: section.courseId,
              semesterId: section.semesterId,
            },
          );

          return tx.enrollment.findUniqueOrThrow({
            where: { id: enrollment.id },
            include: {
              section: {
                select: {
                  id: true,
                  sectionCode: true,
                  course: { select: { id: true, code: true, title: true, credits: true } },
                  semester: { select: { id: true, name: true, code: true } },
                },
              },
            },
          });
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (isPrismaCode(error, "P2034")) {
        if (attempt < 2) {
          await new Promise((resolve) => setTimeout(resolve, 25 * (attempt + 1)));
          continue;
        }
        throw new ApiError(409, "Concurrent registration conflict; please retry");
      }

      if (isPrismaCode(error, "P2002")) {
        throw new ApiError(409, "A conflicting enrollment already exists");
      }

      throw error;
    }
  }

  throw new ApiError(409, "Could not complete enrollment; please retry");
}

export async function dropEnrollment(
  enrollmentId: string,
  actor: Actor,
  ipAddress?: string,
) {
  if (actor.role !== Role.STUDENT) {
    throw new ApiError(403, "Only students can drop their own enrollment");
  }

  return prisma.$transaction(
    async (tx) => {
      const student = await tx.studentProfile.findUnique({
        where: { userId: actor.id },
        select: { id: true },
      });
      if (!student) throw new ApiError(404, "Student profile not found");

      const enrollment = await tx.enrollment.findFirst({
        where: {
          id: enrollmentId,
          studentId: student.id,
          deletedAt: null,
        },
        include: { section: { include: { semester: true } } },
      });

      // Return 404 rather than exposing another student's enrollment.
      if (!enrollment) throw new ApiError(404, "Enrollment not found");

      if (enrollment.status !== EnrollmentStatus.ENROLLED) {
        throw new ApiError(409, "Enrollment is not active");
      }

      if (enrollment.section.semester.status !== SemesterStatus.REGISTRATION_OPEN) {
        throw new ApiError(409, "Enrollment can only be dropped during registration");
      }

      const changed = await tx.enrollment.updateMany({
        where: {
          id: enrollmentId,
          studentId: student.id,
          status: EnrollmentStatus.ENROLLED,
          deletedAt: null,
        },
        data: {
          status: EnrollmentStatus.DROPPED,
          droppedAt: new Date(),
        },
      });

      if (changed.count !== 1) {
        throw new ApiError(409, "Enrollment has already changed");
      }

      const seat = await tx.section.updateMany({
        where: {
          id: enrollment.sectionId,
          enrolledCount: { gt: 0 },
        },
        data: { enrolledCount: { decrement: 1 } },
      });

      if (seat.count !== 1) {
        throw new ApiError(409, "Section enrollment count is inconsistent");
      }

      await auditTx(
        tx,
        actor.id,
        "DROP_ENROLLMENT",
        "Enrollment",
        enrollmentId,
        ipAddress,
        { sectionId: enrollment.sectionId },
      );

      return tx.enrollment.findUniqueOrThrow({
        where: { id: enrollmentId },
        include: {
          section: {
            select: {
              id: true,
              sectionCode: true,
              course: { select: { code: true, title: true } },
              semester: { select: { name: true, code: true } },
            },
          },
        },
      });
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}

export async function listMyEnrollments(
  userId: string,
  query: PageQuery & { semesterId?: string; status?: EnrollmentStatus },
) {
  const student = await prisma.studentProfile.findUnique({
    where: { userId },
    select: { id: true },
  });
  if (!student) throw new ApiError(404, "Student profile not found");

  const { page, limit, skip } = getPagination(query);
  const where: Prisma.EnrollmentWhereInput = {
    studentId: student.id,
    deletedAt: null,
    ...(query.status ? { status: query.status } : {}),
    ...(query.semesterId
      ? { section: { is: { semesterId: query.semesterId } } }
      : {}),
  };

  const [items, total] = await Promise.all([
    prisma.enrollment.findMany({
      where,
      skip,
      take: limit,
      orderBy: { enrolledAt: "desc" },
      select: {
        id: true,
        status: true,
        enrolledAt: true,
        droppedAt: true,
        section: {
          select: {
            id: true,
            sectionCode: true,
            course: { select: { id: true, code: true, title: true, credits: true } },
            semester: { select: { id: true, name: true, code: true } },
          },
        },
      },
    }),
    prisma.enrollment.count({ where }),
  ]);

  return { items, meta: pageMeta(total, page, limit) };
}

/* ------------------------------ Attendance --------------------------- */

export async function markAttendance(
  sectionId: string,
  input: {
    date: Date;
    records: { studentId: string; status: string }[];
  },
  actor: Actor,
  ipAddress?: string,
) {
  const date = dateOnly(input.date);

  return prisma.$transaction(
    async (tx) => {
      const section = await assertCanManageSection(tx, sectionId, actor);

      if (section.semester.status !== SemesterStatus.ONGOING) {
        throw new ApiError(409, "Attendance can only be marked during an ongoing semester");
      }

      if (
        date < dateOnly(section.semester.startDate) ||
        date > dateOnly(section.semester.endDate) ||
        date > dateOnly(new Date())
      ) {
        throw new ApiError(400, "Attendance date must be within the semester and not in the future");
      }

      const ids = input.records.map((record) => record.studentId);
      const enrolled = await tx.enrollment.findMany({
        where: {
          sectionId,
          studentId: { in: ids },
          status: EnrollmentStatus.ENROLLED,
          deletedAt: null,
        },
        select: { studentId: true },
      });

      const enrolledIds = new Set(enrolled.map((record) => record.studentId));
      const invalidIds = ids.filter((id) => !enrolledIds.has(id));

      if (invalidIds.length) {
        throw new ApiError(400, "Every attendance student must be actively enrolled", [
          ...invalidIds.map((id) => ({ path: "records", message: `Not enrolled: ${id}` })),
        ]);
      }

      const results = await Promise.all(
        input.records.map((record) =>
          tx.attendance.upsert({
            where: {
              sectionId_studentId_date: {
                sectionId,
                studentId: record.studentId,
                date,
              },
            },
            create: {
              sectionId,
              studentId: record.studentId,
              date,
              status: record.status as never,
              markedById: actor.id,
            },
            update: {
              status: record.status as never,
              markedById: actor.id,
            },
          }),
        ),
      );

      await auditTx(
        tx,
        actor.id,
        "MARK_ATTENDANCE",
        "Section",
        sectionId,
        ipAddress,
        { date: date.toISOString().slice(0, 10), recordCount: results.length },
      );

      return { date: date.toISOString().slice(0, 10), savedCount: results.length };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}

export async function listSectionAttendance(
  sectionId: string,
  query: PageQuery & { date?: Date; studentId?: string },
  actor: Actor,
) {
  if (actor.role === Role.INSTRUCTOR) {
    await prisma.$transaction((tx) => assertCanManageSection(tx, sectionId, actor));
  }

  const { page, limit, skip } = getPagination(query);
  const where: Prisma.AttendanceWhereInput = {
    sectionId,
    ...(query.date ? { date: dateOnly(query.date) } : {}),
    ...(query.studentId ? { studentId: query.studentId } : {}),
  };

  const [items, total] = await Promise.all([
    prisma.attendance.findMany({
      where,
      skip,
      take: limit,
      orderBy: [{ date: "desc" }, { studentId: "asc" }],
      select: {
        id: true,
        date: true,
        status: true,
        student: {
          select: {
            id: true,
            studentId: true,
            user: { select: { id: true, name: true } },
          },
        },
        markedBy: { select: { id: true, name: true } },
      },
    }),
    prisma.attendance.count({ where }),
  ]);

  return { items, meta: pageMeta(total, page, limit) };
}

export async function listMyAttendance(
  userId: string,
  query: PageQuery & { semesterId?: string },
) {
  const student = await prisma.studentProfile.findUnique({
    where: { userId },
    select: { id: true },
  });
  if (!student) throw new ApiError(404, "Student profile not found");

  const { page, limit, skip } = getPagination(query);
  const where: Prisma.AttendanceWhereInput = {
    studentId: student.id,
    ...(query.semesterId
      ? { section: { is: { semesterId: query.semesterId } } }
      : {}),
  };

  const [items, total] = await Promise.all([
    prisma.attendance.findMany({
      where,
      skip,
      take: limit,
      orderBy: { date: "desc" },
      select: {
        id: true,
        date: true,
        status: true,
        section: {
          select: {
            id: true,
            sectionCode: true,
            course: { select: { code: true, title: true } },
            semester: { select: { name: true, code: true } },
          },
        },
      },
    }),
    prisma.attendance.count({ where }),
  ]);

  return { items, meta: pageMeta(total, page, limit) };
}

/* -------------------------------- Exams ------------------------------ */

export async function createExam(
  sectionId: string,
  input: {
    title: string;
    type: string;
    examDate: Date;
    maxMarks: number;
    weight: number;
  },
  actor: Actor,
  ipAddress?: string,
) {
  return prisma.$transaction(
    async (tx) => {
      const section = await assertCanManageSection(tx, sectionId, actor);

      if (section.semester.status !== SemesterStatus.ONGOING) {
        throw new ApiError(409, "Exams can only be created during an ongoing semester");
      }

      if (
        input.examDate < section.semester.startDate ||
        input.examDate > section.semester.endDate
      ) {
        throw new ApiError(400, "Exam date must be within the semester dates");
      }

      const existingExams = await tx.exam.findMany({
        where: { sectionId, deletedAt: null },
        select: { weight: true },
      });

      const usedWeight = existingExams.reduce(
        (total, exam) => total + Number(exam.weight),
        0,
      );

      if (usedWeight + input.weight > 100.01) {
        throw new ApiError(409, "Total exam weight for a section cannot exceed 100%");
      }

      const exam = await tx.exam.create({
        data: {
          sectionId,
          title: input.title,
          type: input.type as never,
          examDate: input.examDate,
          maxMarks: new Prisma.Decimal(input.maxMarks),
          weight: new Prisma.Decimal(input.weight),
        },
        select: examSelect,
      });

      await auditTx(tx, actor.id, "CREATE_EXAM", "Exam", exam.id, ipAddress);
      return exam;
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}

export async function listSectionExams(sectionId: string, actor: Actor) {
  const section = await prisma.section.findFirst({
    where: { id: sectionId, deletedAt: null },
    select: { id: true },
  });
  if (!section) throw new ApiError(404, "Section not found");

  if (actor.role === Role.INSTRUCTOR) {
    await prisma.$transaction((tx) => assertCanManageSection(tx, sectionId, actor));
  } else if (actor.role === Role.STUDENT) {
    const student = await prisma.studentProfile.findUnique({
      where: { userId: actor.id },
      select: { id: true },
    });
    if (!student) throw new ApiError(404, "Student profile not found");

    const enrollment = await prisma.enrollment.findFirst({
      where: {
        studentId: student.id,
        sectionId,
        status: { in: [EnrollmentStatus.ENROLLED, EnrollmentStatus.COMPLETED] },
        deletedAt: null,
      },
    });
    if (!enrollment) throw new ApiError(403, "You are not enrolled in this section");
  }

  return prisma.exam.findMany({
    where: { sectionId, deletedAt: null },
    orderBy: { examDate: "asc" },
    select: examSelect,
  });
}

export async function softDeleteExam(
  examId: string,
  actor: Actor,
  ipAddress?: string,
) {
  return prisma.$transaction(async (tx) => {
    const exam = await tx.exam.findFirst({
      where: { id: examId, deletedAt: null },
    });
    if (!exam) throw new ApiError(404, "Exam not found");

    await assertCanManageSection(tx, exam.sectionId, actor);

    const resultCount = await tx.result.count({ where: { examId } });
    if (resultCount) {
      throw new ApiError(409, "Cannot delete an exam with result records");
    }

    const deletedAt = new Date();
    await tx.exam.update({ where: { id: examId }, data: { deletedAt } });
    await auditTx(tx, actor.id, "DELETE_EXAM", "Exam", examId, ipAddress);

    return { id: examId, deletedAt };
  });
}

/* ------------------------------ Results ------------------------------ */

export async function saveExamResults(
  examId: string,
  entries: { studentId: string; marks: number; remarks?: string }[],
  actor: Actor,
  ipAddress?: string,
) {
  return prisma.$transaction(
    async (tx) => {
      const exam = await tx.exam.findFirst({
        where: { id: examId, deletedAt: null },
        include: { section: { include: { semester: true } } },
      });
      if (!exam) throw new ApiError(404, "Exam not found");

      await assertCanManageSection(tx, exam.sectionId, actor);

      const eligible = await tx.enrollment.findMany({
        where: {
          sectionId: exam.sectionId,
          studentId: { in: entries.map((entry) => entry.studentId) },
          status: { in: [EnrollmentStatus.ENROLLED, EnrollmentStatus.COMPLETED] },
          deletedAt: null,
        },
        select: { studentId: true },
      });

      const eligibleIds = new Set(eligible.map((row) => row.studentId));
      const invalidIds = entries
        .map((entry) => entry.studentId)
        .filter((id) => !eligibleIds.has(id));

      if (invalidIds.length) {
        throw new ApiError(400, "Results can only be entered for enrolled students", [
          ...invalidIds.map((id) => ({ path: "entries", message: `Not enrolled: ${id}` })),
        ]);
      }

      for (const entry of entries) {
        if (entry.marks > Number(exam.maxMarks)) {
          throw new ApiError(400, `Marks cannot exceed ${Number(exam.maxMarks)}`);
        }
      }

      const publishedResults = await tx.result.findMany({
        where: {
          examId,
          studentId: { in: entries.map((entry) => entry.studentId) },
          published: true,
        },
        select: { studentId: true },
      });

      if (publishedResults.length) {
        throw new ApiError(409, "Published results cannot be changed");
      }

      await Promise.all(
        entries.map((entry) => {
          const percentage = (entry.marks / Number(exam.maxMarks)) * 100;
          const grade = gradeForPercentage(percentage).grade;

          return tx.result.upsert({
            where: {
              examId_studentId: {
                examId,
                studentId: entry.studentId,
              },
            },
            create: {
              examId,
              studentId: entry.studentId,
              marks: new Prisma.Decimal(entry.marks),
              grade,
              remarks: entry.remarks ?? null,
              published: false,
            },
            update: {
              marks: new Prisma.Decimal(entry.marks),
              grade,
              remarks: entry.remarks ?? null,
              published: false,
            },
          });
        }),
      );

      await auditTx(
        tx,
        actor.id,
        "SAVE_RESULT_DRAFTS",
        "Exam",
        examId,
        ipAddress,
        { count: entries.length },
      );

      return { examId, savedCount: entries.length, published: false };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}

export async function publishExamResults(
  examId: string,
  actor: Actor,
  ipAddress?: string,
) {
  return prisma.$transaction(async (tx) => {
    const exam = await tx.exam.findFirst({
      where: { id: examId, deletedAt: null },
    });
    if (!exam) throw new ApiError(404, "Exam not found");

    await assertCanManageSection(tx, exam.sectionId, actor);

    const enrollments = await tx.enrollment.findMany({
      where: {
        sectionId: exam.sectionId,
        status: { in: [EnrollmentStatus.ENROLLED, EnrollmentStatus.COMPLETED] },
        deletedAt: null,
      },
      select: { studentId: true },
    });

    if (!enrollments.length) {
      throw new ApiError(409, "There are no enrolled students for this exam");
    }

    const studentIds = enrollments.map((row) => row.studentId);
    const results = await tx.result.findMany({
      where: {
        examId,
        studentId: { in: studentIds },
      },
      select: { studentId: true },
    });

    const resultIds = new Set(results.map((row) => row.studentId));
    const missingCount = studentIds.filter((id) => !resultIds.has(id)).length;

    if (missingCount) {
      throw new ApiError(
        409,
        `${missingCount} enrolled student(s) still need a result before publishing`,
      );
    }

    await tx.result.updateMany({
      where: {
        examId,
        studentId: { in: studentIds },
        published: false,
      },
      data: { published: true },
    });

    await auditTx(
      tx,
      actor.id,
      "PUBLISH_RESULTS",
      "Exam",
      examId,
      ipAddress,
      { publishedStudentCount: studentIds.length },
    );

    return { examId, publishedStudentCount: studentIds.length };
  });
}

export async function listExamResults(
  examId: string,
  query: PageQuery,
  actor: Actor,
) {
  const exam = await prisma.exam.findFirst({
    where: { id: examId, deletedAt: null },
    select: { id: true, sectionId: true },
  });
  if (!exam) throw new ApiError(404, "Exam not found");

  if (actor.role === Role.INSTRUCTOR) {
    await prisma.$transaction((tx) =>
      assertCanManageSection(tx, exam.sectionId, actor),
    );
  }

  const { page, limit, skip } = getPagination(query);
  const where: Prisma.ResultWhereInput = { examId };

  const [items, total] = await Promise.all([
    prisma.result.findMany({
      where,
      skip,
      take: limit,
      orderBy: { studentId: "asc" },
      select: {
        id: true,
        marks: true,
        grade: true,
        remarks: true,
        published: true,
        student: {
          select: {
            id: true,
            studentId: true,
            user: { select: { id: true, name: true, email: true } },
          },
        },
      },
    }),
    prisma.result.count({ where }),
  ]);

  return { items, meta: pageMeta(total, page, limit) };
}

export async function listMyResults(
  userId: string,
  query: PageQuery & { semesterId?: string },
) {
  const student = await prisma.studentProfile.findUnique({
    where: { userId },
    select: { id: true },
  });
  if (!student) throw new ApiError(404, "Student profile not found");

  const { page, limit, skip } = getPagination(query);
  const where: Prisma.ResultWhereInput = {
    studentId: student.id,
    published: true,
    ...(query.semesterId
      ? {
          exam: {
            is: {
              section: { is: { semesterId: query.semesterId } },
            },
          },
        }
      : {}),
  };

  const [items, total] = await Promise.all([
    prisma.result.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        marks: true,
        grade: true,
        remarks: true,
        published: true,
        exam: {
          select: {
            id: true,
            title: true,
            type: true,
            examDate: true,
            maxMarks: true,
            weight: true,
            section: {
              select: {
                sectionCode: true,
                course: { select: { code: true, title: true } },
                semester: { select: { name: true, code: true } },
              },
            },
          },
        },
      },
    }),
    prisma.result.count({ where }),
  ]);

  return { items, meta: pageMeta(total, page, limit) };
}

/* ------------------------------ Transcript --------------------------- */

export async function getMyTranscript(userId: string) {
  const student = await prisma.studentProfile.findUnique({
    where: { userId },
    select: { id: true, studentId: true },
  });
  if (!student) throw new ApiError(404, "Student profile not found");

  const enrollments = await prisma.enrollment.findMany({
    where: {
      studentId: student.id,
      deletedAt: null,
      status: { in: [EnrollmentStatus.ENROLLED, EnrollmentStatus.COMPLETED] },
      section: {
        is: {
          deletedAt: null,
          course: { is: { deletedAt: null } },
          semester: { is: { deletedAt: null } },
        },
      },
    },
    orderBy: { enrolledAt: "asc" },
    select: {
      id: true,
      status: true,
      section: {
        select: {
          sectionCode: true,
          course: {
            select: { id: true, code: true, title: true, credits: true },
          },
          semester: {
            select: {
              id: true,
              name: true,
              code: true,
              status: true,
              startDate: true,
            },
          },
          exams: {
            where: { deletedAt: null },
            select: {
              maxMarks: true,
              weight: true,
              results: {
                where: { studentId: student.id, published: true },
                select: { marks: true },
              },
            },
          },
        },
      },
    },
  });

  type SemesterBucket = {
    semester: {
      id: string;
      name: string;
      code: string;
      status: SemesterStatus;
      startDate: Date;
    };
    courses: Record<string, unknown>[];
    qualityPoints: number;
    attemptedCredits: number;
    earnedCredits: number;
  };

  const buckets = new Map<string, SemesterBucket>();

  for (const enrollment of enrollments) {
    const { section } = enrollment;
    const { course, semester } = section;

    let bucket = buckets.get(semester.id);
    if (!bucket) {
      bucket = {
        semester,
        courses: [],
        qualityPoints: 0,
        attemptedCredits: 0,
        earnedCredits: 0,
      };
      buckets.set(semester.id, bucket);
    }

    const outcome = calculateCourseOutcome(section.exams);
    const assessmentComplete =
      outcome.hasAllResults && outcome.weightsComplete && outcome.percentage !== null;

    const finalGrade =
      assessmentComplete && outcome.percentage !== null
        ? gradeForPercentage(outcome.percentage)
        : null;

    const finalized =
      semester.status === SemesterStatus.COMPLETED && finalGrade !== null;

    if (finalized && finalGrade) {
      bucket.qualityPoints += finalGrade.points * course.credits;
      bucket.attemptedCredits += course.credits;
      if (outcome.percentage !== null && outcome.percentage >= 50) {
        bucket.earnedCredits += course.credits;
      }
    }

    bucket.courses.push({
      enrollmentId: enrollment.id,
      enrollmentStatus: enrollment.status,
      sectionCode: section.sectionCode,
      course: {
        id: course.id,
        code: course.code,
        title: course.title,
        credits: course.credits,
      },
      assessmentComplete,
      finalized,
      percentage: outcome.percentage,
      grade: finalGrade?.grade ?? null,
      gradePoints: finalized ? finalGrade?.points ?? null : null,
    });
  }

  const semesters = [...buckets.values()]
    .sort((a, b) => a.semester.startDate.getTime() - b.semester.startDate.getTime())
    .map((bucket) => ({
      id: bucket.semester.id,
      name: bucket.semester.name,
      code: bucket.semester.code,
      status: bucket.semester.status,
      courses: bucket.courses,
      gpa:
        bucket.attemptedCredits > 0
          ? Number((bucket.qualityPoints / bucket.attemptedCredits).toFixed(2))
          : null,
      attemptedCredits: bucket.attemptedCredits,
      earnedCredits: bucket.earnedCredits,
    }));

  const totalQualityPoints = [...buckets.values()].reduce(
    (total, bucket) => total + bucket.qualityPoints,
    0,
  );
  const totalAttemptedCredits = [...buckets.values()].reduce(
    (total, bucket) => total + bucket.attemptedCredits,
    0,
  );

  return {
    studentId: student.studentId,
    cumulativeGpa:
      totalAttemptedCredits > 0
        ? Number((totalQualityPoints / totalAttemptedCredits).toFixed(2))
        : null,
    totalAttemptedCredits,
    semesters,
  };
}