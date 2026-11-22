// Server-only data functions (they call the api with the internal token and the visitor's session).
// John's Team and Client users screens read through these.
import {
  type InviteInfoResponse,
  inviteInfoResponse,
  type ListUsersQuery,
  listUsersResponse,
  type UserSummary,
} from '../../contracts/auth.ts';
import { apiCall } from '../api/client.ts';
import { ApiError } from '../api/error.ts';

export async function getUsers(query: ListUsersQuery): Promise<UserSummary[]> {
  const params = new URLSearchParams({ kind: query.kind });
  if (query.kind === 'client') params.set('projectId', query.projectId);
  const res = await apiCall(listUsersResponse, `/users?${params}`);
  return res.users;
}

/** For the accept screen. Null for an expired, used or forged link (the page shows one "expired" message). */
export async function inspectInvite(token: string): Promise<InviteInfoResponse | null> {
  try {
    return await apiCall(inviteInfoResponse, '/auth/invite/inspect', {
      method: 'POST',
      body: { token },
      session: 'none',
    });
  } catch (err) {
    if (err instanceof ApiError && (err.code === 'NOT_FOUND' || err.code === 'VALIDATION'))
      return null;
    throw err;
  }
}
