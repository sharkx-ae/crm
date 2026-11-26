// Demo content for `pnpm db:seed` (F4a S5, web plan §5.2), taken from the mockup (docs/inputs/sharkx-crm-mockup.html).
// Every email uses the reserved `.test` domain, so a dev sign-in code can never reach a real inbox.
import type { HealthState, Source } from '../../contracts/common.ts';

export type SeedClient = {
  key: string;
  name: string;
  city: 'Dubai' | 'Abu Dhabi' | 'Morocco';
  industry: string;
  timezone: 'Asia/Dubai' | 'Africa/Casablanca';
  color: string;
  leadCount: number;
  numbers: { label: string; phone: string }[];
  campaigns: string[];
  questions: [string, string];
  answers: [string[], string[]];
  sources: Source[];
  user: { name: string; email: string };
  inbound: string[];
  outbound: string[];
};

const AESTHETIC: Source[] = [
  'meta',
  'meta',
  'google',
  'youtube',
  'tiktok',
  'snapchat',
  'website',
  'whatsapp',
];
const REAL_ESTATE: Source[] = ['meta', 'google', 'website', 'linkedin', 'whatsapp', 'meta'];

export const CLIENTS: SeedClient[] = [
  {
    key: 'lum',
    name: 'Lumière Aesthetics',
    city: 'Dubai',
    industry: 'Aesthetic clinic',
    timezone: 'Asia/Dubai',
    color: '#e70101',
    leadCount: 16,
    numbers: [
      { label: 'Sales, Dubai', phone: '+971 50 412 7781' },
      { label: 'Bookings', phone: '+971 4 555 0192' },
    ],
    campaigns: [
      'Botox Winter Offer',
      'Lip Filler Lookalike',
      'Skin Booster Search',
      'Hydrafacial Reels',
    ],
    questions: ['Which treatment?', 'Preferred time'],
    answers: [
      ['Botox', 'Lip filler', 'Skin booster', 'Hydrafacial', 'Profhilo'],
      ['Weekday morning', 'Weekday evening', 'Saturday', 'Sunday'],
    ],
    sources: AESTHETIC,
    user: { name: 'Dr. Lina Haddad', email: 'lina@lumiere.test' },
    inbound: [
      'Hi, is the Botox offer still available?',
      'How much is lip filler for 1 ml?',
      'Can I book for Saturday afternoon?',
      'Do you have female doctors?',
    ],
    outbound: [
      'Yes, the offer runs until the end of the month. Shall I book you in?',
      'Of course. We have 2 pm or 4 pm on Saturday.',
      'You are booked. See you soon!',
    ],
  },
  {
    key: 'prl',
    name: 'Pearl Derma Clinic',
    city: 'Abu Dhabi',
    industry: 'Aesthetic clinic',
    timezone: 'Asia/Dubai',
    color: '#1c0f0f',
    leadCount: 13,
    numbers: [{ label: 'Main line', phone: '+971 2 610 4471' }],
    campaigns: ['Laser Hair Removal', 'Acne Scar Search', 'Botox Abu Dhabi'],
    questions: ['Which treatment?', 'Preferred branch'],
    answers: [
      ['Laser hair removal', 'Acne scar', 'Botox', 'Chemical peel'],
      ['Al Reem', 'Khalifa City'],
    ],
    sources: AESTHETIC,
    user: { name: 'Dr. Hessa Al Neyadi', email: 'hessa@pearlderma.test' },
    inbound: [
      'How many laser sessions do I need?',
      'Is the Al Reem branch open on Friday?',
      'What is the price for full body laser?',
    ],
    outbound: [
      'Usually 6 to 8 sessions. Would you like a free consultation?',
      'Yes, Al Reem is open 2 pm to 9 pm on Friday.',
    ],
  },
  {
    key: 'nov',
    name: 'Nova Skin Casablanca',
    city: 'Morocco',
    industry: 'Aesthetic clinic',
    timezone: 'Africa/Casablanca',
    color: '#776f6f',
    leadCount: 12,
    numbers: [
      { label: 'Clinique', phone: '+212 6 61 23 45 78' },
      { label: 'Instagram line', phone: '+212 6 70 11 22 33' },
    ],
    campaigns: ['Injections Maroc', 'Peeling Automne', 'Mésothérapie Search'],
    questions: ['Soin souhaité', 'Créneau'],
    answers: [
      ['Botox', 'Acide hyaluronique', 'Peeling', 'Mésothérapie'],
      ['Matin', 'Après-midi', 'Samedi'],
    ],
    sources: AESTHETIC,
    user: { name: 'Dr. Salma Benjelloun', email: 'salma@novaskin.test' },
    inbound: [
      'Bonjour, quel est le prix du Botox ?',
      'Vous avez un créneau samedi ?',
      'Merci, je confirme pour demain.',
    ],
    outbound: [
      'Bonjour ! Le Botox commence à 2 500 MAD. Souhaitez-vous un rendez-vous ?',
      'Oui, samedi 11 h est disponible.',
    ],
  },
  {
    key: 'fal',
    name: 'Falcon Properties',
    city: 'Dubai',
    industry: 'Real estate SME',
    timezone: 'Asia/Dubai',
    color: '#f16767',
    leadCount: 12,
    numbers: [{ label: 'Leasing', phone: '+971 55 300 8812' }],
    campaigns: ['JVC 1BR Launch', 'Off-plan Investors', 'Marina Rentals'],
    questions: ['Budget (AED)', 'Bedrooms'],
    answers: [
      ['Under 900k', '900k to 1.5M', '1.5M to 3M', 'Above 3M'],
      ['Studio', '1', '2', '3+'],
    ],
    sources: REAL_ESTATE,
    user: { name: 'Khaled Mansour', email: 'khaled@falcon.test' },
    inbound: [
      'Is the 1BR in JVC still available?',
      'What is the service charge?',
      'Can we view it this weekend?',
    ],
    outbound: [
      'Yes, it is available. Viewings are possible Saturday 11 am to 5 pm.',
      'The service charge is AED 14 per sq ft.',
    ],
  },
  {
    key: 'oas',
    name: 'Oasis Fit Studio',
    city: 'Abu Dhabi',
    industry: 'Fitness SME',
    timezone: 'Asia/Dubai',
    color: '#a49f9f',
    leadCount: 11,
    numbers: [{ label: 'Front desk', phone: '+971 56 220 1199' }],
    campaigns: ['Free Trial Week', 'Reformer Pilates', 'Corporate Plans'],
    questions: ['Interested in', 'Goal'],
    answers: [
      ['Pilates', 'Strength', 'Boxing', 'Personal training'],
      ['Lose weight', 'Build strength', 'Mobility'],
    ],
    sources: AESTHETIC,
    user: { name: 'Dana Whitfield', email: 'dana@oasisfit.test' },
    inbound: [
      'Is the trial week really free?',
      'What time are reformer classes?',
      'Can I bring a friend?',
    ],
    outbound: [
      'Yes, 7 days free with no commitment. Shall I book your first class?',
      'Reformer classes run at 7 am, 12 pm and 7 pm.',
    ],
  },
];

