// Public API of the auth module. Other modules (and app.ts) use only what is exported here.
export { can } from '../../contracts/session.ts';
export type { Actor } from '../audit/index.ts';
export { actorOf, maskEmail } from './actor.ts';
export { authRoutes } from './routes.ts';
export { type ResolvedSession, resolveSession } from './sessions.ts';
