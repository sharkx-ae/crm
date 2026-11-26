import type { FastifyPluginAsync } from 'fastify';
import { projectScope } from '../../contracts/leads.ts';
import { overviewResponse } from '../../contracts/reports.ts';
import { defineRoute } from '../../lib/http/route.ts';
import { getOverview } from './overview.ts';

// F13a. Every role reads its own client's Overview (report.read); the service picks the staff or client shape.
export const reportRoutes: FastifyPluginAsync = async (app) => {
  defineRoute(
    app,
    {
      method: 'GET',
      url: '/reports/overview',
      access: 'session',
      query: projectScope,
      action: ({ query }) => ({ action: 'report.read', projectId: query.projectId }),
      response: overviewResponse,
    },
    async ({ query, session }) => getOverview(session, query.projectId),
  );
};
