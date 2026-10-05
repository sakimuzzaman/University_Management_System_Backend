import rateLimit from "express-rate-limit";
import { env } from "../config/env";

const handler = (_req: unknown, res: any) => {
  res.status(429).json({
    success: false,
    message: "Too many requests, please try again later",
    errors: [],
  });
};

export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: env.NODE_ENV === "production" ? 200 : 1000,
  standardHeaders: true,
  legacyHeaders: false,
  handler,
});

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: env.NODE_ENV === "production" ? 20 : 100,
  standardHeaders: true,
  legacyHeaders: false,
  handler,
});