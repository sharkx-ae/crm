// Fixtures shared by the fake api and the stubbed Playwright specs. Invented people and clients; no real data.
import type { LeadStatus, Locale, Role, Source } from '../../../src/contracts/common.ts';
import type { StaffLeadRow } from '../../../src/contracts/leads.ts';
import type { ProjectDetail } from '../../../src/contracts/projects.ts';

const LUMIERE = '0b6f7c1e-4d2a-4f3b-9a1c-1e2d3c4b5a60';
const PEARL = '7a8b9c0d-1e2f-4a3b-8c4d-5e6f7a8b9c0d';

const weekdays = [1, 2, 3, 4, 5, 6, 7].map((day) => ({
  day,
  open: day <= 5,
  from: '09:00',
  to: '18:00',
}));

const users: {
  userId: string;
  email: string;
  name: string;
  role: Role;
  projectIds: string[];
  /** The saved language (users.locale). */
  locale: Locale;
}[] = [
  {
    userId: '3c1d2e3f-4a5b-4c6d-8e7f-9a0b1c2d3e4f',
    email: 'client@example.test',
    name: 'Lina Haddad',
    role: 'client',
    projectIds: [LUMIERE],
    locale: 'en',
  },
  {
    userId: '5d6e7f80-91a2-4b3c-8d4e-5f6a7b8c9d0e',
    email: 'admin@example.test',
    name: 'Agency Admin',
    role: 'super_admin',
    projectIds: [],
    locale: 'en',
  },
  {
    userId: '8e9f0a1b-2c3d-4e5f-8a6b-7c8d9e0f1a2b',
    email: 'manager-fr@example.test',
    name: 'Rami Haddad',
    role: 'manager',
    projectIds: [],
    locale: 'fr',
  },
];

const projects: ProjectDetail[] = [
  {
    id: LUMIERE,
    name: 'Lumière Aesthetics',
    city: 'Dubai',
    industry: 'Aesthetic clinic',
    color: '#e70101',
    timezone: 'Asia/Dubai',
    businessHours: weekdays,
  },
  {
    id: PEARL,
    name: 'Pearl Derma Clinic',
    city: 'Abu Dhabi',
    industry: 'Dermatology',
    color: '#1c0f0f',
    timezone: 'Asia/Dubai',
    businessHours: weekdays,
  },
];

// Forty Lumière leads, newest first by index. Enough that the first page of 20 hides one, so "Show 20 more" is real.
// Named rows are the ones the stubbed spec looks for; the rest fill the counts.
const RAMI = '8e9f0a1b-2c3d-4e5f-8a6b-7c8d9e0f1a2b';
const leadId = (n: number) => `a1000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`;
const SARA = leadId(40);
const HADI = leadId(39);
const GOOGLE_ONLY = leadId(38);
const PAGE_TWO = leadId(20);
const NOOR = leadId(10);
const SARA_CONTACT = 'c1000000-0000-4000-8000-000000000001';
const RECEIVED = Date.parse('2026-11-25T10:00:00.000Z');

export type FixtureLead = StaffLeadRow & { projectId: string };
export type FixtureContact = {
  id: string;
  projectId: string;
  name: string | null;
  phone: string | null;
  phoneDisplay: string | null;
  email: string | null;
  createdAt: string;
  leadIds: string[];
};

const STATUS_CYCLE: LeadStatus[] = ['new', 'mql', 'sql', 'not_qualified'];
const SOURCE_CYCLE: Source[] = ['meta', 'google', 'website'];

const leads: FixtureLead[] = Array.from({ length: 40 }, (_, i) => {
  const n = i + 1;
  const owned = n % 2 === 1;
  const lead: FixtureLead = {
    id: leadId(n),
    projectId: LUMIERE,
    name: `Lead ${n}`,
    phone: `+97150${String(1000000 + n)}`,
    phoneDisplay: `+971 50 ${String(1000000 + n)}`,
    email: `lead${n}@example.test`,
    source: SOURCE_CYCLE[n % SOURCE_CYCLE.length] ?? 'meta',
    campaign: `Campaign ${n}`,
    status: STATUS_CYCLE[n % STATUS_CYCLE.length] ?? 'new',
    reason: null,
    createdAt: new Date(RECEIVED - (40 - n) * 60_000).toISOString(),
    answers: {},
    ownerId: owned ? RAMI : null,
    ownerName: owned ? 'Rami Haddad' : null,
  };
  return lead;
});

const named = (id: string): FixtureLead => {
  const lead = leads.find((l) => l.id === id);
  if (!lead) throw new Error(`missing fixture lead ${id}`);
  return lead;
};

Object.assign(named(SARA), {
  name: 'Sara Al Noor',
  source: 'meta' as const,
  status: 'new' as const,
  campaign: 'Ramadan consult',
  email: 'sara@example.test',
  answers: { Treatment: 'Botox' },
  ownerId: null,
  ownerName: null,
});
Object.assign(named(HADI), {
  name: 'Hadi New',
  source: 'website' as const,
  status: 'new' as const,
  ownerId: RAMI,
  ownerName: 'Rami Haddad',
});
Object.assign(named(GOOGLE_ONLY), {
  name: 'Google Only',
  source: 'google' as const,
  status: 'mql' as const,
});
Object.assign(named(PAGE_TWO), { name: 'Page Two Lead' });
Object.assign(named(NOOR), {
  name: 'Noor SQL',
  source: 'google' as const,
  status: 'sql' as const,
  ownerId: RAMI,
  ownerName: 'Rami Haddad',
});

const contacts: FixtureContact[] = [
  {
    id: SARA_CONTACT,
    projectId: LUMIERE,
    name: 'Sara Al Noor',
    phone: named(SARA).phone,
    phoneDisplay: named(SARA).phoneDisplay,
    email: 'sara@example.test',
    createdAt: '2026-11-20T08:00:00.000Z',
    leadIds: [SARA],
  },
  {
    id: 'c1000000-0000-4000-8000-000000000002',
    projectId: LUMIERE,
    name: 'Omar Farid',
    phone: '+971501111111',
    phoneDisplay: '+971 50 111 1111',
    email: 'omar@example.test',
    createdAt: '2026-11-18T08:00:00.000Z',
    leadIds: [HADI],
  },
];

export const FIXTURE = {
  password: 'Correct-horse-1234',
  code: '123456',
  users,
  projects,
  leads,
  contacts,
  ids: {
    lumiere: LUMIERE,
    pearl: PEARL,
    rami: RAMI,
    sara: SARA,
    hadi: HADI,
    googleOnly: GOOGLE_ONLY,
    pageTwo: PAGE_TWO,
    noor: NOOR,
    saraContact: SARA_CONTACT,
  },
};
