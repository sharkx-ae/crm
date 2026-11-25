import { and, eq, ilike, isNull, like, or, type SQL } from 'drizzle-orm';
import type { Source } from '../../contracts/common.ts';
import type { LeadTab } from '../../contracts/leads.ts';
import { AppError } from '../../lib/errors/index.ts';
import type { ResolvedSession } from '../../lib/http/route.ts';
import { contacts } from '../contacts/schema.ts';
import { leads } from './schema.ts';

// One filter, three uses (F4b §4.2): the list, its tab counts and the export. A query that uses it joins `contacts`.

export type LeadFilter = {
  projectId: string;
  q?: string;
  source?: Source;
  /** A user id, or 'unassigned'. Staff only. */
  owner?: string;
};

/** `%`, `_` and `\` typed by a person mean themselves, not "anything". */
export const likePattern = (text: string): string => `%${text.replace(/[\\%_]/g, '\\$&')}%`;

/**
 * The digits to look for inside a stored E.164 phone, or null when `q` is not phone-like. Spaces and "+" go, and so
 * does the leading 0 or 00 people dial with, so "050 412" and "+97150412" both find +971 50 412 ….
 */
export function phoneDigits(q: string): string | null {
  const digits = q.replace(/\D/g, '');
  if (digits.length < 3) return null;
  return digits.replace(/^0{1,2}/, '') || null;
}

/** Every condition but the tab. Test leads never pass, for staff too. */
export function leadFilterSql(session: ResolvedSession, f: LeadFilter): SQL {
  if (session.role === 'client' && f.owner !== undefined) {
    throw new AppError('VALIDATION', {
      details: { issues: [{ path: 'owner', code: 'not_allowed' }] },
    });
  }
  const q = f.q?.trim();
  const digits = q ? phoneDigits(q) : null;
  return and(
    eq(leads.projectId, f.projectId),
    eq(leads.isTest, false),
    f.source ? eq(leads.source, f.source) : undefined,
    f.owner === undefined
      ? undefined
      : f.owner === 'unassigned'
        ? isNull(leads.ownerId)
        : eq(leads.ownerId, f.owner),
    q
      ? or(
          ilike(contacts.name, likePattern(q)),
          ilike(leads.campaign, likePattern(q)),
          digits ? like(contacts.phoneE164, `%${digits}%`) : undefined,
        )
      : undefined,
  ) as SQL;
}

export function tabSql(tab: LeadTab): SQL | undefined {
  if (tab === 'all') return undefined;
  return eq(leads.status, tab === 'unreviewed' ? 'new' : tab);
}
