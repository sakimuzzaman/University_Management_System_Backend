import { z } from "zod";

const password = z
  .string()
  .min(8)
  .max(72)
  .regex(/[a-z]/, "Password must include a lowercase letter")
  .regex(/[A-Z]/, "Password must include an uppercase letter")
  .regex(/\d/, "Password must include a number");

export const registerSchema = z.object({
  body: z.object({
    name: z.string().trim().min(2).max(100),
    email: z.string().trim().email().transform((v) => v.toLowerCase()),
    password,
    programId: z.string().uuid(),
    admissionYear: z.number().int().min(2000).max(2100),
  }),
});

export const loginSchema = z.object({
  body: z.object({
    email: z.string().trim().email().transform((v) => v.toLowerCase()),
    password: z.string().min(1),
  }),
});

export const googleSchema = z.object({
  body: z.object({
    idToken: z.string().min(20),
    programId: z.string().uuid().optional(),
    admissionYear: z.number().int().min(2000).max(2100).optional(),
  }),
});

export const refreshSchema = z.object({
  body: z.object({
    refreshToken: z.string().min(20).optional(),
  }),
});

export const logoutSchema = refreshSchema;