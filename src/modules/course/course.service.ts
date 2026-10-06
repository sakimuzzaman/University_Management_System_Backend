
import { prisma } from "../../config/prisma";
import { ApiError } from "../../utils/ApiError";
import { getPagination, pageMeta } from "../../utils/pagination";
import { writeAudit } from "../../utils/audit";
import { Prisma } from "../../generated/prisma/client";

const courseSelect = {
  id: true,
  code: true,
  title: true,
  description: true,
  credits: true,
  createdAt: true,
  department: { select: { id: true, name: true, code: true } },
  program: { select: { id: true, name: true, code: true } },
  prerequisites: {
    select: { prerequisite: { select: { id: true, code: true, title: true } } },
  },
} satisfies Prisma.CourseSelect;

async function assertDepartmentAndProgram(departmentId: string, programId: string) {
  const [department, program] = await Promise.all([
    prisma.department.findFirst({ where: { id: departmentId, deletedAt: null } }),
    prisma.program.findFirst({ where: { id: programId, deletedAt: null } }),
  ]);
  if (!department) throw new ApiError(404, "Department not found");
  if (!program) throw new ApiError(404, "Program not found");
  if (program.departmentId !== departmentId) {
    throw new ApiError(400, "Program does not belong to the given department");
  }
}

async function assertPrerequisites(courseId: string | null, ids: string[]) {
  if (courseId && ids.includes(courseId)) {
    throw new ApiError(400, "A course cannot be its own prerequisite");
  }
  const found = await prisma.course.findMany({
    where: { id: { in: ids }, deletedAt: null },
    select: { id: true },
  });
  if (found.length !== ids.length) throw new ApiError(404, "One or more prerequisites were not found");
}

export async function createCourse(
  input: {
    code: string;
    title: string;
    description?: string;
    credits: number;
    departmentId: string;
    programId: string;
    prerequisiteIds?: string[];
  },
  actorId: string,
  ipAddress?: string,
) {
  await assertDepartmentAndProgram(input.departmentId, input.programId);
  if (input.prerequisiteIds?.length) await assertPrerequisites(null, input.prerequisiteIds);

  const course = await prisma.course.create({
    data: {
      code: input.code,
      title: input.title,
      description: input.description,
      credits: input.credits,
      departmentId: input.departmentId,
      programId: input.programId,
      prerequisites: input.prerequisiteIds?.length
        ? { create: input.prerequisiteIds.map((prerequisiteId) => ({ prerequisiteId })) }
        : undefined,
    },
    select: courseSelect,
  });

  await writeAudit({
    actorId,
    action: "CREATE_COURSE",
    entity: "Course",
    entityId: course.id,
    ipAddress,
  });
  return course;
}

export async function listCourses(query: {
  page?: number;
  limit?: number;
  q?: string;
  departmentId?: string;
  programId?: string;
  sortBy?: "createdAt" | "title" | "code" | "credits";
  sortOrder?: "asc" | "desc";
}) {
  const { page, limit, skip } = getPagination(query);
  const where: Prisma.CourseWhereInput = {
    deletedAt: null,
    ...(query.departmentId ? { departmentId: query.departmentId } : {}),
    ...(query.programId ? { programId: query.programId } : {}),
    ...(query.q
      ? {
          OR: [
            { title: { contains: query.q, mode: "insensitive" } },
            { code: { contains: query.q, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const [items, total] = await Promise.all([
    prisma.course.findMany({
      where,
      skip,
      take: limit,
      orderBy: { [query.sortBy ?? "createdAt"]: query.sortOrder ?? "desc" },
      select: courseSelect,
    }),
    prisma.course.count({ where }),
  ]);
  return { items, meta: pageMeta(total, page, limit) };
}

export async function getCourse(id: string) {
  const course = await prisma.course.findFirst({
    where: { id, deletedAt: null },
    select: courseSelect,
  });
  if (!course) throw new ApiError(404, "Course not found");
  return course;
}

export async function updateCourse(
  id: string,
  input: {
    code?: string;
    title?: string;
    description?: string;
    credits?: number;
    departmentId?: string;
    programId?: string;
    prerequisiteIds?: string[];
  },
  actorId: string,
  ipAddress?: string,
) {
  const current = await prisma.course.findFirst({ where: { id, deletedAt: null } });
  if (!current) throw new ApiError(404, "Course not found");

  const departmentId = input.departmentId ?? current.departmentId;
  const programId = input.programId ?? current.programId;
  await assertDepartmentAndProgram(departmentId, programId);
  if (input.prerequisiteIds) await assertPrerequisites(id, input.prerequisiteIds);

  const course = await prisma.$transaction(async (tx) => {
    if (input.prerequisiteIds) {
      await tx.coursePrerequisite.deleteMany({ where: { courseId: id } });
      if (input.prerequisiteIds.length) {
        await tx.coursePrerequisite.createMany({
          data: input.prerequisiteIds.map((prerequisiteId) => ({ courseId: id, prerequisiteId })),
        });
      }
    }
    return tx.course.update({
      where: { id },
      data: {
        code: input.code,
        title: input.title,
        description: input.description,
        credits: input.credits,
        departmentId: input.departmentId,
        programId: input.programId,
      },
      select: courseSelect,
    });
  });

  await writeAudit({
    actorId,
    action: "UPDATE_COURSE",
    entity: "Course",
    entityId: id,
    metadata: input,
    ipAddress,
  });
  return course;
}

export async function softDeleteCourse(id: string, actorId: string, ipAddress?: string) {
  const course = await prisma.course.findFirst({ where: { id, deletedAt: null } });
  if (!course) throw new ApiError(404, "Course not found");

  const sectionCount = await prisma.section.count({ where: { courseId: id, deletedAt: null } });
  if (sectionCount > 0) throw new ApiError(409, "Cannot delete a course that has sections");

  await prisma.course.update({ where: { id }, data: { deletedAt: new Date() } });
  await writeAudit({
    actorId,
    action: "DELETE_COURSE",
    entity: "Course",
    entityId: id,
    ipAddress,
  });
}