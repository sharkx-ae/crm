import { and, desc } from 'drizzle-orm';
import type { LeadExportRequest, LeadExportRows } from '../../contracts/leads.ts';
import { AppError } from '../../lib/errors/index.ts';
import type { ResolvedSession } from '../../lib/http/route.ts';
import { withTenant } from '../../lib/tenant/index.ts';
import { audit } from '../audit/index.ts';
import { actorOf } from '../auth/index.ts';
import { users } from '../auth/schema.ts';
import { contacts } from '../contacts/schema.ts';
import { assertCan } from './access.ts';
import { leadFilterSql, tabSql } from './filters.ts';
import { leadContactJoin, leadOwnerJoin, leadRowColumns, projectLeadExport } from './projection.ts';
import { leads } from './schema.ts';

// POST /leads/export (F4b S4): the list's filter and tab with no paging, newest first. The same `leadFilterSql` as the
// list, so the export is the filtered list's rows; test leads never appear; notes are never exported; a client gets
// its own client and no owner column (projectLeadExport).

export const EXPORT_MAX_ROWS = 10_000;

export async function exportLeads(
  session: ResolvedSession,
  body: LeadExportRequest,
): Promise<LeadExportRows> {
  assertCan(session, 'lead.export', body.projectId);
  const filter = leadFilterSql(session, body);

  return withTenant(session, async (tx) => {
    // One more than the cap tells "exactly 10 000" from "too many" without counting twice.
    const records = await tx
      .select(leadRowColumns)
      .from(leads)
      .innerJoin(contacts, leadContactJoin)
      .leftJoin(users, leadOwnerJoin)
      .where(and(filter, tabSql(body.tab)))
      .orderBy(desc(leads.createdAt), desc(leads.id))
      .limit(EXPORT_MAX_ROWS + 1);
    if (records.length > EXPORT_MAX_ROWS) {
      throw new AppError('VALIDATION', { details: { reason: 'too_many', max: EXPORT_MAX_ROWS } });
    }

    const out = projectLeadExport(session, records);
    await audit(tx, {
      actor: actorOf(session),
      action: 'lead.exported',
      projectId: body.projectId,
      entity: 'lead',
      // The filter's shape and the row count: never the search text (it can be a phone number) or any row.
      meta: {
        rows: out.rows.length,
        tab: body.tab,
        source: body.source ?? null,
        owner: body.owner ?? null,
        search: Boolean(body.q),
      },
    });
    return out;
  });
}
