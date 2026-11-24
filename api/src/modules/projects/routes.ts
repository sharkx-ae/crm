import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { projectDetail, projectOptionsResponse } from '../../contracts/projects.ts';
import { defineRoute } from '../../lib/http/route.ts';
import { getProjectDetail, listProjectOptions } from './service.ts';

// F2a: the shell's project switcher and project context (web plan §2.5, F2a technical spec §3).
export const projectRoutes: FastifyPluginAsync = async (app) => {
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
};
