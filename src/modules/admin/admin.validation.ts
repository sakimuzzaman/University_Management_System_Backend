
import { z } from "zod";
import { Role } from "../../generated/prisma/enums";

const uuid = z.string().uuid();
const page = z.coerce.number().int().positive().optional();
const limit = z.coerce.number().int().positive().max(100).optional();

export const listUsersSchema = z.object({
  query: z.object({
    page,
    limit,
    role: z.nativeEnum(Role).optional(),
    search: z.string().trim().min(1).optional(),
    isActive: z.enum(["true", "false"]).optional(),
  }),
});

export const userIdSchema = z.object({
  params: z.object({ id: uuid }),
});

export const updateUserRoleSchema = z.object({
  params: z.object({ id: uuid }),
  body: z.object({
    role: z.nativeEnum(Role),
  }),
});

export const toggleUserStatusSchema = z.object({
  params: z.object({ id: uuid }),
  body: z.object({
    isActive: z.boolean(),
  }),
});

export const listAuditLogsSchema = z.object({
  query: z.object({
    page,
    limit,
    actorId: uuid.optional(),
    entity: z.string().trim().min(1).optional(),
    action: z.string().trim().min(1).optional(),
  }),
});