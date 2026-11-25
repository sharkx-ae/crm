'use server';

import { z } from 'zod';
import { okResponse } from '../../contracts/auth.ts';
import {
  assignLeadRequest,
  assignLeadResponse,
  leadDetail,
  markLeadRequest,
  markLeadResponse,
  saveFormMappingRequest,
} from '../../contracts/leads.ts';
import { defineAction } from '../action.ts';
import { apiCall } from '../api/client.ts';

// F4a S2: the connect wizard's "Check the fields" step (the wizard itself is F14b). Staff, or a client user on its
// own client (integration.manage); the api re-checks and answers 404 for a form of another client.
export const saveFormMapping = defineAction(
  {
    input: saveFormMappingRequest.extend({ formId: z.uuid() }),
    action: (i) => ({ action: 'integration.manage', projectId: i.projectId }),
  },
  async ({ input }) =>
    apiCall(okResponse, `/lead-forms/${input.formId}/mapping`, {
      method: 'PUT',
      body: { projectId: input.projectId, mapping: input.mapping },
    }),
);

// F4b S6: MQL, SQL or Not qualified (+ a reason from the client's list). Staff and the client's own users
// (lead.mark); the api checks the reason, writes the event, the audit row and the outbox rows.
export const markLead = defineAction(
  {
    input: markLeadRequest.extend({ leadId: z.uuid() }),
    action: (i) => ({ action: 'lead.mark', projectId: i.projectId }),
  },
  async ({ input }) =>
    apiCall(markLeadResponse, `/leads/${input.leadId}/status`, {
      method: 'POST',
      body: { projectId: input.projectId, to: input.to, reason: input.reason },
    }),
);

// F4b S3: the owner of a lead (staff only, lead.assign); null unassigns.
export const assignLead = defineAction(
  {
    input: assignLeadRequest.extend({ leadId: z.uuid() }),
    action: (i) => ({ action: 'lead.assign', projectId: i.projectId }),
  },
  async ({ input }) =>
    apiCall(assignLeadResponse, `/leads/${input.leadId}/assign`, {
      method: 'POST',
      body: { projectId: input.projectId, ownerId: input.ownerId },
    }),
);

// The client's "Not qualified" reasons, for the inline "Mark as" buttons of the table (a list row carries none).
export const leadReasons = defineAction(
  {
    input: z.object({ projectId: z.uuid(), leadId: z.uuid() }),
    action: (i) => ({ action: 'lead.read', projectId: i.projectId }),
  },
  async ({ input }) => {
    const detail = await apiCall(
      leadDetail,
      `/leads/${input.leadId}?${new URLSearchParams({ projectId: input.projectId })}`,
    );
    return detail.qualification.reasons;
  },
);
