'use server';

import { z } from 'zod';
import { inviteRequest, setUserStatusRequest, userSummary } from '../../contracts/auth.ts';
import { defineAction } from '../action.ts';
import { apiCall } from '../api/client.ts';

// Owned by John (F2b Team, F10a Client users); written here so the shapes and the can() checks are in one place.
// can() runs here for UX; the api re-checks everything.

export const inviteUser = defineAction(
  {
    input: inviteRequest,
    action: (i) =>
      i.kind === 'manager'
        ? { action: 'user.manage' }
        : { action: 'clientuser.manage', projectId: i.projectId },
  },
  async ({ input }) => apiCall(userSummary, '/users/invite', { method: 'POST', body: input }),
);

export const setUserStatus = defineAction(
  {
    input: z.object({ userId: z.uuid() }).and(setUserStatusRequest),
    // Which action applies depends on who the target is; the api decides, this only needs a signed-in staff user.
    action: 'clientuser.manage',
  },
  async ({ input }) =>
    apiCall(userSummary, `/users/${input.userId}/status`, {
      method: 'POST',
      body: { status: input.status },
    }),
);
