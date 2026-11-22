import { getContext } from '../context/index.ts';
import { getEmailEnv } from '../env.ts';
import { redactRecord, redactString } from '../log/redact.ts';
import { enqueue } from '../queue/index.ts';
import { hit, rateKey, rules } from '../rate-limit/index.ts';
import { withSystem } from '../tenant/index.ts';
import { errorLog } from './schema.ts';

// Plan §6.7 alerts. Every report is stored; the alert email is rate-limited to one per fingerprint per hour, so ten
// identical errors leave ten error_log rows and one email. Message and context are redacted first: Postgres errors
// echo values (duplicate keys), and nothing here may carry PII, tokens or message bodies.
export type ErrorReport = {
  source: 'api' | 'job' | 'web';
  /** Stable grouping key, e.g. `api:/users/invite:Error` or `job:email.send:invite`. */
  fingerprint: string;
  message: string;
  context?: Record<string, unknown>;
};

/** A failed alert email is only logged: alerting about the alerting would loop. */
const NEVER_ALERT = 'job:email.send:alert';

/** Never throws: reporting must not turn one failure into two. */
export async function reportError(report: ErrorReport): Promise<void> {
  try {
    const message = redactString(report.message);
    const fingerprint = redactString(report.fingerprint).slice(0, 200);
    const context = redactRecord({
      source: report.source,
      requestId: getContext().requestId,
      ...report.context,
    });

    const alert = await withSystem(null, async (tx) => {
      await tx.insert(errorLog).values({ fingerprint, message, context });
      if (fingerprint === NEVER_ALERT) return false;
      return (await hit(tx, rateKey('alert', fingerprint), rules.alert)).allowed;
    });
    if (!alert) return;

    const env = getEmailEnv();
    if (!env.ALERT_EMAIL) return; // local development: error_log only
    await enqueue(
      'email.send',
      {
        to: env.ALERT_EMAIL,
        template: 'alert',
        locale: 'en',
        data: { fingerprint, message, appEnv: env.APP_ENV },
      },
      { singletonKey: `alert:${fingerprint}:${Math.floor(Date.now() / 3_600_000)}` },
    );
  } catch (err) {
    console.error(
      JSON.stringify({
        level: 'error',
        msg: 'reportError failed',
        errorName: err instanceof Error ? err.name : 'unknown',
      }),
    );
  }
}
