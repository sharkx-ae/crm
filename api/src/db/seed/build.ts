// Pure and deterministic: the same `now` always gives the same rows (the mockup's generator, seed 7). The seed command
// inserts what this returns, and tests freeze `now` to compare against tests/fixtures/seed/expected.json.
import type { LeadStatus, Source } from '../../contracts/common.ts';
import { CLIENTS, MANAGERS, NAMES, REASONS, type SeedClient, TASK_TITLES } from './data.ts';

const MIN = 60_000;
const DAY = 24 * 60 * MIN;

export type SeedMessage = { dir: 'in' | 'out'; text: string; ts: Date };
export type SeedLead = {
  name: string;
  phoneE164: string;
  email: string;
  source: Source;
  campaign: string;
  answers: Record<string, string>;
  status: LeadStatus;
  reason: string | null;
  /** Index into the active managers (round-robin across all clients); null for test leads. */
  ownerIndex: number | null;
  isTest: boolean;
  createdAt: Date;
  markedAt: Date | null;
  firstReplyAt: Date | null;
  chat: SeedMessage[];
};
export type SeedTask = { leadIndex: number; title: string; dueAt: Date; done: boolean };
export type SeedClientRows = { client: SeedClient; leads: SeedLead[]; tasks: SeedTask[] };
export type SeedPlan = { activeManagers: number; clients: SeedClientRows[] };

function generator(start = 7) {
  let s = start;
  const rnd = () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
  const pick = <T>(a: readonly T[]): T => a[Math.floor(rnd() * a.length)] as T;
  return { rnd, pick };
}

const emailOf = (name: string, i: number) =>
  `${name
    .normalize('NFD')
    .replace(/[^\x20-\x7e]/g, '')
    .toLowerCase()
    .replace(/[^a-z ]/g, '')
    .trim()
    .split(/\s+/)
    .join('.')}.${i}@mail.test`;

/** Valid mobiles, unique per client: UAE +97150 + 7 digits, Morocco +2126 + 8 digits. */
const phoneOf = (client: SeedClient, ci: number, i: number) =>
  client.city === 'Morocco'
    ? `+2126${61000000 + ci * 10007 + i * 101}`
    : `+97150${1000000 + ci * 100003 + i * 1013}`;

export function buildSeed(now: Date): SeedPlan {
  const { rnd, pick } = generator();
  const activeManagers = MANAGERS.filter((m) => m.status === 'active').length;
  const t = now.getTime();
  let turn = 0;
  let nameAt = 0;

  const clients = CLIENTS.map((client, ci): SeedClientRows => {
    const leads: SeedLead[] = [];
    for (let i = 0; i < client.leadCount; i++) {
      // Two leads arrive in the last hour or two; the rest spread over the last 30 days.
      const ageMin = i === 0 ? 20 : i === 1 ? 75 : Math.floor(180 + rnd() ** 1.12 * 30 * 24 * 60);
      const isTest = (client.key === 'lum' && i === 3) || (client.key === 'fal' && i === 5);
      const source = isTest ? 'meta' : pick(client.sources);
      const pool: LeadStatus[] =
        ageMin < 2 * 24 * 60
          ? ['new', 'new', 'new', 'mql']
          : ['new', 'mql', 'mql', 'sql', 'sql', 'not_qualified', 'mql', 'sql', 'not_qualified'];
      const status = isTest ? 'new' : pick(pool);
      const createdAt = new Date(t - ageMin * MIN);
      const name = isTest ? 'Test lead' : (NAMES[nameAt++ % NAMES.length] as string);
      const campaign =
        source === 'website'
          ? 'Organic: website'
          : source === 'whatsapp'
            ? 'Organic: WhatsApp direct'
            : pick(client.campaigns);
      const answers = {
        [client.questions[0]]: pick(client.answers[0]),
        [client.questions[1]]: pick(client.answers[1]),
      };

      // Chats: every WhatsApp lead, and about six in ten of the others.
      const chat: SeedMessage[] = [];
      if (!isTest && (source === 'whatsapp' || rnd() < 0.62)) {
        let ts = createdAt.getTime() + 2 * MIN;
        const exchanges = 1 + Math.floor(rnd() * 3);
        for (let k = 0; k < exchanges; k++) {
          chat.push({
            dir: 'in',
            text: client.inbound[(k + i) % client.inbound.length] as string,
            ts: new Date(ts),
          });
          ts += (3 + Math.floor(rnd() * 40)) * MIN;
          if (k < exchanges - 1 || rnd() < 0.55) {
            chat.push({
              dir: 'out',
              text: client.outbound[(k + i) % client.outbound.length] as string,
              ts: new Date(ts),
            });
            ts += (5 + Math.floor(rnd() * 90)) * MIN;
          }
        }
      }
      const visible = chat.filter((m) => m.ts.getTime() <= t);
      const firstIn = visible.find((m) => m.dir === 'in');
      const firstOut = firstIn && visible.find((m) => m.dir === 'out' && m.ts > firstIn.ts);

      leads.push({
        name,
        phoneE164: phoneOf(client, ci, i),
        email: emailOf(name, ci * 100 + i),
        source,
        campaign,
        answers,
        status,
        reason: status === 'not_qualified' ? pick(REASONS) : null,
        ownerIndex: isTest ? null : turn++ % activeManagers,
        isTest,
        createdAt,
        markedAt:
          status === 'new'
            ? null
            : new Date(createdAt.getTime() + Math.min(ageMin - 1, 24 * 60) * MIN),
        firstReplyAt: firstOut?.ts ?? null,
        chat: visible,
      });
    }

    // Follow-ups on the first qualified leads: some overdue, some done.
    const tasks: SeedTask[] = leads
      .map((l, leadIndex) => ({ l, leadIndex }))
      .filter(({ l }) => l.status === 'mql' || l.status === 'sql')
      .slice(0, 3)
      .map(({ leadIndex }, k) => ({
        leadIndex,
        title: pick(TASK_TITLES),
        dueAt: new Date(t + Math.round((rnd() * 5 - 1.5) * DAY)),
        done: k === 2,
      }));
    return { client, leads, tasks };
  });

  return { activeManagers, clients };
}

