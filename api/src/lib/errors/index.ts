import { type ErrorBody, type ErrorCode, errorStatus } from '../../contracts/common.ts';

// CONTRACTS §7. Services throw AppError(code); one boundary (route plugin / Server Action wrapper) maps it.
// Details carry field paths and counters, never values, tokens or personal data.
export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details?: Record<string, unknown>;
  readonly retryAfterSec?: number;

  constructor(
    code: ErrorCode,
    opts: { details?: Record<string, unknown>; retryAfterSec?: number; cause?: unknown } = {},
  ) {
    super(code, opts.cause === undefined ? undefined : { cause: opts.cause });
    this.name = 'AppError';
    this.code = code;
    this.status = errorStatus[code];
    this.details = opts.details;
    this.retryAfterSec = opts.retryAfterSec;
  }
}

export function toErrorBody(err: AppError): ErrorBody {
  const body: ErrorBody = { error: { code: err.code } };
  if (err.details && Object.keys(err.details).length > 0) body.error.details = err.details;
  if (err.retryAfterSec !== undefined) body.error.retryAfterSec = err.retryAfterSec;
  return body;
}
