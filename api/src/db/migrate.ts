// `pnpm db:migrate` locally and as Railway's pre-deploy step for the api service.
// Uses drizzle-orm's migrator (a runtime dependency), so drizzle-kit is not needed in production.
import { getDbEnv } from '../lib/env.ts';
import { createLogger } from '../lib/log/index.ts';
import { runMigrations } from './migrator.ts';

const log = createLogger('info', { service: 'migrate' });

try {
  await runMigrations(getDbEnv().DATABASE_URL);
  log.info('migrations applied');
} catch (err) {
  log.error('migration failed', { error: err instanceof Error ? err.message : String(err) });
  process.exitCode = 1;
}