/** The calendar day of an instant in a time zone (YYYY-MM-DD), for "new today" in the client's own zone. */
const localDay = (d: Date, timeZone: string) =>
  new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);

/** `YYYY-MM-DD` shifted by whole days (calendar arithmetic, no time zone involved). */
const addDays = (day: string, n: number) =>
  new Date(Date.parse(`${day}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);

/**
 * The Overview numbers (F13a), worked out from the plan the way a person would: the window is the last 30 calendar
 * days in the client's zone (today included), rates over that window, and first reply = the first outbound message
 * after the first inbound one, measured on the chat itself (not on `firstReplyAt`). True median; whole minutes.
 */
function overviewOf(real: SeedLead[], timeZone: string, now: Date) {
  const today = localDay(now, timeZone);
  const days = Array.from({ length: 30 }, (_, i) => addDays(today, i - 29));
  const inWindow = real.filter((l) => localDay(l.createdAt, timeZone) >= (days[0] as string));
  const n = inWindow.length;
  const qualified = inWindow.filter((l) => l.status === 'mql' || l.status === 'sql').length;
  const sql = inWindow.filter((l) => l.status === 'sql').length;
  const replies = inWindow
    .map((l) => {
      const firstIn = l.chat.find((m) => m.dir === 'in');
      const firstOut = firstIn && l.chat.find((m) => m.dir === 'out' && m.ts > firstIn.ts);
      return firstIn && firstOut ? (firstOut.ts.getTime() - firstIn.ts.getTime()) / 1000 : null;
    })
    .filter((s): s is number => s !== null)
    .sort((a, b) => a - b);
  const mid = replies.length / 2;
  const medianS =
    replies.length === 0
      ? null
      : replies.length % 2
        ? (replies[Math.floor(mid)] as number)
        : ((replies[mid - 1] as number) + (replies[mid] as number)) / 2;
  const perDay = days.map(
    (d) => inWindow.filter((l) => localDay(l.createdAt, timeZone) === d).length,
  );
  const peak = Math.max(...perDay);
  const bySource: Record<string, number> = {};
  for (const l of inWindow) bySource[l.source] = (bySource[l.source] ?? 0) + 1;
  const round4 = (x: number) => Math.round(x * 10_000) / 10_000;
  return {
    leads30: n,
    mqlRate: n ? round4(qualified / n) : null,
    sqlRate: n ? round4(sql / n) : null,
    medianFirstReplyMin: medianS === null ? null : Math.round(medianS / 60),
    replied: replies.length,
    bySource,
    peak: { date: days[perDay.indexOf(peak)] as string, count: peak },
  };
}

/** The numbers a person would check on screen, per client, for a given `now` (tests and expected.json). */
export function summarise(plan: SeedPlan, now: Date) {
  const t = now.getTime();
  return Object.fromEntries(
    plan.clients.map(({ client, leads, tasks }) => {
      const real = leads.filter((l) => !l.isTest);
      return [
        client.key,
        {
          leads: leads.length,
          testLeads: leads.length - real.length,
          newToday: real.filter((l) => localDay(l.createdAt, client.timezone) === localDay(now, client.timezone)).length,
          byStatus: Object.fromEntries(
            (['new', 'mql', 'sql', 'not_qualified'] as const).map((s) => [
              s,
              real.filter((l) => l.status === s).length,
            ]),
          ),
          withChat: real.filter((l) => l.chat.length > 0).length,
          unreplied: real.filter((l) => l.chat.at(-1)?.dir === 'in').length,
          overdueTasks: tasks.filter((k) => !k.done && k.dueAt.getTime() < t).length,
          overview: overviewOf(real, client.timezone, now),
        },
      ];
    }),
  );
}
