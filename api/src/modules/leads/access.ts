import { type Action, can } from '../../contracts/session.ts';
import { AppError } from '../../lib/errors/index.ts';
import type { ResolvedSession } from '../../lib/http/route.ts';

/**
 * The service's own `can()` (the route checks too). A client asking about a client that is not its own gets
 * NOT_FOUND, never FORBIDDEN.
 */
export function assertCan(session: ResolvedSession, action: Action, projectId: string): void {
  if (can(session, action, projectId)) return;
  const foreign = session.role === 'client' && !session.projectIds.includes(projectId);
  throw new AppError(foreign ? 'NOT_FOUND' : 'FORBIDDEN');
}
