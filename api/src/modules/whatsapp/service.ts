import { and, asc, eq, or } from 'drizzle-orm';
import type { WaConnectRequest, WaNumber, WaNumbersResponse } from '../../contracts/whatsapp.ts';
import { type Keyring, parseKeyring, sealToken } from '../../lib/crypto/index.ts';
import { type ApiEnv, type MetaEnv, metaEnvOf } from '../../lib/env.ts';
import { AppError } from '../../lib/errors/index.ts';
import type { ResolvedSession } from '../../lib/http/route.ts';
import { emitChange, withSystem, withTenant } from '../../lib/tenant/index.ts';
import { audit } from '../audit/index.ts';
import { actorOf } from '../auth/actor.ts';
import { integrations, integrationTokens } from '../integrations/hub/schema.ts';
import { projects } from '../projects/schema.ts';
import {
  debugToken,
  exchangeCode,
  GraphError,
  type GraphPhoneNumber,
  listPhoneNumbers,
  subscribeApp,
} from './graph.ts';
import { toE164 } from './phone.ts';
import { waNumbers } from './schema.ts';

// F3a / F3.1: connect a WhatsApp Business app number (Coexistence, the QR path) with the code and session info the browser
// got from Embedded Signup v5. Plan §6.1. The token never leaves `connectWhatsApp`: not in the response, a log, the audit
// row, an error or a job payload.

/** What the service needs from the environment; null parts mean the feature is off. */
export type WaConfig = { meta: MetaEnv | null; ring: Keyring | null };

export function waConfigOf(env: ApiEnv): WaConfig {
  return {
    meta: metaEnvOf(env),
    ring: env.TOKEN_ENC_KEY ? parseKeyring(env.TOKEN_ENC_KEY, env.TOKEN_ENC_KEYS_OLD) : null,
  };
}

/** Failure reasons the UI shows in plain words (`integrations.whatsapp.reasons.<reason>`). */
export type WaReason =
  | 'not_configured'
  | 'qr_only'
  | 'code_expired'
  | 'waba_mismatch'
  | 'no_number'
  | 'subscribe_failed'
  | 'graph_unavailable'
  | 'number_taken';

type Log = { warn(obj: Record<string, unknown>, msg: string): void };

const fail = (reason: WaReason): never => {
  throw new AppError(reason === 'number_taken' ? 'CONFLICT' : 'INTEGRATION_ERROR', {
    details: { reason },
  });
};

/**
 * Runs a Graph call: Meta's own trouble (timeout, 5xx, odd shape) is `graph_unavailable`; a refusal becomes `rejected`.
 * Logged per failure: the route, the reason and Meta's codes: nothing else.
 */
async function graph<T>(
  log: Log,
  rejected: WaReason,
  step: string,
  call: () => Promise<T>,
): Promise<T> {
  try {
    return await call();
  } catch (err) {
    if (!(err instanceof GraphError)) throw err;
    const reason: WaReason = err.kind === 'unavailable' ? 'graph_unavailable' : rejected;
    log.warn(
      {
        route: 'whatsapp.connect',
        step,
        reason,
        graphCode: err.code,
        graphSubcode: err.subcode,
        fbtraceId: err.fbtraceId,
      },
      'whatsapp connect failed',
    );
    return fail(reason);
  }
}

// Only these two keys mean "this number belongs to another client". Any other unique violation is a bug or a race and
// must surface as one, not as a misleading `number_taken`.
const NUMBER_KEYS = new Set(['wa_numbers_phone_number_id_unique', 'wa_numbers_phone_e164_unique']);
const isNumberTaken = (err: unknown): boolean => {
  const e = err as {
    code?: string;
    constraint?: string;
    cause?: { code?: string; constraint?: string };
  } | null;
  const pg = e?.code === '23505' ? e : e?.cause?.code === '23505' ? e.cause : null;
  return pg?.constraint !== undefined && NUMBER_KEYS.has(pg.constraint);
};

