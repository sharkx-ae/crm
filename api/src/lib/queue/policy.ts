import type { JobName } from '../../contracts/jobs.ts';

// Retry policy of every queue in CONTRACTS §5 (plan §6.7). Shared by the producer (lib/queue, which makes sure the
// queue exists before the first send) and the worker registry. Times are seconds. With `retryBackoff` the delay grows
// roughly as retryDelay * 2^retryCount with jitter.
export type QueuePolicy = {
  retryLimit: number;
  retryDelay?: number;
  retryBackoff?: boolean;
  expireInSeconds?: number;
  deleteAfterSeconds?: number;
  /** UTC cron; the worker schedules it once the queue has a handler. */
  cron?: string;
};

export const queuePolicies: Record<JobName, QueuePolicy> = {
  'webhook.process': { retryLimit: 5, retryDelay: 10, retryBackoff: true },
  'wa.history.sync': { retryLimit: 3, retryDelay: 60, retryBackoff: true, expireInSeconds: 3600 },
  'conversion.send': { retryLimit: 8, retryDelay: 10, retryBackoff: true },
  'integration.health': { retryLimit: 0, cron: '*/5 * * * *' },
  'automation.timer': { retryLimit: 3 },
  'task.reminder': { retryLimit: 3 },
  // Alerts and reminders only: invite, code and reset mails carry a secret and are sent directly, never queued.
  'email.send': { retryLimit: 5, retryDelay: 30, retryBackoff: true, deleteAfterSeconds: 86_400 },
  'csv.import': { retryLimit: 0 },
  maintenance: { retryLimit: 0, cron: '0 3 * * *' },
};
