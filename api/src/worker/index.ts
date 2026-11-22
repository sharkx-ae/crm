// Worker service entry (`pnpm start:worker`). Runs pg-boss consumers; started by Railway's worker service.
// Runs under Node's native TypeScript support: relative imports with explicit .ts extensions, no path aliases.
import { PgBoss } from 'pg-boss';
import { getWorkerEnv } from '../lib/env.ts';
import { createLogger } from '../lib/log/index.ts';
import { stopQueue } from '../lib/queue/index.ts';
import { registerQueues } from './registry.ts';

const env = getWorkerEnv();
const log = createLogger(env.LOG_LEVEL, { service: 'worker', appEnv: env.APP_ENV });

// The worker owns supervision (retries, expiry, cleanup) and the cron schedule; the api only produces.
const boss = new PgBoss(env.DATABASE_URL);
boss.on('error', (err: Error) => log.error('pg-boss error', { errorName: err.name }));

await boss.start();
await registerQueues(boss, log);
log.info('worker started');

const shutdown = async (signal: string) => {
  log.info('worker stopping', { signal });
  // Graceful: running jobs finish; anything still queued stays in Postgres and resumes at the next boot.
  await boss.stop({ graceful: true });
  await stopQueue();
  process.exit(0);
};
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
