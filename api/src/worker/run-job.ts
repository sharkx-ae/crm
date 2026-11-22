import { randomUUID } from 'node:crypto';
import type { JobWithMetadata } from 'pg-boss';
import { type JobName, type JobPayload, jobs } from '../contracts/jobs.ts';
import { runWithContext } from '../lib/context/index.ts';
import { reportError } from '../lib/errors/index.ts';
import { createLogger } from '../lib/log/index.ts';
import { redactString } from '../lib/log/redact.ts';

export type JobHandler<N extends JobName> = (
  data: JobPayload<N>,
  job: { id: string; retryCount: number },
) => Promise<void>;

type Options<N extends JobName> = {
  /** Groups alerts: `job:<name>:<tag>`; default is the bare job name. Must not carry personal data. */
  tag?: (data: JobPayload<N>) => string;
  log?: ReturnType<typeof createLogger>;
};

/**
 * Wraps a handler for pg-boss: validates the payload, gives the job its own request context and log line, and on the
 * LAST attempt (retryCount >= retryLimit) reports the failure to error_log and the alert inbox before rethrowing,
 * so pg-boss marks the job failed. Earlier attempts just rethrow and pg-boss retries with backoff.
 */
export function runJob<N extends JobName>(name: N, handler: JobHandler<N>, o: Options<N> = {}) {
  const log = o.log ?? createLogger('info', { service: 'worker' });

  return async (batch: JobWithMetadata<object>[]): Promise<void> => {
    for (const job of batch) {
      await runWithContext({ requestId: job.id ?? randomUUID(), auditCount: 0 }, async () => {
        const started = Date.now();
        let tag = '';
        try {
          const data = jobs[name].parse(job.data) as JobPayload<N>;
          tag = o.tag?.(data) ?? '';
          await handler(data, { id: job.id, retryCount: job.retryCount });
          log.info('job done', { job: name, jobId: job.id, ms: Date.now() - started });
        } catch (err) {
          const last = job.retryCount >= job.retryLimit;
          log.warn('job failed', {
            job: name,
            jobId: job.id,
            attempt: job.retryCount + 1,
            of: job.retryLimit + 1,
            last,
            errorName: err instanceof Error ? err.name : 'unknown',
          });
          if (last) {
            await reportError({
              source: 'job',
              fingerprint: `job:${name}${tag ? `:${tag}` : ''}`,
              message: failureMessage(name, job, err),
              context: { job: name, jobId: job.id, attempts: job.retryCount + 1 },
            });
          }
          throw err; // pg-boss retries, or marks it failed after the last attempt
        }
      });
    }
  };
}

/** Error name, the cause's message when there is one, all redacted: provider errors can echo an address. */
function failureMessage(name: string, job: JobWithMetadata<object>, err: unknown): string {
  const e = err instanceof Error ? err : new Error(String(err));
  const cause = e.cause instanceof Error ? `: ${e.cause.message}` : '';
  return redactString(`${name} failed after ${job.retryCount + 1} attempts (${e.name}${cause})`);
}
