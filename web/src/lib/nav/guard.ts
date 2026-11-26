import { notFound } from 'next/navigation';
import type { Me } from '../../contracts/auth.ts';
import { requireSession } from '../session.ts';
import { canViewRoute, type RouteKey } from './routes.ts';

/**
 * The page guard: every page under (app) calls it with its own key (structure test). The layout cannot protect a
 * page (it does not see the child segment), so each page checks. Any "no" is the in-shell not-found page.
 */
export async function guardRoute(key: RouteKey, projectId?: string): Promise<Me> {
  const me = await requireSession();
  if (!canViewRoute(me, key, projectId)) notFound();
  return me;
}
