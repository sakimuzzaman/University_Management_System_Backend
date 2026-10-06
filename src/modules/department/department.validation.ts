import { z } from "zod";

export const createDepartmentSchema = z.object({
  body: z.object({
    name: z.string().trim().min(2).max(120),
    code: z.string().trim().min(2).max(10).transform((v) => v.toUpperCase()),
    description: z.string().trim().max(500).optional(),
  }),
});

export const listSchema = z.object({
  query: z.object({
    page: z.coerce.number().int().positive().optional(),
    limit: z.coerce.number().int().positive().max(100).optional(),
  }),
});