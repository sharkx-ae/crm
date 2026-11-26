'use server';

import { z } from 'zod';
import { waConnectRequest, waConnectResponse } from '../../contracts/whatsapp.ts';
import { defineAction } from '../action.ts';
import { apiCall } from '../api/client.ts';

// F3a / F3.1. can() runs here for the UX; the api re-checks it, talks to Meta and writes the audit row. The code and
// session info come from the browser (Embedded Signup) and are only hints: the api verifies them against the token.
export const connectWhatsApp = defineAction(
  {
    input: waConnectRequest.extend({ projectId: z.uuid() }),
    action: (i) => ({ action: 'integration.manage', projectId: i.projectId }),
  },
  async ({ input }) => {
    const { projectId, ...body } = input;
    return apiCall(waConnectResponse, `/projects/${projectId}/whatsapp/connect`, {
      method: 'POST',
      body,
    });
  },
);
