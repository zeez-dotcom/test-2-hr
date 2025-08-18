import { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";

export class HttpError extends Error {
  status: number;
  details?: unknown;

  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export function errorHandler(err: any, _req: Request, res: Response, _next: NextFunction) {
  const isZodError = err instanceof ZodError;
  const status = isZodError ? 400 : err.status || err.statusCode || 500;
  const message = isZodError ? "Invalid request data" : err.message || "Internal Server Error";
  const details = isZodError ? err.errors : err.details;

  const body: any = { error: { message } };
  if (details) {
    body.error.details = details;
  }

  if (details) {
    console.error("Error details:", details);
  }
  console.error(err);

  res.status(status).json(body);
}
