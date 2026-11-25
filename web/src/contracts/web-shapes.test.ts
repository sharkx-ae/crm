// GENERATED from api/src/contracts by scripts/sync-contracts.mjs. Do not edit; change the source and re-run the script.
import { describe, expect, it } from 'vitest';
import {
  businessHours,
  type ChangeKind,
  clientChangeKinds,
  clientLeadKeys,
  clientLeadRow,
  contactsQuery,
  knownAuditActions,
  leadsPage,
  leadsQuery,
  overviewResponse,
  projectScope,
  staffLeadRow,
  updateProjectSettingsRequest,
} from './index.ts';

const ID = '11111111-1111-4111-8111-111111111111';
const week = (over: Partial<{ open: boolean; from: string; to: string }> = {}) =>
  [1, 2, 3, 4, 5, 6, 7].map((day) => ({ day, open: day < 6, from: '09:00', to: '18:00', ...over }));

const clientRow = {
  id: ID,
  name: 'Sara',
  phone: '+971504127781',
  phoneDisplay: '+971 50 412 7781',
  email: null,
  source: 'meta',
  campaign: null,
  status: 'new',
  reason: null,
  createdAt: '2026-11-22T10:00:00.000Z',
  answers: {},
} as const;
const counts = { all: 1, unreviewed: 1, mql: 0, sql: 0, not_qualified: 0 };

describe('client lead allowlist', () => {
  it('clientLeadKeys is exactly the strict client row', () => {
    expect(Object.keys(clientLeadRow.shape)).toEqual(clientLeadKeys);
    expect(clientLeadKeys).not.toEqual(expect.arrayContaining(['ownerId', 'ownerName', 'isTest']));
  });

  it.each(['ownerId', 'ownerName', 'stageId', 'stage', 'notes', 'events', 'tasks', 'isTest'])(
    'a client row carrying %s is rejected',
    (key) => {
      expect(clientLeadRow.safeParse({ ...clientRow, [key]: null }).success).toBe(false);
    },
  );

  it('the client page shape refuses a staff row and the staff shape needs the owner', () => {
    const staffRow = { ...clientRow, ownerId: null, ownerName: null };
    expect(staffLeadRow.safeParse(staffRow).success).toBe(true);
    expect(staffLeadRow.safeParse(clientRow).success).toBe(false);
    expect(
      leadsPage.safeParse({ view: 'client', counts, total: 1, sources: [], rows: [staffRow] })
        .success,
    ).toBe(false);
    expect(
      leadsPage.safeParse({ view: 'client', counts, total: 1, sources: [], rows: [clientRow] })
        .success,
    ).toBe(true);
  });
});

describe('leadsQuery', () => {
  it('defaults the tab and page size, and caps the limit at 200', () => {
    expect(leadsQuery.parse({ projectId: ID })).toMatchObject({ tab: 'all', limit: 20 });
    expect(leadsQuery.safeParse({ projectId: ID, limit: '201' }).success).toBe(false);
    expect(leadsQuery.parse({ projectId: ID, limit: '40', owner: 'unassigned' }).limit).toBe(40);
  });
});

describe('F4b additions', () => {
  it('the staff page carries the owner choices; a client page drops them', () => {
    const staffRow = { ...clientRow, ownerId: null, ownerName: null };
    const staff = { view: 'staff', counts, total: 1, sources: [], rows: [staffRow] };
    expect(leadsPage.safeParse(staff).success).toBe(false);
    const owners = [{ id: ID, name: 'Aisha Rahman', active: true }];
    expect(leadsPage.safeParse({ ...staff, owners }).success).toBe(true);
    const client = leadsPage.parse({
      view: 'client',
      counts,
      total: 1,
      sources: [],
      rows: [clientRow],
      owners,
    });
    expect(client).not.toHaveProperty('owners');
  });

  it('projectScope needs a client id; contactsQuery pages like the leads list', () => {
    expect(projectScope.safeParse({}).success).toBe(false);
    expect(projectScope.parse({ projectId: ID })).toEqual({ projectId: ID });
    expect(contactsQuery.parse({ projectId: ID })).toEqual({ projectId: ID, limit: 20 });
    expect(contactsQuery.parse({ projectId: ID, q: '  sara ', limit: '40' })).toEqual({
      projectId: ID,
      q: 'sara',
      limit: 40,
    });
    expect(contactsQuery.safeParse({ projectId: ID, limit: '201' }).success).toBe(false);
  });
});

describe('business hours', () => {
  it('needs seven distinct weekdays and to after from on open days', () => {
    expect(businessHours.safeParse(week()).success).toBe(true);
    expect(businessHours.safeParse(week().slice(0, 6)).success).toBe(false);
    expect(businessHours.safeParse(week().map((d) => ({ ...d, day: 1 }))).success).toBe(false);
    expect(businessHours.safeParse(week({ from: '18:00', to: '09:00' })).success).toBe(false);
    // closed days keep whatever window they had
    expect(businessHours.safeParse(week({ open: false, from: '18:00', to: '09:00' })).success).toBe(
      true,
    );
  });

  it('settings need a canonical IANA zone, not an offset or a differently cased name', () => {
    const ok = { projectId: ID, timezone: 'Africa/Casablanca', businessHours: week() };
    const accepts = (timezone: string) =>
      updateProjectSettingsRequest.safeParse({ ...ok, timezone }).success;
    expect(accepts('Africa/Casablanca')).toBe(true);
    expect(accepts('Asia/Dubai')).toBe(true);
    // Intl takes these, and Postgres reads "+04:00" as UTC-4: 8 hours off for a Dubai project.
    for (const bad of [
      '+04:00',
      '-0300',
      'asia/dubai',
      'ASIA/DUBAI',
      'Mars/Base',
      '',
      ' Asia/Dubai',
    ]) {
      expect(accepts(bad), bad).toBe(false);
    }
  });
});

describe('overviewResponse', () => {
  const base = {
    kpis: { leads30: 0, newToday: 0, medianFirstReplyMin: null, mqlRate: null, sqlRate: null },
    perDay: Array.from({ length: 30 }, (_, i) => ({
      date: `2026-11-${String(i + 1).padStart(2, '0')}`,
      count: 0,
    })),
    bySource: [],
  };

  it('staff carries no waiting list; client must', () => {
    expect(overviewResponse.safeParse({ view: 'staff', ...base }).success).toBe(true);
    expect(overviewResponse.safeParse({ view: 'client', ...base }).success).toBe(false);
    expect(
      overviewResponse.safeParse({
        view: 'client',
        ...base,
        kpis: { ...base.kpis, waiting: 0 },
        waiting: [],
      }).success,
    ).toBe(true);
  });
});

describe('additive lists', () => {
  it('clientChangeKinds are all change kinds and omit task', () => {
    const all: ChangeKind[] = ['lead', 'message', 'task', 'health', 'notification'];
    for (const k of clientChangeKinds) expect(all).toContain(k);
    expect(clientChangeKinds).not.toContain('task');
  });

  it('audit actions stay unique and noun.verb', () => {
    expect(new Set(knownAuditActions).size).toBe(knownAuditActions.length);
    for (const a of knownAuditActions) expect(a).toMatch(/^[a-z_]+\.[a-z_]+$/);
    expect(knownAuditActions).toEqual(
      expect.arrayContaining([
        'project.created',
        'project.updated',
        'lead.created',
        'lead.merged',
        'lead.status_changed',
        'lead.assigned',
        'lead.exported',
        'form.mapping_saved',
      ]),
    );
  });
});
