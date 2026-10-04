import crypto from "crypto";
import jwt from "jsonwebtoken";
// import { Role } from "@prisma/client";
import { env } from "../config/env";
import { Role } from "../generated/prisma/enums";

export interface AccessTokenPayload {
  sub: string;
  email: string;
  role: Role;
}

export function signAccessToken(payload: AccessTokenPayload) {
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, {
    expiresIn: env.JWT_ACCESS_EXPIRES_IN as jwt.SignOptions["expiresIn"],
  });
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET);
  if (typeof decoded === "string" || !decoded.sub || !decoded.email || !decoded.role) {
    throw new Error("Invalid token payload");
  }
  return {
    sub: decoded.sub,
    email: String(decoded.email),
    role: decoded.role as Role,
  };
}

export function generateRefreshToken() {
  return crypto.randomBytes(48).toString("hex");
}

export function hashToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function refreshExpiryDate() {
  const match = /^(\d+)([dhms])$/.exec(env.JWT_REFRESH_EXPIRES_IN);
  const now = Date.now();
  if (!match) return new Date(now + 7 * 24 * 60 * 60 * 1000);
  const amount = Number(match[1]);
  const unit = match[2];
  const ms =
    unit === "d" ? amount * 86_400_000 :
    unit === "h" ? amount * 3_600_000 :
    unit === "m" ? amount * 60_000 :
    amount * 1000;
  return new Date(now + ms);
}