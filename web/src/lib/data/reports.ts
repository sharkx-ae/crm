// Server-only data functions for the Overview (F13a): the api answers with the staff or the client shape.
import { type OverviewResponse, overviewResponse } from '../../contracts/reports.ts';
import { apiCall } from '../api/client.ts';

/** One client's Overview. Never cached: tenant data is read fresh on every request. */
export async function getOverview(projectId: string): Promise<OverviewResponse> {
  return apiCall(overviewResponse, `/reports/overview?${new URLSearchParams({ projectId })}`);
}
