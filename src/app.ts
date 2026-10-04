import express from "express";
import cors from "cors";
import helmet from "helmet";
import { prisma } from "./config/prisma";

const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json());

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
    data: {
      status: "ok",
      db,
      timestamp: new Date().toISOString(),
    },
  });
});

app.use((_req, res) => {
  res.status(404).json({
    success: false,
    message: "Route not found",
    errors: [],
  });
});

export default app;