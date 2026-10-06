import { z } from "zod";

export const updateMeSchema = z.object({
  body: z
    .object({
      name: z.string().trim().min(2).max(100).optional(),
      avatar: z.string().url().optional(),
    })
    .refine((body) => Object.keys(body).length > 0, "At least one field is required"),
});

export const studentProfileSchema = z.object({
  body: z.object({
    programId: z.string().uuid(),
    admissionYear: z.number().int().min(2000).max(2100),
  }),
});