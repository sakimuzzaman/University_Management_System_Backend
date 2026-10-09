import { prisma } from "../../config/prisma";
import { ApiError } from "../../utils/ApiError";
import { getPagination, pageMeta } from "../../utils/pagination";
import { writeAudit } from "../../utils/audit";
import { PaymentStatus, Role } from "../../generated/prisma/enums";
import { Prisma } from "../../generated/prisma/client";

type Actor = { id: string; role: Role };

export async function getDashboardStats(actorId: string, ipAddress?: string) {
  const [
    totalUsers,
    totalStudents,
    totalInstructors,
    totalAdmins,
    totalDepartments,
    totalPrograms,
    totalCourses,
    totalSemesters,
    totalSections,
    totalEnrollments,
    totalPayments,
    succeededPayments,
    pendingPayments,
    failedPayments,
    canceledPayments,
    refundedPayments,
    totalAuditLogs,
  ] = await Promise.all([
    prisma.user.count({ where: { deletedAt: null } }),
    prisma.user.count({ where: { role: Role.STUDENT, deletedAt: null } }),
    prisma.user.count({ where: { role: Role.INSTRUCTOR, deletedAt: null } }),
    prisma.user.count({ where: { role: Role.ADMIN, deletedAt: null } }),
    prisma.department.count({ where: { deletedAt: null } }),
    prisma.program.count({ where: { deletedAt: null } }),
    prisma.course.count({ where: { deletedAt: null } }),
    prisma.semester.count({ where: { deletedAt: null } }),
    prisma.section.count({ where: { deletedAt: null } }),
    prisma.enrollment.count({ where: { deletedAt: null } }),
    prisma.payment.count(),
    prisma.payment.count({ where: { status: PaymentStatus.SUCCEEDED } }),
    prisma.payment.count({ where: { status: PaymentStatus.PENDING } }),
    prisma.payment.count({ where: { status: PaymentStatus.FAILED } }),
    prisma.payment.count({ where: { status: PaymentStatus.CANCELED } }),
    prisma.payment.count({ where: { status: PaymentStatus.REFUNDED } }),
    prisma.auditLog.count(),
  ]);

  const revenue = await prisma.payment.aggregate({
    where: { status: PaymentStatus.SUCCEEDED },
    _sum: { amount: true },
  });

  await writeAudit({
    actorId,
    action: "VIEW_DASHBOARD_STATS",
    entity: "Admin",
    entityId: actorId,
    ipAddress,
    metadata: { accessedAt: new Date().toISOString() },
  });

  return {
    users: {
      total: totalUsers,
      students: totalStudents,
      instructors: totalInstructors,
      admins: totalAdmins,
    },
    academic: {
      departments: totalDepartments,
      programs: totalPrograms,
      courses: totalCourses,
      semesters: totalSemesters,
      sections: totalSections,
      enrollments: totalEnrollments,
    },
    payments: {
      total: totalPayments,
      succeeded: succeededPayments,
      pending: pendingPayments,
      failed: failedPayments,
      canceled: canceledPayments,
      refunded: refundedPayments,
      totalRevenueUSD: revenue._sum.amount ? Number(revenue._sum.amount) : 0,
    },
    auditLogs: {
      total: totalAuditLogs,
    },
  };
}

