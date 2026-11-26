import { expect } from 'vitest';

// F10a S3 / F4b §4.5: names a response for the client role never contains, at any depth.
export const CLIENT_FORBIDDEN = [
  'ownerId',
  'ownerName',
  'stageId',
  'stage',
  'notes',
  'events',
  'timeline',
  'tasks',
  'isTest',
  'owners',
  'whatsappState',
] as const;

export function expectClientSafe(body: string): void {
  for (const key of CLIENT_FORBIDDEN) expect(body, key).not.toContain(`"${key}"`);
}
