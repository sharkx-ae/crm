import type { PgBoss } from 'pg-boss';
import type { JobName, JobPayload } from '../contracts/jobs.ts';
import { queuePolicies } from '../lib/queue/policy.ts';
import { emailSend, emailTag } from './jobs/email.ts';
import { maintenance } from './jobs/maintenance.ts';
import { type JobHandler, runJob } from './run-job.ts';

// Every queue in CONTRACTS §5 with its retry policy (lib/queue/policy.ts). A queue without a `handler` still exists, so
// producers can send to it; its owner fills the slot in the feature that consumes it (F3 webhooks, F11 conversions,
// F14 integration health...). A cron is scheduled only once its queue has a handler.
export type Entry<N extends JobName> = {
  handler?: JobHandler<N>;
  tag?: (data: JobPayload<N>) => string;
};
export type Registry = { [N in JobName]: Entry<N> };

export const registry: Registry = {
  'webhook.process': {}, // F3b
  'wa.history.sync': {}, // F3e
  'conversion.send': {}, // F11a
  'integration.health': {}, // F14a
  'automation.timer': {}, // F9
  'task.reminder': {}, // F8
  'email.send': { handler: emailSend, tag: emailTag },
  'csv.import': {}, // F7
  maintenance: { handler: maintenance },
};

type Logger = { info(msg: string, data?: Record<string, unknown>): void };

/** Creates every queue, attaches the handlers that exist and schedules their crons. Safe to run on every boot. */
export async function registerQueues(
  boss: PgBoss,
  log: Logger,
  entries: Registry = registry,
  policies = queuePolicies,
  workOptions: { pollingIntervalSeconds?: number } = {},
): Promise<string[]> {
  const working: string[] = [];
  for (const name of Object.keys(entries) as JobName[]) {
    const { cron, ...policy } = policies[name];
    await boss.createQueue(name, policy);
    const entry = entries[name] as Entry<JobName>;
    if (!entry.handler) continue;
    await boss.work(
      name,
      { includeMetadata: true, batchSize: 1, ...workOptions },
      runJob(name, entry.handler as JobHandler<JobName>, {
        tag: entry.tag as never,
        log: logger(log),
      }),
    );
    if (cron) await boss.schedule(name, cron, {}, { tz: 'UTC' });
    working.push(name);
  }
  log.info('queues registered', { queues: Object.keys(entries).length, working });
  return working;
}

const logger = (log: Logger) => ({
  info: (m: string, d?: Record<string, unknown>) => log.info(m, d),
  warn: (m: string, d?: Record<string, unknown>) => log.info(m, d),
  error: (m: string, d?: Record<string, unknown>) => log.info(m, d),
  debug: () => undefined,
});