export async function listUsers(
  query: {
    page?: number;
    limit?: number;
    role?: Role;
    search?: string;
    isActive?: string;
  },
  actorId: string,
  ipAddress?: string
) {
  const { page, limit, skip } = getPagination(query);

  const where: Prisma.UserWhereInput = {
    deletedAt: null,
    ...(query.role ? { role: query.role } : {}),
    ...(query.isActive === "true" ? { isActive: true } : {}),
    ...(query.isActive === "false" ? { isActive: false } : {}),
    ...(query.search
      ? {
          OR: [
            { name: { contains: query.search, mode: "insensitive" } },
            { email: { contains: query.search, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
        googleId: true,
        avatar: true,
        createdAt: true,
        updatedAt: true,
        studentProfile: {
          select: {
            studentId: true,
            program: { select: { name: true, code: true } },
          },
        },
        instructorProfile: {
          select: {
            employeeId: true,
            designation: true,
            department: { select: { name: true, code: true } },
          },
        },
      },
    }),
    prisma.user.count({ where }),
  ]);

  await writeAudit({
    actorId,
    action: "LIST_USERS",
    entity: "User",
    ipAddress,
    metadata: { query },
  });

  return { users, meta: pageMeta(total, page, limit) };
}

export async function getUserById(id: string) {
  const user = await prisma.user.findFirst({
    where: { id, deletedAt: null },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      isActive: true,
      googleId: true,
      avatar: true,
      createdAt: true,
      updatedAt: true,
      studentProfile: true,
      instructorProfile: true,
      payments: {
        take: 5,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          amount: true,
          status: true,
          semester: { select: { name: true, code: true } },
          createdAt: true,
        },
      },
    },
  });

  if (!user) throw new ApiError(404, "User not found");
  return user;
}

export async function updateUserRole(
  id: string,
  role: Role,
  actor: Actor,
  ipAddress?: string
) {
  if (actor.id === id) {
    throw new ApiError(400, "You cannot change your own role");
  }

  const user = await prisma.user.findFirst({
    where: { id, deletedAt: null },
    select: { id: true, role: true, email: true, name: true },
  });

  if (!user) throw new ApiError(404, "User not found");

  if (user.role === role) {
    throw new ApiError(409, "User already has this role");
  }

  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.user.update({
      where: { id },
      data: { role },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
      },
    });

    await tx.auditLog.create({
      data: {
        actorId: actor.id,
        action: "CHANGE_USER_ROLE",
        entity: "User",
        entityId: id,
        ipAddress: ipAddress ?? null,
        metadata: {
          from: user.role,
          to: role,
          targetUserEmail: user.email,
        },
      },
    });

    return result;
  });

  return updated;
}

export async function toggleUserStatus(
  id: string,
  isActive: boolean,
  actor: Actor,
  ipAddress?: string
) {
  if (actor.id === id) {
    throw new ApiError(400, "You cannot deactivate or activate your own account");
  }

  const user = await prisma.user.findFirst({
    where: { id, deletedAt: null },
    select: { id: true, isActive: true, email: true },
  });

  if (!user) throw new ApiError(404, "User not found");

  if (user.isActive === isActive) {
    throw new ApiError(409, `User is already ${isActive ? "active" : "inactive"}`);
  }

  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.user.update({
      where: { id },
      data: { isActive },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
      },
    });

    await tx.auditLog.create({
      data: {
        actorId: actor.id,
        action: isActive ? "ACTIVATE_USER" : "DEACTIVATE_USER",
        entity: "User",
        entityId: id,
        ipAddress: ipAddress ?? null,
        metadata: {
          targetUserEmail: user.email,
        },
      },
    });

    return result;
  });

  return updated;
}

export async function listAuditLogs(
  query: {
    page?: number;
    limit?: number;
    actorId?: string;
    entity?: string;
    action?: string;
  },
  actorId: string,
  ipAddress?: string
) {
  const { page, limit, skip } = getPagination(query);

  const where: Prisma.AuditLogWhereInput = {
    ...(query.actorId ? { actorId: query.actorId } : {}),
    ...(query.entity ? { entity: { contains: query.entity, mode: "insensitive" } } : {}),
    ...(query.action ? { action: { contains: query.action, mode: "insensitive" } } : {}),
  };

  const [logs, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        actorId: true,
        action: true,
        entity: true,
        entityId: true,
        metadata: true,
        ipAddress: true,
        createdAt: true,
        actor: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
          },
        },
      },
    }),
    prisma.auditLog.count({ where }),
  ]);

  await writeAudit({
    actorId,
    action: "VIEW_AUDIT_LOGS",
    entity: "AuditLog",
    ipAddress,
  });

  return { logs, meta: pageMeta(total, page, limit) };
}