type NumberRow = typeof waNumbers.$inferSelect;
const toWaNumber = (r: NumberRow): WaNumber => ({
  id: r.id,
  phoneE164: r.phoneE164,
  label: r.label,
  syncState: r.syncState,
  syncPct: r.syncPct,
  onboardedAt: r.onboardedAt.toISOString(),
});

/** A project that does not exist (or is not visible to this user) is a 404, before anything is sent to Meta. */
async function assertProject(session: ResolvedSession, projectId: string): Promise<void> {
  const rows = await withTenant({ userId: session.userId, role: session.role }, (tx) =>
    tx.select({ id: projects.id }).from(projects).where(eq(projects.id, projectId)).limit(1),
  );
  if (rows.length === 0) throw new AppError('NOT_FOUND');
}

export async function connectWhatsApp(
  session: ResolvedSession,
  projectId: string,
  input: WaConnectRequest,
  cfg: WaConfig,
  log: Log,
): Promise<{ numbers: WaNumber[] }> {
  await assertProject(session, projectId);

  // 1. Not configured: Meta app settings or the token key are missing on this environment.
  const { meta, ring } = cfg;
  if (!meta || !ring) return fail('not_configured');

  // 2. QR path only (decision Q2): a new Cloud API number (`FINISH`) is refused before the code is exchanged.
  if (input.event === 'FINISH' || !input.isOnBizApp) return fail('qr_only');

  const gc = { appId: meta.appId, appSecret: meta.appSecret, graphVersion: meta.graphVersion };

  // 3. The code lives five minutes and is single use.
  const { accessToken } = await graph(log, 'code_expired', 'exchange', () =>
    exchangeCode(gc, input.code),
  );

  // 4. The browser's account ids are untrusted: the token itself says which WABAs it may touch. Without this check a
  //    user could attach someone else's WABA id to a valid code.
  const info = await graph(log, 'waba_mismatch', 'debug', () => debugToken(gc, accessToken));
  const wantedWabas = [...new Set(input.messagingAccountIds)];
  if (
    !info.isValid ||
    info.appId !== meta.appId ||
    !wantedWabas.every((id) => info.wabaIds.includes(id))
  ) {
    log.warn(
      { route: 'whatsapp.connect', step: 'debug', reason: 'waba_mismatch' },
      'whatsapp connect failed',
    );
    return fail('waba_mismatch');
  }

  // 5. The phone id must be one of that WABA's own numbers, and on the WhatsApp Business app (Coexistence).
  let found: { wabaId: string; number: GraphPhoneNumber } | null = null;
  for (const wabaId of wantedWabas) {
    const numbers = await graph(log, 'waba_mismatch', 'numbers', () =>
      listPhoneNumbers(gc, accessToken, wabaId),
    );
    const n = numbers.find((x) => x.id === input.phoneNumberId && x.isOnBizApp);
    if (n) {
      found = { wabaId, number: n };
      break;
    }
  }
  if (!found) return fail('no_number');
  const { wabaId, number } = found;

  let phoneE164: string;
  try {
    phoneE164 = toE164(number.displayPhoneNumber);
  } catch {
    log.warn(
      { route: 'whatsapp.connect', step: 'numbers', reason: 'graph_unavailable' },
      'whatsapp connect failed',
    );
    return fail('graph_unavailable'); // Meta sent a number we cannot read: treat as Meta's problem
  }

  // 6. Webhooks for this WABA. Idempotent, and harmless if the transaction below then refuses the number.
  await graph(log, 'subscribe_failed', 'subscribe', () => subscribeApp(gc, accessToken, wabaId));

  // 7. One transaction, as the system role for this project: `app_user` has no privilege on integration_tokens at all.
  //    The route already ran can('integration.manage', projectId); the audit row carries the real actor.
  try {
    return await withSystem(projectId, async (tx) => {
      const [integration] = await tx
        .insert(integrations)
        .values({
          projectId,
          platform: 'whatsapp',
          status: 'connected',
          mode: 'live',
          accountLabel: number.verifiedName,
          note: null,
        })
        .onConflictDoUpdate({
          target: [integrations.projectId, integrations.platform],
          set: {
            status: 'connected',
            mode: 'live',
            accountLabel: number.verifiedName,
            note: null,
            updatedAt: new Date(),
          },
        })
        .returning({ id: integrations.id });
      if (!integration) throw new Error('integration upsert returned nothing');

      // The value is bound to this row: copied to another client's row it would not open.
      const sealed = sealToken(
        ring,
        accessToken,
        `integration_tokens:${projectId}:${integration.id}:${wabaId}`,
      );
      const tokenRow = {
        projectId,
        integrationId: integration.id,
        accountRef: wabaId,
        encValue: sealed.encValue,
        keyId: sealed.keyId,
        expiresAt: info.expiresAt,
      };
      await tx
        .insert(integrationTokens)
        .values(tokenRow)
        .onConflictDoUpdate({
          target: [integrationTokens.integrationId, integrationTokens.accountRef],
          set: { encValue: sealed.encValue, keyId: sealed.keyId, expiresAt: info.expiresAt },
        });

      // Another client's row is invisible here (RLS); the unique keys still catch it (caught below as number_taken).
      // This client's own row: same Meta number id, or the same phone number under a new id (Meta issues a new
      // phone_number_id when a number is re-onboarded into another WABA). The id match wins.
      const mine = await tx
        .select()
        .from(waNumbers)
        .where(
          and(
            eq(waNumbers.projectId, projectId),
            or(eq(waNumbers.phoneNumberId, number.id), eq(waNumbers.phoneE164, phoneE164)),
          ),
        );
      const existing = mine.find((r) => r.phoneNumberId === number.id) ?? mine[0];
      const fresh = { syncState: 'none' as const, syncPct: 0, onboardedAt: new Date() };
      const [row] = existing
        ? await tx
            .update(waNumbers)
            .set({
              ...fresh,
              wabaId,
              phoneE164,
              phoneNumberId: number.id,
              label: existing.label ?? number.verifiedName,
            })
            .where(eq(waNumbers.id, existing.id))
            .returning()
        : await tx
            .insert(waNumbers)
            .values({
              ...fresh,
              projectId,
              phoneE164,
              label: number.verifiedName,
              phoneNumberId: number.id,
              wabaId,
            })
            .returning();
      if (!row) throw new Error('number upsert returned nothing');

      await audit(tx, {
        actor: actorOf(session),
        projectId,
        action: 'integration.connected',
        entity: 'integration',
        entityId: integration.id,
        meta: { platform: 'whatsapp', numberIds: [row.id], reconnect: existing !== undefined },
      });
      await emitChange(tx, 'health', projectId, integration.id); // the hub and the bell refresh
      return { numbers: [toWaNumber(row)] };
    });
  } catch (err) {
    // phone_number_id or phone_e164 already belongs to another client. Nothing about that client is revealed.
    if (isNumberTaken(err)) {
      log.warn(
        { route: 'whatsapp.connect', step: 'store', reason: 'number_taken' },
        'whatsapp connect failed',
      );
      return fail('number_taken');
    }
    throw err;
  }
}

/** The project's numbers, newest connection last. A client user only gets its own project (the route guard says 404 otherwise). */
export async function listWaNumbers(
  session: ResolvedSession,
  projectId: string,
  cfg: WaConfig,
): Promise<WaNumbersResponse> {
  await assertProject(session, projectId);
  const rows = await withTenant({ userId: session.userId, role: session.role }, (tx) =>
    tx
      .select()
      .from(waNumbers)
      .where(eq(waNumbers.projectId, projectId))
      .orderBy(asc(waNumbers.createdAt), asc(waNumbers.id)),
  );
  return {
    numbers: rows.map(toWaNumber),
    connect: { ready: Boolean(cfg.meta && cfg.ring), limited: cfg.meta?.limited ?? false },
  };
}
