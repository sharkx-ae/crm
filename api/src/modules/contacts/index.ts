// Public API of the contacts module. Other modules use only what is exported here.

export { listContacts } from './list.ts';
export { getContactProfile } from './profile.ts';
export { contactRoutes } from './routes.ts';
export { type ContactKeys, findOrCreateContact, normaliseEmail } from './service.ts';
