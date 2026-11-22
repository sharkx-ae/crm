import type { ErrorCode } from '../../contracts/common.ts';

// What the api answered (CONTRACTS §7 errorBody), or INTERNAL when it could not be reached or broke its contract.
export class ApiError extends Error {
  code: ErrorCode;
  status: number;
  details?: Record<string, unknown>;
  retryAfterSec?: number;

  constructor(
    code: ErrorCode,
    status: number,
    opts: { details?: Record<string, unknown>; retryAfterSec?: number } = {},
  ) {
    super(code);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.details = opts.details;
    this.retryAfterSec = opts.retryAfterSec;
  }
}
