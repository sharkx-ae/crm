'use server';

import { revalidatePath } from 'next/cache';
import {
  createProjectRequest,
  createProjectResponse,
  projectDetail,
  updateProjectSettingsRequest,
} from '../../contracts/projects.ts';
import { defineAction } from '../action.ts';
import { apiCall } from '../api/client.ts';

// F2b. can() runs here for the UX; the api re-checks everything and writes the audit rows.

/** Super admin: a new client, its default pipeline and the first client user's invite (one api transaction). */
export const createProject = defineAction(
  { input: createProjectRequest, action: 'project.create' },
  async ({ input }) => {
    const res = await apiCall(createProjectResponse, '/projects', { method: 'POST', body: input });
    // The shell's client list (switcher) lives in the (app) layout, which client navigation keeps as it is.
    // Marking it stale makes this action's response carry a fresh layout, so the new client appears at once.
    revalidatePath('/[locale]', 'layout');
    return res;
  },
);

/** Staff: a client's time zone and seven per-day business hours. */
export const updateProjectSettings = defineAction(
  {
    input: updateProjectSettingsRequest,
    action: (i) => ({ action: 'project.update', projectId: i.projectId }),
  },
  async ({ input }) =>
    apiCall(projectDetail, `/projects/${input.projectId}/settings`, {
      method: 'PATCH',
      body: input,
    }),
);
