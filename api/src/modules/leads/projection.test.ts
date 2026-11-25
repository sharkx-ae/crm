import { describe, expect, it } from 'vitest';
import {
  clientLeadRow,
  leadDetail,
  leadExportRows,
  leadsPage,
  markLeadResponse,
} from '../../contracts/leads.ts';
import { overviewResponse } from '../../contracts/reports.ts';
import { projectOverview } from '../reports/projection.ts';
import {
  clientLeadKeys,
  hideTestLeads,
  type LeadRow,
  phoneDisplay,
  projectLead,
  projectLeadExport,
  projectLeadsPage,
  toClientLead,
  toStaffLead,
} from './projection.ts';

// F10a S3: the allowlist test. A client response contains the allowed keys and nothing else, whatever the row holds.
const FORBIDDEN = [
  'ownerId',
  'ownerName',
  'owner',
  'stageId',
  'stage',
  'notes',
  'events',
  'tasks',
  'isTest',
  'timeline',
  'owners',
  'whatsappState',
];
const client = { role: 'client' as const };
const manager = { role: 'manager' as const };
const superAdmin = { role: 'super_admin' as const };

const row = (over: Partial<LeadRow> = {}): LeadRow => ({
  id: '9a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d',
  source: 'meta',
  campaign: 'Botox Nov',
  status: 'new',
  reason: null,
  answers: { treatment: 'Botox' },
  createdAt: new Date('2026-11-25T08:30:00Z'),
  ownerId: '1b2c3d4e-5f6a-4b7c-8d9e-0f1a2b3c4d5e',
  ownerName: 'Aisha Rahman',
  stageId: '2c3d4e5f-6a7b-4c8d-9e0f-1a2b3c4d5e6f',
  isTest: false,
  name: 'Mariam Al Suwaidi',
  phoneE164: '+971501234567',
  email: 'mariam@example.test',
  ...over,
});
const base = {
  counts: { all: 2, unreviewed: 2, mql: 0, sql: 0, not_qualified: 0 },
  total: 2,
  sources: ['meta' as const],
};

/** Every key anywhere in a JSON value, at any depth. */
function keysDeep(v: unknown, out = new Set<string>()): Set<string> {
  if (Array.isArray(v)) for (const x of v) keysDeep(x, out);
  else if (v && typeof v === 'object')
    for (const [k, x] of Object.entries(v)) {
      out.add(k);
      keysDeep(x, out);
    }
  return out;
}
const noForbidden = (value: unknown) => {
  const keys = keysDeep(JSON.parse(JSON.stringify(value)));
  for (const f of FORBIDDEN) expect(keys.has(f), f).toBe(false);
};

describe('toClientLead', () => {
  it('returns exactly the allowlist keys', () => {
    expect(Object.keys(toClientLead(row())).sort()).toEqual([...clientLeadKeys].sort());
    expect(clientLeadRow.parse(toClientLead(row()))).toEqual(toClientLead(row()));
  });

  it('never carries owner, stage or the test flag, even when the row has them', () => {
    noForbidden(toClientLead(row()));
  });

  it('a field added to the row does not leak (the projection picks fields one by one)', () => {
    const widened = { ...row(), notes: 'VIP', ownerEmail: 'aisha@sharkx.test' } as LeadRow;
    const out = toClientLead(widened);
    expect(Object.keys(out).sort()).toEqual([...clientLeadKeys].sort());
    expect(JSON.stringify(out)).not.toContain('VIP');
  });

  it('the strict client schema refuses any extra field', () => {
    expect(clientLeadRow.safeParse({ ...toClientLead(row()), ownerName: 'x' }).success).toBe(false);
    expect(clientLeadRow.safeParse({ ...toClientLead(row()), stage: 'x' }).success).toBe(false);
  });

  it('a stored email the contract would refuse is dropped, so one odd lead never fails a whole page', () => {
    const one = projectLead(client, row({ email: 'a@b' }));
    expect(one?.lead.email).toBeNull();
    const page = projectLeadsPage(client, base, [row({ email: 'a@b' })]);
    expect(leadsPage.safeParse(page).success).toBe(true);
  });

  it('formats the phone for display and keeps E.164', () => {
    const out = toClientLead(row());
    expect(out.phone).toBe('+971501234567');
    expect(out.phoneDisplay).toBe('+971 50 123 4567');
    expect(phoneDisplay(null)).toBeNull();
  });
});

describe('toStaffLead', () => {
  it('is the client shape plus the owner', () => {
    const out = toStaffLead(row());
    expect(Object.keys(out).sort()).toEqual([...clientLeadKeys, 'ownerId', 'ownerName'].sort());
    expect(out.ownerName).toBe('Aisha Rahman');
  });
});

