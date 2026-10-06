import { z } from "zod";

const courseBody = z.object({
  code: z.string().trim().min(2).max(20).transform((v) => v.toUpperCase()),
  title: z.string().trim().min(2).max(150),
  description: z.string().trim().max(1000).optional(),
  credits: z.number().int().min(1).max(6),
  departmentId: z.string().uuid(),
  programId: z.string().uuid(),
  prerequisiteIds: z.array(z.string().uuid()).optional(),
});

export const createCourseSchema = z.object({ body: courseBody });

export const updateCourseSchema = z.object({
  params: z.object({ id: z.string().uuid() }),
  body: courseBody.partial().refine((body) => Object.keys(body).length > 0, "At least one field is required"),
});

export const courseIdSchema = z.object({
  params: z.object({ id: z.string().uuid() }),
});

export const listCourseSchema = z.object({
  query: z.object({
    page: z.coerce.number().int().positive().optional(),
    limit: z.coerce.number().int().positive().max(100).optional(),
    q: z.string().trim().min(1).optional(),
    departmentId: z.string().uuid().optional(),
    programId: z.string().uuid().optional(),
    sortBy: z.enum(["createdAt", "title", "code", "credits"]).optional(),
    sortOrder: z.enum(["asc", "desc"]).optional(),
  }),
});