import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  waConnectRequest,
  waConnectResponse,
  waNumbersResponse,
} from '../../contracts/whatsapp.ts';
import type { ApiEnv } from '../../lib/env.ts';
import { defineRoute } from '../../lib/http/route.ts';
import { connectWhatsApp, listWaNumbers, waConfigOf } from './service.ts';

const params = z.object({ projectId: z.uuid() });

// F3a / F3.1. `integration.manage` is every role: a SHARKX user or the client's own user connects the client's numbers
// (PRD F3). A client asking about another client's project gets 404 from the route guard, never 403.
export const whatsappRoutes: FastifyPluginAsync<{ env: ApiEnv }> = async (app, { env }) => {
  const cfg = waConfigOf(env);

  defineRoute(
    app,
    {
      method: 'GET',
      url: '/projects/:projectId/whatsapp/numbers',
      access: 'session',
      params,
      action: ({ params: p }) => ({ action: 'integration.manage', projectId: p.projectId }),
      response: waNumbersResponse,
    },
    async ({ params: p, session }) => listWaNumbers(session, p.projectId, cfg),
  );

  defineRoute(
    app,
    {
      method: 'POST',
      url: '/projects/:projectId/whatsapp/connect',
      access: 'session',
      params,
      body: waConnectRequest,
      action: ({ params: p }) => ({ action: 'integration.manage', projectId: p.projectId }),
      response: waConnectResponse,
      audit: 'one',
    },
    async ({ params: p, body, session, req }) =>
      connectWhatsApp(session, p.projectId, body, cfg, req.log),
  );
};
