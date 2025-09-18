import { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";

export class HttpError extends Error {
  status: number;
  details?: unknown;
  code?: string;

  constructor(status: number, message: string, details?: unknown, code?: string) {
    super(message);
    this.status = status;
    this.details = details;
    this.code = code;
  }
}

export function errorHandler(err: any, _req: Request, res: Response, _next: NextFunction) {
  const isZodError = err instanceof ZodError;
  const status = isZodError ? 400 : err.status || err.statusCode || 500;
  const message = isZodError ? "Invalid request data" : err.message || "Internal Server Error";
  const details = isZodError
    ? err.errors
    : err.details ?? (err instanceof Error ? err : undefined);

  const body: any = { error: { message } };
  if (err.code) {
    body.error.code = err.code;
  }

  if (isZodError) {
    body.error.fields = err.errors.map((issue: any) => ({
      path: issue.path.join("."),
      message: issue.message,
    }));
  }

  if (process.env.NODE_ENV !== "production") {
    body.error.status = status;
    if (details) {
      body.error.details =
        details instanceof Error
          ? { message: details.message, stack: details.stack }
          : details;
    }
  }

  const isServerError = status >= 500;
  const log = isServerError ? console.error : console.warn;

  if (details) {
    log("Error details:", JSON.stringify(details, null, 2));
  }

  if (isServerError) {
    console.error(err);
  } else if (process.env.NODE_ENV !== "production") {
    console.warn(err instanceof Error ? err.message : err);
  }

  res.status(status).json(body);
}
