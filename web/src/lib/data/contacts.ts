// Server-only data functions for the Contacts screen (F4b). Staff only; the page 404s for a client first.
import {
  type ContactProfile,
  type ContactsPage,
  contactProfile,
  contactsPage,
} from '../../contracts/contacts.ts';
import { apiCall } from '../api/client.ts';
import { ApiError } from '../api/error.ts';
import { type ContactFilters, contactsApiParams } from '../contacts-url.ts';

/** One page of contacts. The api applies the search and the limit; the browser never filters or slices. */
export async function getContacts(
  projectId: string,
  filters: ContactFilters,
): Promise<ContactsPage> {
  return apiCall(contactsPage, `/contacts?${contactsApiParams(projectId, filters)}`);
}

/** Null when the contact is gone, not this client's, or has only test leads (the api answers 404). */
export async function getContact(projectId: string, id: string): Promise<ContactProfile | null> {
  try {
    return await apiCall(contactProfile, `/contacts/${id}?${new URLSearchParams({ projectId })}`);
  } catch (err) {
    if (err instanceof ApiError && (err.code === 'NOT_FOUND' || err.code === 'VALIDATION'))
      return null;
    throw err;
  }
}
