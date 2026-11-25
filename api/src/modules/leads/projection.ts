import { eq, type SQL } from 'drizzle-orm';
import { parsePhoneNumberFromString } from 'libphonenumber-js';
import type { Role } from '../../contracts/common.ts';
import {
  type ClientLeadRow,
  clientLeadKeys,
  type LeadExportRows,
  type LeadsPage,
  type StaffLeadRow,
} from '../../contracts/leads.ts';
import { leads } from './schema.ts';

// Client-safe projections for leads (F10a S3, web plan §3.4). One rule: the service picks the shape from the
// session's role through these functions; routes never choose, and nothing spreads a database row or a query result
// into a response. The client shape is the strict allowlist `clientLeadKeys` (CONTRACTS §1): never owner, stage,
// notes, events, tasks or isTest, and test leads are not shown to a client at all. RLS `client_access` (F1b) is the
// second wall.

/** A lead joined to its contact and owner: what a lead query selects before projecting. */
export type LeadRow = Pick<
  typeof leads.$inferSelect,
  | 'id'
  | 'source'
  | 'campaign'
  | 'status'
  | 'reason'
  | 'answers'
  | 'createdAt'
  | 'ownerId'
  | 'stageId'
  | 'isTest'
> & {
  name: string | null;
  phoneE164: string | null;
  email: string | null;
  ownerName: string | null;
};

export type LeadView = 'staff' | 'client';

/** The response shape a role gets. A client user is always 'client'; super admins and managers are 'staff'. */
export function leadViewFor(session: { role: Role }): LeadView {
  return session.role === 'client' ? 'client' : 'staff';
}

/** Whether a lead may appear at all for this view (test leads never reach a client). */
export function visibleTo(view: LeadView, row: Pick<LeadRow, 'isTest'>): boolean {
  return view === 'staff' || !row.isTest;
}

/**
 * The SQL side of `visibleTo`: put it in the `where` of every lead query that feeds a view (rows, counts, total,
 * sources, the overview's waiting count), so the numbers and the rows agree and a page is never short after LIMIT.
 * Undefined for staff (drizzle's `and()` skips it).
 */
export function hideTestLeads(view: LeadView): SQL | undefined {
  return view === 'client' ? eq(leads.isTest, false) : undefined;
}

/** "+971 50 123 4567" for a stored E.164 number; null when there is none. */
export function phoneDisplay(e164: string | null): string | null {
  if (!e164) return null;
  return parsePhoneNumberFromString(e164)?.formatInternational() ?? e164;
}

const ALLOWED = new Set<string>(clientLeadKeys);

/**
 * The runtime safety net for a client row: exactly the allowlist keys, nothing more. It checks names, not formats,
 * so a stored value the contract would word differently can never turn a client's whole page into an error.
 */
function assertClientKeys(out: ClientLeadRow): ClientLeadRow {
  const keys = Object.keys(out);
  if (keys.length !== ALLOWED.size || keys.some((k) => !ALLOWED.has(k))) {
    throw new Error('client lead projection is outside the allowlist');
  }
  return out;
}

/** The client allowlist, field by field, so a column added to LeadRow can never leak by accident. */
export function toClientLead(row: LeadRow): ClientLeadRow {
  return assertClientKeys({
    id: row.id,
    name: row.name,
    phone: row.phoneE164,
    phoneDisplay: phoneDisplay(row.phoneE164),
    email: row.email,
    source: row.source,
    campaign: row.campaign,
    status: row.status,
    reason: row.reason,
    createdAt: row.createdAt.toISOString(),
    answers: row.answers,
  });
}

/** Staff see the client fields plus the owner. */
export function toStaffLead(row: LeadRow): StaffLeadRow {
  return { ...toClientLead(row), ownerId: row.ownerId, ownerName: row.ownerName };
}

type PageBase = Omit<LeadsPage, 'view' | 'rows'>;

/** The page numbers, field by field: an extra count a query adds (per owner, say) never reaches a response. */
function pageBase(b: PageBase): PageBase {
  const c = b.counts;
  return {
    counts: {
      all: c.all,
      unreviewed: c.unreviewed,
      mql: c.mql,
      sql: c.sql,
      not_qualified: c.not_qualified,
    },
    total: b.total,
    sources: [...b.sources],
  };
}

/**
 * A page of leads for this session. Build the query with `hideTestLeads(leadViewFor(session))` so `counts`, `total`
 * and `sources` already exclude test leads for a client; the rows are filtered here again as a second check.
 */
export function projectLeadsPage(
  session: { role: Role },
  base: PageBase,
  rows: LeadRow[],
): LeadsPage {
  const view = leadViewFor(session);
  const shown = rows.filter((r) => visibleTo(view, r));
  return view === 'client'
    ? { view, ...pageBase(base), rows: shown.map(toClientLead) }
    : { view, ...pageBase(base), rows: shown.map(toStaffLead) };
}

/** One lead for this session: `{ view, lead }`, or null when the role may not see it (a test lead for a client). */
export function projectLead(
  session: { role: Role },
  row: LeadRow,
): { view: 'client'; lead: ClientLeadRow } | { view: 'staff'; lead: StaffLeadRow } | null {
  const view = leadViewFor(session);
  if (!visibleTo(view, row)) return null;
  return view === 'client' ? { view, lead: toClientLead(row) } : { view, lead: toStaffLead(row) };
}

/** Export rows (F10b): the same columns as the screen, without the owner for a client; test leads never appear. */
export function projectLeadExport(session: { role: Role }, rows: LeadRow[]): LeadExportRows {
  const view = leadViewFor(session);
  const real = rows.filter((r) => !r.isTest);
  const cells = (r: LeadRow) => ({
    name: r.name,
    phone: r.phoneE164,
    email: r.email,
    source: r.source,
    campaign: r.campaign,
    status: r.status,
    reason: r.reason,
    receivedAt: r.createdAt.toISOString(),
  });
  return view === 'client'
    ? { view, rows: real.map(cells) }
    : { view, rows: real.map((r) => ({ ...cells(r), ownerName: r.ownerName })) };
}

export { clientLeadKeys };
