import type { Role } from '../../contracts/common.ts';
import type { Actor } from '../audit/index.ts';

/** Who to record in audit rows: `client` for the client role, `user` for staff. */
export const actorOf = (s: { userId: string; role: Role }): Actor => ({
  kind: s.role === 'client' ? 'client' : 'user',
  id: s.userId,
});

/** `o•••@sharkx.ae`: enough for the person to recognise their inbox, not enough for anyone else. */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf('@');
  if (at < 1) return '•••';
  return `${email.slice(0, 1)}•••${email.slice(at)}`;
}
