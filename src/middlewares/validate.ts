import { NextFunction, Request, Response } from "express";
import { ZodSchema } from "zod";
import { ApiError } from "../utils/ApiError";

export const validate =
  (schema: ZodSchema) => (req: Request, _res: Response, next: NextFunction) => {
    const parsed = schema.safeParse({
      body: req.body,
      query: req.query,
      params: req.params,
    });

    if (!parsed.success) {
      const errors = parsed.error.issues.map((issue) => ({
        path: issue.path.slice(1).join(".") || "body",
        message: issue.message,
      }));
      return next(new ApiError(400, "Validation failed", errors));
    }

    req.validated = parsed.data;
    if (parsed.data.body) req.body = parsed.data.body;
    next();
  };