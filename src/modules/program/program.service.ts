import { prisma } from "../../config/prisma";
import { ApiError } from "../../utils/ApiError";
import { getPagination, pageMeta } from "../../utils/pagination";
import { writeAudit } from "../../utils/audit";

export async function createProgram(
  input: { name: string; code: string; departmentId: string; durationYears: number },
  actorId: string,
  ipAddress?: string,
) {
  const department = await prisma.department.findFirst({
    where: { id: input.departmentId, deletedAt: null },
  });
  if (!department) throw new ApiError(404, "Department not found");

  const program = await prisma.program.create({
    data: input,
    select: {
      id: true,
      name: true,
      code: true,
      durationYears: true,
      department: { select: { id: true, name: true, code: true } },
      createdAt: true,
    },
  });
  await writeAudit({
    actorId,
    action: "CREATE_PROGRAM",
    entity: "Program",
    entityId: program.id,
    ipAddress,
  });
  return program;
}

export async function listPrograms(query: { page?: number; limit?: number; departmentId?: string }) {
  const { page, limit, skip } = getPagination(query);
  const where = {
    deletedAt: null,
    ...(query.departmentId ? { departmentId: query.departmentId } : {}),
  };
  const [items, total] = await Promise.all([
    prisma.program.findMany({
      where,
      skip,
      take: limit,
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        code: true,
        durationYears: true,
        department: { select: { id: true, name: true, code: true } },
      },
    }),
    prisma.program.count({ where }),
  ]);
  return { items, meta: pageMeta(total, page, limit) };
}