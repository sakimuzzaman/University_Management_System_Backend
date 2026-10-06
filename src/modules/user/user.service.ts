import crypto from "crypto";
import { prisma } from "../../config/prisma";
import { ApiError } from "../../utils/ApiError";
import { writeAudit } from "../../utils/audit";
import { Role } from "../../generated/prisma/enums";

const userSelect = {
  id: true,
  email: true,
  name: true,
  role: true,
  avatar: true,
  isActive: true,
  createdAt: true,
  studentProfile: {
    select: {
      id: true,
      studentId: true,
      programId: true,
      admissionYear: true,
      program: { select: { id: true, name: true, code: true } },
    },
  },
  instructorProfile: {
    select: {
      id: true,
      employeeId: true,
      designation: true,
      department: { select: { id: true, name: true, code: true } },
    },
  },
};

export async function getMe(userId: string) {
  const user = await prisma.user.findFirst({
    where: { id: userId, deletedAt: null },
    select: userSelect,
  });
  if (!user) throw new ApiError(404, "User not found");
  return user;
}

export async function updateMe(userId: string, input: { name?: string; avatar?: string }, ipAddress?: string) {
  const user = await prisma.user.update({
    where: { id: userId },
    data: input,
    select: userSelect,
  });
  await writeAudit({
    actorId: userId,
    action: "UPDATE_PROFILE",
    entity: "User",
    entityId: userId,
    metadata: input,
    ipAddress,
  });
  return user;
}

export async function createStudentProfile(
  userId: string,
  role: Role,
  input: { programId: string; admissionYear: number },
  ipAddress?: string,
) {
  if (role !== Role.STUDENT) throw new ApiError(403, "Only students can create a student profile");

  const existing = await prisma.studentProfile.findUnique({ where: { userId } });
  if (existing) throw new ApiError(409, "Student profile already exists");

  const program = await prisma.program.findFirst({
    where: { id: input.programId, deletedAt: null },
  });
  if (!program) throw new ApiError(404, "Program not found");

  const profile = await prisma.studentProfile.create({
    data: {
      userId,
      programId: input.programId,
      admissionYear: input.admissionYear,
      studentId: `STU-${input.admissionYear}-${crypto.randomInt(100000, 999999)}`,
    },
    select: {
      id: true,
      studentId: true,
      programId: true,
      admissionYear: true,
      program: { select: { id: true, name: true, code: true } },
    },
  });

  await writeAudit({
    actorId: userId,
    action: "CREATE_STUDENT_PROFILE",
    entity: "StudentProfile",
    entityId: profile.id,
    ipAddress,
  });
  return profile;
}