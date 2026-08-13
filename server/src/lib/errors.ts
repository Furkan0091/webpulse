export type ErrorCode =
  | 'BAD_REQUEST'
  | 'VALIDATION_ERROR'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'RATE_LIMITED'
  | 'MONITOR_NOT_FOUND'
  | 'INCIDENT_NOT_FOUND'
  | 'ORGANIZATION_NOT_FOUND'
  | 'CHANNEL_NOT_FOUND'
  | 'API_KEY_NOT_FOUND'
  | 'STATUS_PAGE_NOT_FOUND'
  | 'INVALID_CREDENTIALS'
  | 'EMAIL_ALREADY_EXISTS'
  | 'TOKEN_INVALID'
  | 'SSRF_BLOCKED'
  | 'INTERNAL';

const HTTP_STATUS: Record<ErrorCode, number> = {
  BAD_REQUEST: 400,
  VALIDATION_ERROR: 422,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  RATE_LIMITED: 429,
  MONITOR_NOT_FOUND: 404,
  INCIDENT_NOT_FOUND: 404,
  ORGANIZATION_NOT_FOUND: 404,
  CHANNEL_NOT_FOUND: 404,
  API_KEY_NOT_FOUND: 404,
  STATUS_PAGE_NOT_FOUND: 404,
  INVALID_CREDENTIALS: 401,
  EMAIL_ALREADY_EXISTS: 409,
  TOKEN_INVALID: 401,
  SSRF_BLOCKED: 403,
  INTERNAL: 500,
};

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details?: unknown;

  constructor(code: ErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.status = HTTP_STATUS[code];
    this.details = details;
  }

  toJSON() {
    return {
      success: false,
      error: {
        code: this.code,
        message: this.message,
        ...(this.details ? { details: this.details } : {}),
      },
    };
  }
}

export function isAppError(err: unknown): err is AppError {
  return err instanceof AppError;
}
