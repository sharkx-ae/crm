import { PgBoss } from 'pg-boss';
import { type JobName, type JobPayload, jobs } from '../../contracts/jobs.ts';
import { getDbEnv } from '../env.ts';
import { queuePolicies } from './policy.ts';

export { queuePolicies } from './policy.ts';

// Job producer for the api (and for the worker's own follow-ups). The api never consumes: it starts pg-boss with
// supervise and schedule off and a pool of 2, so the worker stays the only process doing maintenance. pg-boss
// installs its schema under an advisory lock, so whichever service starts first is fine.
let starting: Promise<PgBoss> | undefined;
const known = new Set<string>();

export function getBoss(): Promise<PgBoss> {
  starting ??= (async () => {
    const boss = new PgBoss({
      connectionString: getDbEnv().DATABASE_URL,
      max: 2,
      supervise: false,
      schedule: false,
    });
    boss.on('error', () => undefined); // surfaced through queueHealth; the message may carry connection details
    await boss.start();
    return boss;
  })().catch((err: unknown) => {
    starting = undefined; // the next call tries again
    throw err;
  });
  return starting;
}

/** The queue must exist before the first send; the worker normally created it already. */
async function ensureQueue(boss: PgBoss, name: JobName): Promise<void> {
  if (known.has(name)) return;
  const { cron: _cron, ...options } = queuePolicies[name];
  await boss.createQueue(name, options);
  known.add(name);
}

/**
 * Adds a job. Call it AFTER the producing transaction commits (plan R7: no transactional enqueue in F1). The payload is
 * checked against the contract, so a producer cannot queue something the consumer would reject. `singletonKey` makes a
 * repeated send of the same work within the window (default 1 h) a no-op (returns null). No secret ever belongs in a payload.
 */
export async function enqueue<N extends JobName>(
  name: N,
  data: JobPayload<N>,
  opts: { singletonKey?: string; singletonSeconds?: number; startAfter?: number | Date } = {},
): Promise<string | null> {
  const payload = jobs[name].parse(data);
  const boss = await getBoss();
  await ensureQueue(boss, name);
  // pg-boss only dedupes a singletonKey inside a time window, so a key always comes with one (an hour by default).
  const { singletonKey, singletonSeconds, startAfter } = opts;
  return boss.send(name, payload, {
    startAfter,
    ...(singletonKey ? { singletonKey, singletonSeconds: singletonSeconds ?? 3600 } : {}),
  });
}

/** 'ok' when pg-boss is installed and reachable; never throws. */
export async function queueHealth(timeoutMs = 2000): Promise<'ok' | 'error'> {
  try {
    const check = (async () => (await getBoss()).isInstalled())();
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('timeout')), timeoutMs),
    );
    return (await Promise.race([check, timeout])) ? 'ok' : 'error';
  } catch {
    return 'error';
  }
}

export async function stopQueue(): Promise<void> {
  const p = starting;
  starting = undefined;
  known.clear();
  if (p) await (await p.catch(() => undefined))?.stop({ graceful: false, close: true });
}
