// Server-only data functions for the Leads screen (F4b): the api answers with the staff or the client shape.
import { type LeadDetail, type LeadsPage, leadDetail, leadsPage } from '../../contracts/leads.ts';
import { apiCall } from '../api/client.ts';
import { ApiError } from '../api/error.ts';
import { type LeadFilters, leadsApiParams } from '../leads-url.ts';

/** One page of leads: the api applies the tab, filters, search and limit; the browser never filters or slices. */
export async function getLeads(projectId: string, filters: LeadFilters): Promise<LeadsPage> {
  return apiCall(leadsPage, `/leads?${leadsApiParams(projectId, filters, { withLimit: true })}`);
}

/** Null when the lead is gone, not this client's, or a test lead (the api answers 404 for all of them). */
export async function getLead(projectId: string, id: string): Promise<LeadDetail | null> {
  try {
    return await apiCall(leadDetail, `/leads/${id}?${new URLSearchParams({ projectId })}`);
  } catch (err) {
    if (err instanceof ApiError && (err.code === 'NOT_FOUND' || err.code === 'VALIDATION'))
      return null;
    throw err;
  }
}
