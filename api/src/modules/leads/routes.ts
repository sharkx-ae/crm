import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { okResponse } from '../../contracts/auth.ts';
import { saveFormMappingRequest } from '../../contracts/leads.ts';
import { defineRoute } from '../../lib/http/route.ts';
import { saveFormMapping } from './forms.ts';

// F4a S2. The body carries projectId (the tenant rule): can() checks the client before the form is read.
export const leadRoutes: FastifyPluginAsync = async (app) => {
  defineRoute(
    app,
    {
      method: 'PUT',
      url: '/lead-forms/:id/mapping',
      access: 'session',
      params: z.object({ id: z.uuid() }),
      body: saveFormMappingRequest,
      action: ({ body }) => ({ action: 'integration.manage', projectId: body.projectId }),
      response: okResponse,
      audit: 'one',
    },
    async ({ params, body, session }) => saveFormMapping(session, params.id, body),
  );
};
