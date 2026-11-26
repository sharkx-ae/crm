// Server-only data function for the integrations page (F3a): the project's WhatsApp numbers.
import { type WaNumbersResponse, waNumbersResponse } from '../../contracts/whatsapp.ts';
import { apiCall } from '../api/client.ts';

export async function getWaNumbers(projectId: string): Promise<WaNumbersResponse> {
  return apiCall(waNumbersResponse, `/projects/${projectId}/whatsapp/numbers`);
}
