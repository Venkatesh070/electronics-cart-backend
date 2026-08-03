import { NextFunction, Request, Response } from "express";
import multer from "multer";
import { ApiError } from "../utils/ApiError";

export function notFound(req: Request, _res: Response, next: NextFunction) {
  next(new ApiError(404, `Route not found: ${req.originalUrl}`));
}

export function errorHandler(
  err: Error | ApiError,
  _req: Request,
  res: Response,
  _next: NextFunction
) {
  let statusCode = err instanceof ApiError ? err.statusCode : 500;
  let message = err.message || "Internal server error";

  if (err instanceof multer.MulterError) {
    statusCode = 400;
    message = err.code === "LIMIT_FILE_SIZE" ? "Image must be 5MB or smaller" : err.message;
  }

  // Mongoose validation / cast errors
  if (err.name === "ValidationError") {
    statusCode = 400;
    const details = Object.values((err as Error & { errors?: Record<string, { message: string }> }).errors || {})
      .map((e) => e.message)
      .filter(Boolean);
    if (details.length) message = details.join("; ");
  } else if (err.name === "CastError") {
    statusCode = 400;
    message = "Invalid id";
  }

  if (statusCode === 500) {
    console.error(err);
  }

  res.status(statusCode).json({ success: false, message });
}
