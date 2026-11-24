'use server';

import { z } from 'zod';
import { okResponse } from '../../contracts/auth.ts';
import { saveFormMappingRequest } from '../../contracts/leads.ts';
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