/** SHARKX managers. The super admin already exists (`pnpm auth:seed-admin`); the seed never creates one. */
export const MANAGERS: { name: string; email: string; status: 'active' | 'invited' }[] = [
  { name: 'Aisha Rahman', email: 'aisha.rahman@sharkx.test', status: 'active' },
  { name: 'Rami Haddad', email: 'rami.haddad@sharkx.test', status: 'active' },
  { name: 'Sana Idrissi', email: 'sana.idrissi@sharkx.test', status: 'active' },
  { name: 'Yara Nassar', email: 'yara.nassar@sharkx.test', status: 'invited' },
];

export const NAMES = [
  'Aisha Al Mansoori',
  'Omar Haddad',
  'Layla Khoury',
  'Rahul Mehta',
  'Sara Benali',
  'Youssef El Amrani',
  'Fatima Zahra Idrissi',
  'Hind Al Suwaidi',
  'Karim Nasser',
  'Nadia Chraibi',
  'James Carter',
  'Priya Nair',
  'Mariam Al Falasi',
  'Imane Tazi',
  'Khalid Al Rashid',
  'Sofia Rossi',
  'Amal Bennis',
  'Hassan Ali',
  'Noura Al Ketbi',
  'Mehdi Alaoui',
  'Elena Petrova',
  'Zainab Hussain',
  'Tariq Aziz',
  'Salma Ouazzani',
  'Daniel Smith',
  'Reem Abdullah',
  'Yasmine Berrada',
  'Ahmed Saleh',
  'Chloé Martin',
  'Faisal Al Nuaimi',
];

