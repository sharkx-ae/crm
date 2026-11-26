import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { contactProfile, contactsPage, contactsQuery } from '../../contracts/contacts.ts';
import { projectScope } from '../../contracts/leads.ts';
import { defineRoute } from '../../lib/http/route.ts';
import { listContacts } from './list.ts';
import { getContactProfile } from './profile.ts';

// F4b S8, S9. Staff only (`contact.read`): a client is 403 on its own client and 404 on anyone else's.
// The service reads inside withTenant; test leads never count.
export const contactRoutes: FastifyPluginAsync = async (app) => {
  defineRoute(
    app,
    {
      method: 'GET',
      url: '/contacts',
      access: 'session',
      query: contactsQuery,
      action: ({ query }) => ({ action: 'contact.read', projectId: query.projectId }),
      response: contactsPage,
    },
    async ({ query, session }) => listContacts(session, query),
  );

  defineRoute(
    app,
    {
      method: 'GET',
      url: '/contacts/:id',
      access: 'session',
      params: z.object({ id: z.uuid() }),
      query: projectScope,
      action: ({ query }) => ({ action: 'contact.read', projectId: query.projectId }),
      response: contactProfile,
    },
    async ({ params, query, session }) => getContactProfile(session, params.id, query.projectId),
  );
};
