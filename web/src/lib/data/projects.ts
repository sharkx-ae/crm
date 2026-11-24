// Server-only data functions for the shell (F2a): the switcher's options and the open project.
import { cache } from 'react';
import {
  type ProjectDetail,
  type ProjectOption,
  type ProjectsHomeResponse,
  projectDetail,
  projectOptionsResponse,
  projectsHomeResponse,
} from '../../contracts/projects.ts';
import { apiCall } from '../api/client.ts';
import { ApiError } from '../api/error.ts';

/** Staff: every client. A client user: its own. `cache` dedupes within one request only. */
export const getProjectOptions = cache(async (): Promise<ProjectOption[]> => {
  const res = await apiCall(projectOptionsResponse, '/projects/options');
  return res.options;
});

/** Clients home (staff): totals that ignore the search, and the matching rows. */
export async function getProjectsHome(q?: string): Promise<ProjectsHomeResponse> {
  const params = q ? `?${new URLSearchParams({ q })}` : '';
  return apiCall(projectsHomeResponse, `/projects${params}`);
}

/** Null when the project does not exist or is not the caller's (the api answers 404 for both). */
export const getProject = cache(async (projectId: string): Promise<ProjectDetail | null> => {
  try {
    return await apiCall(projectDetail, `/projects/${projectId}`);
  } catch (err) {
    if (err instanceof ApiError && (err.code === 'NOT_FOUND' || err.code === 'VALIDATION'))
      return null;
    throw err;
  }
});
