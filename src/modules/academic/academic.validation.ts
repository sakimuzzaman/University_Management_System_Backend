
import { z } from "zod";
import { AttendanceStatus, 
         EnrollmentStatus, 
         ExamType, 
         SemesterStatus } from "../../generated/prisma/enums";

const uuid = z.string().uuid();
const page = z.coerce.number().int().positive().optional();
const limit = z.coerce.number().int().positive().max(100).optional();

const dateOnly = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")
  .transform((value) => new Date(`${value}T00:00:00.000Z`))
  .refine((value) => !Number.isNaN(value.getTime()), "Invalid date");

export const createSemesterSchema = z.object({
  body: z
    .object({
      name: z.string().trim().min(2).max(100),
      code: z.string().trim().min(2).max(20).transform((v) => v.toUpperCase()),
      startDate: z.coerce.date(),
      endDate: z.coerce.date(),
      tuitionFee: z.number().positive().max(10_000_000),
      maxCredits: z.number().int().min(1).max(40).optional(),
    })
    .refine((value) => value.endDate > value.startDate, {
      path: ["endDate"],
      message: "End date must be after start date",
    }),
});

export const listSemestersSchema = z.object({
  query: z.object({
    page,
    limit,
    status: z.nativeEnum(SemesterStatus).optional(),
  }),
});

export const semesterIdSchema = z.object({
  params: z.object({ id: uuid }),
});

export const updateSemesterSchema = z.object({
  params: z.object({ id: uuid }),
  body: z
    .object({
      name: z.string().trim().min(2).max(100).optional(),
      startDate: z.coerce.date().optional(),
      endDate: z.coerce.date().optional(),
      tuitionFee: z.number().positive().max(10_000_000).optional(),
      maxCredits: z.number().int().min(1).max(40).optional(),
    })
    .refine((value) => Object.keys(value).length > 0, {
      message: "At least one field is required",
    }),
});

export const updateSemesterStatusSchema = z.object({
  params: z.object({ id: uuid }),
  body: z.object({ status: z.nativeEnum(SemesterStatus) }),
});

export const createSectionSchema = z.object({
  body: z.object({
    courseId: uuid,
    semesterId: uuid,
    instructorProfileId: uuid.optional(),
    sectionCode: z.string().trim().min(1).max(10).transform((v) => v.toUpperCase()),
    capacity: z.number().int().min(1).max(500),
    schedule: z.string().trim().max(200).optional(),
  }),
});

export const listSectionsSchema = z.object({
  query: z.object({
    page,
    limit,
    semesterId: uuid.optional(),
    courseId: uuid.optional(),
    instructorId: uuid.optional(),
    q: z.string().trim().min(1).optional(),
  }),
});

export const sectionIdSchema = z.object({
  params: z.object({ id: uuid }),
});

export const updateSectionSchema = z.object({
  params: z.object({ id: uuid }),
  body: z
    .object({
      capacity: z.number().int().min(1).max(500).optional(),
      schedule: z.string().trim().max(200).nullable().optional(),
    })
    .refine((value) => Object.keys(value).length > 0, {
      message: "At least one field is required",
    }),
});

export const assignInstructorSchema = z.object({
  params: z.object({ id: uuid }),
  body: z.object({ instructorProfileId: uuid.nullable() }),
});

export const enrollSchema = z.object({
  body: z.object({ sectionId: uuid }),
});

export const myEnrollmentsSchema = z.object({
  query: z.object({
    page,
    limit,
    semesterId: uuid.optional(),
    status: z.nativeEnum(EnrollmentStatus).optional(),
  }),
});

export const enrollmentIdSchema = z.object({
  params: z.object({ id: uuid }),
});

const attendanceRecords = z
  .array(
    z.object({
      studentId: uuid,
      status: z.nativeEnum(AttendanceStatus),
    }),
  )
  .min(1)
  .max(200)
  .superRefine((records, ctx) => {
    const ids = records.map((record) => record.studentId);
    if (new Set(ids).size !== ids.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "A student may appear only once per attendance request",
      });
    }
  });

export const markAttendanceSchema = z.object({
  params: z.object({ sectionId: uuid }),
  body: z.object({
    date: dateOnly,
    records: attendanceRecords,
  }),
});

export const listSectionAttendanceSchema = z.object({
  params: z.object({ sectionId: uuid }),
  query: z.object({
    page,
    limit,
    date: dateOnly.optional(),
    studentId: uuid.optional(),
  }),
});

export const listMyAttendanceSchema = z.object({
  query: z.object({
    page,
    limit,
    semesterId: uuid.optional(),
  }),
});

export const createExamSchema = z.object({
  params: z.object({ sectionId: uuid }),
  body: z.object({
    title: z.string().trim().min(2).max(120),
    type: z.nativeEnum(ExamType),
    examDate: z.coerce.date(),
    maxMarks: z.number().positive().max(100_000),
    weight: z.number().positive().max(100),
  }),
});

export const listSectionExamsSchema = z.object({
  params: z.object({ sectionId: uuid }),
});

export const examIdSchema = z.object({
  params: z.object({ examId: uuid }),
});

const resultEntries = z
  .array(
    z.object({
      studentId: uuid,
      marks: z.number().min(0).max(100_000),
      remarks: z.string().trim().max(500).optional(),
    }),
  )
  .min(1)
  .max(500)
  .superRefine((entries, ctx) => {
    const ids = entries.map((entry) => entry.studentId);
    if (new Set(ids).size !== ids.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "A student may appear only once per results request",
      });
    }
  });

export const saveResultsSchema = z.object({
  params: z.object({ examId: uuid }),
  body: z.object({ entries: resultEntries }),
});

export const listExamResultsSchema = z.object({
  params: z.object({ examId: uuid }),
  query: z.object({ page, limit }),
});

export const listMyResultsSchema = z.object({
  query: z.object({
    page,
    limit,
    semesterId: uuid.optional(),
  }),
});