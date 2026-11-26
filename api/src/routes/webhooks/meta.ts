import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { safeEqual } from '../../lib/crypto/index.ts';
import { type ApiEnv, metaEnvOf } from '../../lib/env.ts';
import { AppError } from '../../lib/errors/index.ts';
import { defineRoute } from '../../lib/http/route.ts';
import { enqueue as defaultEnqueue } from '../../lib/queue/index.ts';
import { storeWebhook, verifyMetaSignature } from '../../modules/webhooks/index.ts';

// F3a / F3.2: Meta's callback for WhatsApp now and Lead Ads later (`object` tells them apart; F3b dispatches on it).
// Verify the signature → store the raw event (unique key) → queue → 200. No parsing of changes, no project lookup here.
const MAX_BODY = 5 * 1024 * 1024; // history webhooks can be large; every other route keeps Fastify's 1 MiB

const handshakeQuery = z.object({
  'hub.mode': z.literal('subscribe'),
  'hub.verify_token': z.string().max(256),
  'hub.challenge': z
    .string()
    .max(256)
    .regex(/^[\w-]+$/),
});
const envelope = z.object({ object: z.string(), entry: z.array(z.unknown()) });

type Deps = { env: ApiEnv; enqueue?: typeof defaultEnqueue };

// Its own (encapsulated) plugin: the raw-buffer parser below applies to these two routes only.
export const metaWebhookRoutes: FastifyPluginAsync<Deps> = async (app, { env, enqueue }) => {
  const send = enqueue ?? defaultEnqueue;
  const meta = metaEnvOf(env);

  // Only a JSON body reaches the handler, as raw bytes; any other content type (even text/plain) is a 415 -> 422.
  app.removeAllContentTypeParsers();
  app.addContentTypeParser(
    'application/json',
    { parseAs: 'buffer', bodyLimit: MAX_BODY },
    (_req, body, done) => done(null, body),
  );

  // Handshake, once, when "Verify and save" is pressed in the Meta dashboard. Stores nothing.
  defineRoute(
    app,
    {
      method: 'GET',
      url: '/webhooks/meta',
      access: 'public',
      // Not parsed by the route: anything wrong here is a plain 403, never a field-by-field 422.
      query: z.record(z.string(), z.unknown()),
      response: z.string(),
    },
    async ({ query, reply }) => {
      if (!meta?.webhookVerifyToken) throw new AppError('NOT_FOUND');
      const q = handshakeQuery.safeParse(query);
      if (!q.success || !safeEqual(q.data['hub.verify_token'], meta.webhookVerifyToken)) {
        throw new AppError('FORBIDDEN');
      }
      reply.type('text/plain');
      return q.data['hub.challenge'];
    },
  );

  defineRoute(
    app,
    {
      method: 'POST',
      url: '/webhooks/meta',
      access: 'public',
      body: z.unknown(), // the raw Buffer from the parser above; checked after the signature, not before
      response: z.object({ ok: z.literal(true) }),
      audit: 'none',
    },
    async ({ body, req }) => {
      if (!meta) throw new AppError('NOT_FOUND');

      // 1. Who sent it: the signature over the exact bytes. Nothing is stored or queued before this passes.
      if (
        !Buffer.isBuffer(body) ||
        !verifyMetaSignature(body, req.headers['x-hub-signature-256'], meta.appSecret)
      ) {
        req.log.warn({ route: '/webhooks/meta', reason: 'bad_signature' }, 'webhook rejected');
        throw new AppError('UNAUTHENTICATED');
      }

      // 2. Parse. A genuine Meta body is always JSON; this cannot fail for the real sender.
      let payload: unknown;
      try {
        payload = JSON.parse(body.toString('utf8'));
      } catch {
        throw new AppError('VALIDATION');
      }
      // A signed body with an unexpected envelope is still stored (F3b marks the row with an error): refusing
      // it would make Meta retry for 7 days.
      if (!envelope.safeParse(payload).success) {
        req.log.warn({ route: '/webhooks/meta', reason: 'odd_envelope' }, 'webhook envelope');
      }

      // 3. Store the raw event, then queue it (after the commit). A duplicate already processed is not queued again.
      const stored = await storeWebhook('meta', body, payload);
      if (!stored.duplicate || !stored.processed) {
        // If this throws the reply is 500, Meta retries, and the retry takes the duplicate branch and queues again.
        await send('webhook.process', { webhookEventId: stored.id }, { singletonKey: stored.id });
      }
      return { ok: true as const };
    },
  );
};
