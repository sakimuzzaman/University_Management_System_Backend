import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";

import { prisma } from "./config/prisma.js";
import { env } from "./config/env.js";

import { apiLimiter } from "./middlewares/rateLimiter.js";
import { errorHandler } from "./middlewares/errorHandler.js";
import { webhook as stripeWebhook } from "./modules/payment/payment.controller.js";
import router from "./routes/index.js";

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

// Temporary request logger to help debug Vercel routing.
// Check Vercel Runtime Logs after making a request.
app.use((req, _res, next) => {
  console.log("[UMS REQUEST DEBUG]", {
    method: req.method,
    url: req.url,
    originalUrl: req.originalUrl,
    path: req.path,
  });

  next();
});

// Root endpoint: confirms that this Express app is running.
app.get("/", (_req, res) => {
  res.status(200).json({
    success: true,
    message: "University Management System API is running",
    marker: "ums-debug-2026",
  });
});

// Temporary diagnostic endpoint: tests Express route matching.
app.get("/api/v1/debug-route", (_req, res) => {
  res.status(200).json({
    success: true,
    message: "Correct Express app is running",
    marker: "ums-debug-2026",
  });
});

// Stripe webhook must receive the raw body for signature verification.
// Keep it before the general JSON body parser and rate limiter.
app.use(
  "/api/v1/payments/webhook",
  express.raw({ type: "application/json" }),
);

app.post("/api/v1/payments/webhook", stripeWebhook);

// Parse JSON for other routes, preserving the Stripe raw-body behavior.
app.use((req, res, next) => {
  if (req.originalUrl === "/api/v1/payments/webhook") {
    return next();
  }

  return express.json()(req, res, next);
});

// Health endpoint: checks both the app and the database connection.
app.get("/api/v1/health", async (_req, res) => {
  let db: "connected" | "disconnected" = "disconnected";

  try {
    await prisma.$queryRaw`SELECT 1`;
    db = "connected";
  } catch (error) {
    console.error("[UMS HEALTH CHECK] Database connection failed:", error);
  }

  res.status(200).json({
    success: true,
    message: "UMS API is running",
    data: {
      status: "ok",
      db,
      timestamp: new Date().toISOString(),
    },
  });
});

// Application API routes.
app.use("/api/v1", apiLimiter, router);

// Return a consistent JSON response for unmatched routes.
app.use((_req, res) => {
  res.status(404).json({
    success: false,
    message: "Route not found",
    errors: [],
  });
});

// Error handler must remain last.
app.use(errorHandler);

export default app;
