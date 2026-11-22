import { hashPassword, PasswordLengthError } from '../../lib/crypto/index.ts';
import { AppError } from '../../lib/errors/index.ts';

/**
 * Hashes a password the person has just chosen (accept invite, reset). The form rule counts characters as typed, the
 * hash counts them after NFKC normalisation, so a password can pass the first and fail the second: that is a 422 like
 * any other weak password, not a 500.
 */
export async function hashNewPassword(pw: string): Promise<string> {
  try {
    return await hashPassword(pw);
  } catch (err) {
    if (err instanceof PasswordLengthError) {
      throw new AppError('VALIDATION', {
        details: { issues: [{ path: 'password', code: 'length' }] },
      });
    }
    throw err;
  }
}
