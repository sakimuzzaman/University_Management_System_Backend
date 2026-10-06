import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import { prisma } from "./config/prisma";
import { env } from "./config/env";
import routes from "./routes";
import { apiLimiter } from "./middlewares/rateLimiter";
import { errorHandler } from "./middlewares/errorHandler";

const app = express();

app.set("trust proxy", 1);
app.use(helmet());
app.use(
  cors({
    origin: env.CLIENT_URL,
    credentials: true,
  }),
);
app.use(cookieParser());

app.use((req, res, next) => {
  if (req.originalUrl === "/api/v1/payments/webhook") return next();
  return express.json()(req, res, next);
});

app.get("/api/v1/health", async (_req, res) => {
  let db = "disconnected";
  try {
    await prisma.$queryRaw`SELECT 1`;
    db = "connected";
  } catch {
    db = "disconnected";
  }
  res.status(200).json({
    success: true,
    message: "UMS API is running",
    data: { status: "ok", db, timestamp: new Date().toISOString() },
  });
});

app.use("/api/v1", apiLimiter, routes);

app.use((_req, res) => {
  res.status(404).json({
    success: false,
    message: "Route not found",
    errors: [],
  });
});

app.use(errorHandler);

export default app;