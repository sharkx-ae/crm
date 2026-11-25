import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { okResponse } from '../../contracts/auth.ts';
import { leadsPage, leadsQuery, saveFormMappingRequest } from '../../contracts/leads.ts';
import { defineRoute } from '../../lib/http/route.ts';
import { saveFormMapping } from './forms.ts';
import { listLeads } from './list.ts';

// F4a S2 and F4b. Every route carries projectId (the tenant rule): can() checks the client before anything is read.
// The service picks the client or staff projection from the session role; routes never choose.
export const leadRoutes: FastifyPluginAsync = async (app) => {
  defineRoute(
    app,
    {
      method: 'GET',
      url: '/leads',
      access: 'session',
      query: leadsQuery,
      action: ({ query }) => ({ action: 'lead.read', projectId: query.projectId }),
      response: leadsPage,
    },
    async ({ query, session }) => listLeads(session, query),
  );

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
