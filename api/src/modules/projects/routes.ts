import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  createProjectRequest,
  createProjectResponse,
  projectDetail,
  projectOptionsResponse,
  projectsHomeResponse,
  updateProjectSettingsRequest,
} from '../../contracts/projects.ts';
import type { ApiEnv } from '../../lib/env.ts';
import { defineRoute } from '../../lib/http/route.ts';
import { createProject, updateProjectSettings } from './create.ts';
import { projectsHome } from './home.ts';
import { getProjectDetail, listProjectOptions } from './service.ts';

// F2a: the shell's project switcher and project context. F2b: clients home, create client, client settings.
export const projectRoutes: FastifyPluginAsync<{ env: ApiEnv }> = async (app, { env }) => {
  // Any signed-in user; the service limits a client user to its own project.
  defineRoute(
    app,
    {
      method: 'GET',
      url: '/projects/options',
      access: 'session',
      action: 'self',
      response: projectOptionsResponse,
    },
    async ({ session }) => ({ options: await listProjectOptions(session) }),
  );

  // The path id is the project, so can() runs on it before any read; a foreign project is 404, never 403.
  defineRoute(
    app,
    {
      method: 'GET',
      url: '/projects/:id',
      access: 'session',
      params: z.object({ id: z.uuid() }),
      action: ({ params }) => ({ action: 'project.read', projectId: params.id }),
      response: projectDetail,
    },
    async ({ params, session }) => getProjectDetail(session, params.id),
  );

  // Clients home (staff only). The totals ignore the search.
  defineRoute(
    app,
    {
      method: 'GET',
      url: '/projects',
      access: 'session',
      query: z.object({ q: z.string().trim().max(100).optional() }),
      action: 'agency.read',
      response: projectsHomeResponse,
    },
    async ({ query, session }) => projectsHome(session, query.q),
  );

  // Create client (super admin): project.created + the first user's user.invited, in one transaction.
  defineRoute(
    app,
    {
      method: 'POST',
      url: '/projects',
      access: 'session',
      action: 'project.create',
      body: createProjectRequest,
      response: createProjectResponse,
      audit: { count: 2 },
    },
    async ({ body, session }) => createProject(session, body, { appUrl: env.APP_URL }),
  );

  // Time zone and business hours (staff). The body carries projectId so can() runs before the row is read.
  defineRoute(
    app,
    {
      method: 'PATCH',
      url: '/projects/:id/settings',
      access: 'session',
      params: z.object({ id: z.uuid() }),
      body: updateProjectSettingsRequest,
      action: ({ body }) => ({ action: 'project.update', projectId: body.projectId }),
      response: projectDetail,
      audit: 'one',
    },
    async ({ params, body, session }) => updateProjectSettings(session, params.id, body),
  );
};
