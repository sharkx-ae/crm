import type { FastifyPluginAsync } from 'fastify';
import { auditPage, auditQuery } from '../../contracts/audit.ts';
import { defineRoute } from '../../lib/http/route.ts';
import { listAudit } from './service.ts';

// Super admin only (`audit.read`): a manager or a client user gets 403. The viewer screen is F1e (John).
export const auditRoutes: FastifyPluginAsync = async (app) => {
  defineRoute(
    app,
    {
      method: 'GET',
      url: '/audit',
      access: 'session',
      action: 'audit.read',
      query: auditQuery,
      response: auditPage,
    },
    async ({ query, session }) => listAudit(session, query),
  );
};
