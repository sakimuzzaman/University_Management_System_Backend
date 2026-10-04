// import { Prisma } from "@prisma/client";
import { prisma } from "../config/prisma";
import { Prisma } from "../generated/prisma/client";

export async function writeAudit(input: {
  actorId?: string | null;
  action: string;
  entity: string;
  entityId?: string | null;
  metadata?: Prisma.InputJsonValue;
  ipAddress?: string | null;
}) {
  await prisma.auditLog.create({
    data: {
      actorId: input.actorId ?? null,
      action: input.action,
      entity: input.entity,
      entityId: input.entityId ?? null,
      metadata: input.metadata,
      ipAddress: input.ipAddress ?? null,
    },
  });
}