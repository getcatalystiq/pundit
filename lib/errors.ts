export type AppError =
  | { code: "NOT_FOUND"; message: string }
  | { code: "UNAUTHORIZED"; message: string }
  | { code: "FORBIDDEN"; message: string }
  | { code: "VALIDATION"; message: string; details?: unknown }
  | { code: "ENCRYPTION"; message: string }
  | { code: "DB_CONNECTION"; message: string }
  | { code: "AI_GENERATION"; message: string }
  | { code: "INTERNAL"; message: string };

export type Result<T> = { ok: true; data: T } | { ok: false; error: AppError };

export function ok<T>(data: T): Result<T> {
  return { ok: true, data };
}

export function err<T>(error: AppError): Result<T> {
  return { ok: false, error };
}

export function errorStatus(error: AppError): number {
  switch (error.code) {
    case "NOT_FOUND":
      return 404;
    case "UNAUTHORIZED":
      return 401;
    case "FORBIDDEN":
      return 403;
    case "VALIDATION":
      return 400;
    case "ENCRYPTION":
    case "DB_CONNECTION":
    case "AI_GENERATION":
    case "INTERNAL":
      return 500;
  }
}