export const STAGES = ['New', 'Contacted', 'Qualified', 'Visit booked', 'Won', 'Lost'];
export const REASONS = [
  'No budget',
  'Wrong location',
  'Not interested',
  'Unreachable',
  'Duplicate',
  'Under 18',
];
export const TASK_TITLES = [
  'Call back',
  'Send price list',
  'Confirm visit',
  'Follow up on WhatsApp',
];

export const DEFINITIONS: Record<
  'aesthetic' | 'realEstate' | 'fitness',
  { mql: string; sql: string }
> = {
  aesthetic: {
    mql: 'Matches the target profile (location, age 18+) and answered the treatment question.',
    sql: 'Spoke with the clinic team and shows real intent: budget, need and timing confirmed.',
  },
  realEstate: {
    mql: 'Budget and area match a current listing; contact details verified.',
    sql: 'Viewing booked or offer discussed; budget and timeline confirmed.',
  },
  fitness: {
    mql: 'Local, answered the goal question, wants a trial class.',
    sql: 'Trial booked and attended, or membership price discussed.',
  },
};

/** Connection mix from the mockup: most connected, a few to fix, the awaiting platforms not connected. */
export type SeedIntegration = {
  platform: string;
  status: HealthState;
  mode: 'live' | 'fixture' | 'awaiting';
  minutesSinceData?: number;
  note?: string;
};
const BASE_INTEGRATIONS: SeedIntegration[] = [
  { platform: 'whatsapp', status: 'connected', mode: 'live', minutesSinceData: 2 },
  { platform: 'meta', status: 'connected', mode: 'live', minutesSinceData: 4 },
  { platform: 'google', status: 'connected', mode: 'fixture', minutesSinceData: 38 },
  { platform: 'tiktok', status: 'not_connected', mode: 'awaiting' },
  { platform: 'linkedin', status: 'not_connected', mode: 'awaiting' },
  { platform: 'snapchat', status: 'not_connected', mode: 'awaiting' },
  { platform: 'website', status: 'connected', mode: 'live', minutesSinceData: 16 },
  { platform: 'csv', status: 'not_connected', mode: 'live' },
];
const OVERRIDES: Record<string, Partial<Record<string, Partial<SeedIntegration>>>> = {
  nov: {
    whatsapp: {
      status: 'needs_attention',
      minutesSinceData: 95,
      note: 'The WhatsApp Business app was not opened for 12 days. Open it to keep the link.',
    },
    google: { status: 'needs_attention', minutesSinceData: 140, note: 'Access expires in 5 days' },
  },
  fal: {
    google: {
      status: 'broken',
      minutesSinceData: 1990,
      note: 'Access was removed by the account owner',
    },
  },
  oas: { google: { status: 'not_connected', minutesSinceData: undefined } },
};
export function integrationsFor(clientKey: string): SeedIntegration[] {
  return BASE_INTEGRATIONS.map((i) => ({ ...i, ...(OVERRIDES[clientKey]?.[i.platform] ?? {}) }));
}
