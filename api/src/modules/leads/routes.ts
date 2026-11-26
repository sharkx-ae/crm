import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { okResponse } from '../../contracts/auth.ts';
import {
  assignLeadRequest,
  assignLeadResponse,
  leadDetail,
  leadExportRequest,
  leadExportRows,
  leadsPage,
  leadsQuery,
  markLeadRequest,
  markLeadResponse,
  projectScope,
  saveFormMappingRequest,
} from '../../contracts/leads.ts';
import { defineRoute } from '../../lib/http/route.ts';
import { assignLead } from './assign.ts';
import { getLead } from './detail.ts';
import { exportLeads } from './export.ts';
import { saveFormMapping } from './forms.ts';
import { listLeads } from './list.ts';
import { markLead } from './status.ts';

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
      method: 'GET',
      url: '/leads/:id',
      access: 'session',
      params: z.object({ id: z.uuid() }),
      query: projectScope,
      action: ({ query }) => ({ action: 'lead.read', projectId: query.projectId }),
      response: leadDetail,
    },
    async ({ params, query, session }) => getLead(session, params.id, query.projectId),
  );

  // Status MQL / SQL / Not qualified: staff and the client's own users (lead.mark). One audit row, a no-op included.
  defineRoute(
    app,
    {
      method: 'POST',
      url: '/leads/:id/status',
      access: 'session',
      params: z.object({ id: z.uuid() }),
      body: markLeadRequest,
      action: ({ body }) => ({ action: 'lead.mark', projectId: body.projectId }),
      response: markLeadResponse,
      audit: 'one',
    },
    async ({ params, body, session }) => markLead(session, params.id, body),
  );

  // CSV export rows for the current filter (lead.export, every role). One audit row: the filter and the row count.
  defineRoute(
    app,
    {
      method: 'POST',
      url: '/leads/export',
      access: 'session',
      body: leadExportRequest,
      action: ({ body }) => ({ action: 'lead.export', projectId: body.projectId }),
      response: leadExportRows,
      audit: 'one',
    },
    async ({ body, session }) => exportLeads(session, body),
  );

  // Owner (assign or unassign): staff only (lead.assign). A no-op still writes one audit row.
  defineRoute(
    app,
    {
      method: 'POST',
      url: '/leads/:id/assign',
      access: 'session',
      params: z.object({ id: z.uuid() }),
      body: assignLeadRequest,
      action: ({ body }) => ({ action: 'lead.assign', projectId: body.projectId }),
      response: assignLeadResponse,
      audit: 'one',
    },
    async ({ params, body, session }) => assignLead(session, params.id, body),
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
