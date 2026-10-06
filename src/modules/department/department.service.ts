import { prisma } from "../../config/prisma";
import { getPagination, pageMeta } from "../../utils/pagination";
import { writeAudit } from "../../utils/audit";

export async function createDepartment(
  input: { name: string; code: string; description?: string },
  actorId: string,
  ipAddress?: string,
) {
  const department = await prisma.department.create({ data: input });
  await writeAudit({
    actorId,
    action: "CREATE_DEPARTMENT",
    entity: "Department",
    entityId: department.id,
    ipAddress,
  });
  return department;
}

export async function listDepartments(query: { page?: number; limit?: number }) {
  const { page, limit, skip } = getPagination(query);
  const where = { deletedAt: null };
  const [items, total] = await Promise.all([
    prisma.department.findMany({
      where,
      skip,
      take: limit,
      orderBy: { name: "asc" },
      select: { id: true, name: true, code: true, description: true, createdAt: true },
    }),
    prisma.department.count({ where }),
  ]);
  return { items, meta: pageMeta(total, page, limit) };
}