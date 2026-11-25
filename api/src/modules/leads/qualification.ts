import { eq } from 'drizzle-orm';
import type { Tx } from '../../lib/tenant/index.ts';
import { qualificationSettings } from './schema.ts';

// A client's MQL/SQL definitions and "Not qualified" reasons (F4b D5; the settings screen is F10b).

/** The column default of qualification_settings.reasons, for a client with no row (a test holds the two equal). */
export const DEFAULT_REASONS = [
  'No budget',
  'Wrong location',
  'Not interested',
  'Unreachable',
  'Duplicate',
];

export type Qualification = { mqlDefinition: string; sqlDefinition: string; reasons: string[] };

export async function qualificationOf(tx: Tx, projectId: string): Promise<Qualification> {
  const [row] = await tx
    .select({
      mqlDefinition: qualificationSettings.mqlDefinition,
      sqlDefinition: qualificationSettings.sqlDefinition,
      reasons: qualificationSettings.reasons,
    })
    .from(qualificationSettings)
    .where(eq(qualificationSettings.projectId, projectId));
  return row ?? { mqlDefinition: '', sqlDefinition: '', reasons: [...DEFAULT_REASONS] };
}
