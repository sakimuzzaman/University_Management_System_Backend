import crypto from "crypto";
import { OAuth2Client } from "google-auth-library";
import { prisma } from "../../config/prisma";
import { env } from "../../config/env";
import { ApiError } from "../../utils/ApiError";
import { hashPassword, verifyPassword } from "../../utils/password";
import {
  generateRefreshToken,
  hashToken,
  refreshExpiryDate,
  signAccessToken,
} from "../../utils/jwt";
import { writeAudit } from "../../utils/audit";
import { Prisma, Role } from "../../generated/prisma/client";

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
      departmentId: true,
      department: { select: { id: true, name: true, code: true } },
    },
  },
} satisfies Prisma.UserSelect;

async function issueRefreshToken(userId: string) {
  const refreshToken = generateRefreshToken();
  await prisma.refreshToken.create({
    data: {
      userId,
      token: hashToken(refreshToken),
      expiresAt: refreshExpiryDate(),
    },
  });
  return refreshToken;
}

function tokenPair(user: { id: string; email: string; role: Role }, refreshToken: string) {
  return {
    accessToken: signAccessToken({ sub: user.id, email: user.email, role: user.role }),
    refreshToken,
  };
}

async function generateStudentId(tx: Prisma.TransactionClient, year: number) {
  for (let i = 0; i < 5; i++) {
    const studentId = `STU-${year}-${crypto.randomInt(100000, 999999)}`;
    const exists = await tx.studentProfile.findUnique({ where: { studentId } });
    if (!exists) return studentId;
  }
  throw new ApiError(500, "Could not generate a student ID");
}

export async function register(input: {
  name: string;
  email: string;
  password: string;
  programId: string;
  admissionYear: number;
  ipAddress?: string;
}) {
  const program = await prisma.program.findFirst({
    where: { id: input.programId, deletedAt: null },
  });
  if (!program) throw new ApiError(404, "Program not found");

  const passwordHash = await hashPassword(input.password);

  try {
    const user = await prisma.$transaction(async (tx) => {
      const studentId = await generateStudentId(tx, input.admissionYear);
      return tx.user.create({
        data: {
          email: input.email,
          password: passwordHash,
          name: input.name,
          role: Role.STUDENT,
          studentProfile: {
            create: {
              studentId,
              programId: input.programId,
              admissionYear: input.admissionYear,
            },
          },
        },
        select: userSelect,
      });
    });

    await writeAudit({
      actorId: user.id,
      action: "REGISTER",
      entity: "User",
      entityId: user.id,
      ipAddress: input.ipAddress,
    });

    const refreshToken = await issueRefreshToken(user.id);
    return { user, ...tokenPair(user, refreshToken) };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new ApiError(409, "Email already registered");
    }
    throw error;
  }
}

export async function login(input: { email: string; password: string; ipAddress?: string }) {
  const user = await prisma.user.findFirst({
    where: { email: input.email, deletedAt: null },
    select: { ...userSelect, password: true },
  });

  const valid = await verifyPassword(input.password, user?.password ?? null);
  if (!user || !valid) throw new ApiError(401, "Invalid email or password");
  if (!user.isActive) throw new ApiError(403, "Account is disabled");

  const { password: _password, ...safe } = user;
  await writeAudit({
    actorId: user.id,
    action: "LOGIN",
    entity: "User",
    entityId: user.id,
    ipAddress: input.ipAddress,
  });

  const refreshToken = await issueRefreshToken(user.id);
  return { user: safe, ...tokenPair(user, refreshToken) };
}

export async function loginWithGoogle(input: {
  idToken: string;
  programId?: string;
  admissionYear?: number;
  ipAddress?: string;
}) {
  if (!env.GOOGLE_CLIENT_ID) throw new ApiError(500, "Google login is not configured");

  const client = new OAuth2Client(env.GOOGLE_CLIENT_ID);
  const ticket = await client.verifyIdToken({
    idToken: input.idToken,
    audience: env.GOOGLE_CLIENT_ID,
  });
  const payload = ticket.getPayload();
  if (!payload?.email || !payload.sub || payload.email_verified === false) {
    throw new ApiError(401, "Invalid Google token");
  }

  const email = payload.email.toLowerCase();
  let user = await prisma.user.findFirst({
    where: { OR: [{ googleId: payload.sub }, { email }], deletedAt: null },
    select: userSelect,
  });

  if (user && !user.isActive) throw new ApiError(403, "Account is disabled");

  if (!user) {
    let studentCreate: Prisma.StudentProfileUncheckedCreateWithoutUserInput | undefined;
    if (input.programId) {
      const program = await prisma.program.findFirst({
        where: { id: input.programId, deletedAt: null },
      });
      if (!program) throw new ApiError(404, "Program not found");
      const year = input.admissionYear ?? new Date().getFullYear();
      studentCreate = {
        studentId: `STU-${year}-${crypto.randomInt(100000, 999999)}`,
        programId: input.programId,
        admissionYear: year,
      };
    }

    user = await prisma.user.create({
      data: {
        email,
        name: payload.name || email,
        googleId: payload.sub,
        avatar: payload.picture,
        role: Role.STUDENT,
        ...(studentCreate ? { studentProfile: { create: studentCreate } } : {}),
      },
      select: userSelect,
    });
  } else if (!user) {
    throw new ApiError(401, "Invalid Google token");
  } else {
    await prisma.user.update({
      where: { id: user.id },
      data: {
        googleId: payload.sub,
        avatar: user.avatar ?? payload.picture,
      },
    });
  }

  await writeAudit({
    actorId: user.id,
    action: "GOOGLE_LOGIN",
    entity: "User",
    entityId: user.id,
    ipAddress: input.ipAddress,
  });

  const refreshToken = await issueRefreshToken(user.id);
  return {
    user,
    profileComplete: user.role !== Role.STUDENT || Boolean(user.studentProfile),
    ...tokenPair(user, refreshToken),
  };
}

export async function refresh(rawToken?: string) {
  if (!rawToken) throw new ApiError(401, "Refresh token required");

  const existing = await prisma.refreshToken.findUnique({
    where: { token: hashToken(rawToken) },
  });
  if (!existing) throw new ApiError(401, "Invalid refresh token");

  if (existing.revokedAt) {
    await prisma.refreshToken.updateMany({
      where: { userId: existing.userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    throw new ApiError(401, "Refresh token reuse detected. All sessions were revoked");
  }

  if (existing.expiresAt < new Date()) throw new ApiError(401, "Refresh token expired");

  const user = await prisma.user.findFirst({
    where: { id: existing.userId, deletedAt: null, isActive: true },
    select: userSelect,
  });
  if (!user) throw new ApiError(401, "Invalid refresh token");

  const refreshToken = generateRefreshToken();
  await prisma.$transaction([
    prisma.refreshToken.update({
      where: { id: existing.id },
      data: { revokedAt: new Date() },
    }),
    prisma.refreshToken.create({
      data: {
        userId: user.id,
        token: hashToken(refreshToken),
        expiresAt: refreshExpiryDate(),
      },
    }),
  ]);

  return { user, ...tokenPair(user, refreshToken) };
}

export async function logout(userId: string, rawToken?: string, ipAddress?: string) {
  if (rawToken) {
    await prisma.refreshToken.updateMany({
      where: { userId, token: hashToken(rawToken), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  } else {
    await prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  await writeAudit({
    actorId: userId,
    action: "LOGOUT",
    entity: "User",
    entityId: userId,
    ipAddress,
  });
}