describe('projectLeadsPage: the service picks the shape from the role', () => {
  const rows = [row(), row({ id: '0d1e2f3a-4b5c-4d6e-8f7a-8b9c0d1e2f3a', isTest: true })];

  it('client: client view, allowlist rows, no test leads, valid contract', () => {
    const page = projectLeadsPage(client, base, rows);
    expect(page.view).toBe('client');
    expect(page.rows).toHaveLength(1);
    expect(leadsPage.parse(page)).toEqual(page);
    for (const r of page.rows) expect(Object.keys(r).sort()).toEqual([...clientLeadKeys].sort());
    noForbidden(page);
  });

  it('staff (manager and super admin): staff view with owners and test leads', () => {
    for (const s of [manager, superAdmin]) {
      const page = projectLeadsPage(s, base, rows);
      expect(page.view).toBe('staff');
      expect(page.rows).toHaveLength(2);
      expect(leadsPage.parse(page)).toEqual(page);
      expect(page.rows[0]).toHaveProperty('ownerName', 'Aisha Rahman');
    }
  });

  it('an extra number or list in the query result never reaches a response', () => {
    const widened = {
      ...base,
      counts: { ...base.counts, byOwner: { 'Aisha Rahman': 2 } },
      ownerNames: ['Aisha Rahman'],
    } as typeof base;
    for (const s of [client, manager]) {
      const page = projectLeadsPage(s, widened, [row({ ownerName: null })]);
      const keys = ['counts', 'rows', 'sources', 'total', 'view'];
      expect(Object.keys(page).sort()).toEqual(s === client ? keys : [...keys, 'owners'].sort());
      expect(Object.keys(page.counts)).not.toContain('byOwner');
      expect(JSON.stringify(page)).not.toContain('Aisha');
    }
  });

  it('owner choices reach the staff view only, field by field', () => {
    const owners = [
      { id: '1b2c3d4e-5f6a-4b7c-8d9e-0f1a2b3c4d5e', name: 'Aisha Rahman', active: true },
    ];
    const widened = owners.map((o) => ({
      ...o,
      email: 'aisha@sharkx.test',
    })) as unknown as typeof owners;
    const staff = projectLeadsPage(manager, base, [row()], widened);
    if (staff.view !== 'staff') throw new Error('staff view expected');
    expect(staff.owners).toEqual(owners);
    expect(leadsPage.parse(staff)).toEqual(staff);
    const forClient = projectLeadsPage(client, base, [row()], owners);
    expect(forClient).not.toHaveProperty('owners');
    expect(JSON.stringify(forClient)).not.toContain('Aisha');
  });

  it('a client-view page with a staff row fails the contract', () => {
    const bad = { view: 'client', ...base, rows: [toStaffLead(row())] };
    expect(leadsPage.safeParse(bad).success).toBe(false);
  });
});

describe('projectLead', () => {
  it('client: allowlist only, and the strict detail and mark shapes accept it', () => {
    const one = projectLead(client, row());
    expect(one?.view).toBe('client');
    const qualification = { mqlDefinition: '', sqlDefinition: '', reasons: [] };
    expect(leadDetail.safeParse({ ...one, qualification }).success).toBe(true);
    expect(markLeadResponse.safeParse({ ...one, outboxQueued: 0 }).success).toBe(true);
    noForbidden(one);
  });

  it('a test lead does not exist for a client, but does for staff', () => {
    expect(projectLead(client, row({ isTest: true }))).toBeNull();
    expect(projectLead(manager, row({ isTest: true }))?.view).toBe('staff');
  });
});

describe('projectLeadExport', () => {
  const rows = [row(), row({ isTest: true })];

  it('client: no owner column, no test leads, strict export rows', () => {
    const out = projectLeadExport(client, rows);
    expect(out.view).toBe('client');
    expect(out.rows).toHaveLength(1);
    expect(leadExportRows.parse(out)).toEqual(out);
    noForbidden(out);
  });

  it('staff: the owner column, still no test leads', () => {
    const out = projectLeadExport(manager, rows);
    expect(out.view).toBe('staff');
    expect(out.rows).toHaveLength(1);
    expect(out.rows[0]).toHaveProperty('ownerName', 'Aisha Rahman');
  });
});

describe('projectOverview (reports)', () => {
  const perDay = Array.from({ length: 30 }, (_, i) => ({
    date: `2026-11-${String(i + 1).padStart(2, '0')}`,
    count: 1,
  }));
  const data = {
    kpis: { leads30: 30, newToday: 2, medianFirstReplyMin: 4, mqlRate: 0.4, sqlRate: 0.2 },
    perDay,
    bySource: [{ source: 'meta' as const, count: 30 }],
    waitingCount: 12,
    waiting: [row(), row({ isTest: true })],
  };

  it('client: the waiting tile (full count) and the short list, allowlist leads only, no per-manager data', () => {
    const out = projectOverview(client, data);
    expect(out.view).toBe('client');
    if (out.view !== 'client') throw new Error('client view expected');
    expect(out.kpis.waiting).toBe(12);
    expect(out.waiting).toHaveLength(1);
    expect(overviewResponse.parse(out)).toEqual(out);
    noForbidden(out);
  });

  it('staff: no waiting list and no extra numbers', () => {
    const widened = { ...data, kpis: { ...data.kpis, byManager: 3 } as typeof data.kpis };
    const out = projectOverview(manager, widened);
    expect(out).not.toHaveProperty('waiting');
    expect(Object.keys(out.kpis)).not.toContain('byManager');
    expect(overviewResponse.parse(out)).toEqual(out);
  });

  it('a per-manager breakdown inside the series never reaches either role', () => {
    const widened = {
      ...data,
      bySource: [{ source: 'meta' as const, count: 30, byManager: { 'Aisha Rahman': 30 } }],
      perDay: perDay.map((d) => ({ ...d, owner: 'Aisha Rahman' })),
      waiting: [row({ ownerName: null })],
    };
    for (const s of [client, manager]) {
      const out = projectOverview(s, widened);
      expect(JSON.stringify(out)).not.toContain('Aisha');
      noForbidden(out);
    }
  });
});

describe('hideTestLeads: the SQL side of the same rule', () => {
  it('filters is_test for a client, nothing for staff', () => {
    expect(hideTestLeads('client')).toBeDefined();
    expect(hideTestLeads('staff')).toBeUndefined();
  });
});
