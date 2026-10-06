import { z } from "zod";

export const createProgramSchema = z.object({
  body: z.object({
    name: z.string().trim().min(2).max(150),
    code: z.string().trim().min(2).max(20).transform((v) => v.toUpperCase()),
    departmentId: z.string().uuid(),
    durationYears: z.number().int().min(1).max(8),
  }),
});

export const listProgramSchema = z.object({
  query: z.object({
    page: z.coerce.number().int().positive().optional(),
    limit: z.coerce.number().int().positive().max(100).optional(),
    departmentId: z.string().uuid().optional(),
  }),
});