// GENERATED from api/src/contracts by scripts/sync-contracts.mjs. Do not edit; change the source and re-run the script.
import { z } from 'zod';
import { source } from './common.ts';
import { clientLeadRow } from './leads.ts';

// F13a S1 (web plan §4.5). Buckets and "new today" are in the project's time zone; test leads are excluded.
const count = z.number().int().nonnegative();
const rate = z.number().min(0).max(1).nullable();
const baseKpis = {
  leads30: count,
  newToday: count,
  medianFirstReplyMin: z.number().nonnegative().nullable(),
  mqlRate: rate,
  sqlRate: rate,
};
const series = {
  perDay: z.array(z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), count })).length(30),
  bySource: z.array(z.object({ source, count })),
};

// The client shape adds the waiting-for-review tile and list; neither role gets per-manager data.
export const overviewResponse = z.discriminatedUnion('view', [
  z.object({ view: z.literal('staff'), kpis: z.object(baseKpis), ...series }),
  z.object({
    view: z.literal('client'),
    kpis: z.object({ ...baseKpis, waiting: count }),
    ...series,
    waiting: z.array(clientLeadRow),
  }),
]);

export type OverviewResponse = z.infer<typeof overviewResponse>;
