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

const formatBytes = (bytes?: number) => {
  if (typeof bytes !== "number" || Number.isNaN(bytes)) {
    return undefined;
  }
  const mb = bytes / (1024 * 1024);
  if (mb >= 1) {
    return `${parseFloat(mb.toFixed(2)).toString()}MB`;
  }
  const kb = bytes / 1024;
  if (kb >= 1) {
    return `${parseFloat(kb.toFixed(2)).toString()}KB`;
  }
  return `${bytes}B`;
};

export function errorHandler(err: any, _req: Request, res: Response, _next: NextFunction) {
  let handledError: any = err;

  if (err?.type === "entity.too.large") {
    const limitBytes = typeof err.limit === "number" ? err.limit : undefined;
    const lengthBytes =
      typeof err.length === "number"
        ? err.length
        : typeof err.expected === "number"
          ? err.expected
          : undefined;
    const formattedLimit = formatBytes(limitBytes);
    const message = formattedLimit
      ? `Request body exceeds the ${formattedLimit} limit.`
      : "Request body is too large.";

    handledError = new HttpError(413, message, {
      limit: limitBytes,
      length: lengthBytes,
      type: err.type,
    });
  }

  const isZodError = handledError instanceof ZodError;
  const status = isZodError ? 400 : handledError.status || handledError.statusCode || 500;
  const message = isZodError ? "Invalid request data" : handledError.message || "Internal Server Error";
  const details = isZodError
    ? handledError.errors
    : handledError.details ?? (handledError instanceof Error ? handledError : undefined);

  const body: any = { error: { message } };
  if (handledError.code) {
    body.error.code = handledError.code;
  }

  if (isZodError) {
    body.error.fields = handledError.errors.map((issue: any) => ({
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
    console.error(handledError);
  } else if (process.env.NODE_ENV !== "production") {
    console.warn(handledError instanceof Error ? handledError.message : handledError);
  }

  res.status(status).json(body);
}
