import type { Role } from '../../contracts/common.ts';
import { type Action, can, type Session } from '../../contracts/session.ts';

// The single route table (web plan §2.3). Pure, so the shell, the page guard and the tests share it.
export type RouteKey =
  | 'clients'
  | 'team'
  | 'audit'
  | 'overview'
  | 'inbox'
  | 'leads'
  | 'contacts'
  | 'pipeline'
  | 'tasks'
  | 'reports'
  | 'integrations'
  | 'settings';

const ALL: readonly Role[] = ['super_admin', 'manager', 'client'];
const STAFF: readonly Role[] = ['super_admin', 'manager'];

export const ROUTES: Record<
  RouteKey,
  { roles: readonly Role[]; action: Action; perProject: boolean }
> = {
  clients: { roles: STAFF, action: 'agency.read', perProject: false },
  team: { roles: ['super_admin'], action: 'user.manage', perProject: false },
  audit: { roles: ['super_admin'], action: 'audit.read', perProject: false },
  overview: { roles: ALL, action: 'project.read', perProject: true },
  leads: { roles: ALL, action: 'lead.read', perProject: true },
  inbox: { roles: ALL, action: 'chat.read', perProject: true },
  reports: { roles: ALL, action: 'report.read', perProject: true },
  integrations: { roles: ALL, action: 'integration.manage', perProject: true },
  contacts: { roles: STAFF, action: 'contact.read', perProject: true },
  pipeline: { roles: STAFF, action: 'pipeline.manage', perProject: true },
  tasks: { roles: STAFF, action: 'task.manage', perProject: true },
  settings: { roles: STAFF, action: 'project.update', perProject: true },
};

export const ROUTE_KEYS = Object.keys(ROUTES) as RouteKey[];

/**
 * May this person open this route? A project route needs a project id (and, for a client user, its own); an agency
 * route takes none. Every "no" becomes the same not-found page, so the answer never reveals that a route exists.
 */
export function canViewRoute(
  me: Pick<Session, 'role' | 'projectIds' | 'stage'>,
  key: RouteKey,
  projectId?: string,
): boolean {
  const route = ROUTES[key];
  if (!route.roles.includes(me.role)) return false;
  if (route.perProject !== (projectId !== undefined)) return false;
  return can(me, route.action, projectId);
}

/** Locale-free path of a route: `/clients`, `/p/<id>/leads`. */
export function routePath(key: RouteKey, projectId?: string): string {
  return ROUTES[key].perProject ? `/p/${projectId}/${key}` : `/${key}`;
}

const PROJECT_PATH =
  /^\/p\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:\/|$)/i;

/** The open project's id from a locale-free path, or null in agency mode. */
export function projectIdOf(pathname: string): string | null {
  return PROJECT_PATH.exec(pathname)?.[1] ?? null;
}
