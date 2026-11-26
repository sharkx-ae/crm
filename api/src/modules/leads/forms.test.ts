import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { rawClient, seedWorld, type World } from '../../../tests/helpers/db.ts';
import { asSession, buildTestApp, seedUser, signIn } from '../../../tests/helpers/http.ts';
import { getPool } from '../../db/index.ts';
import { setEmailTransport } from '../../lib/email/index.ts';
import { withSystem } from '../../lib/tenant/index.ts';
import { leadForms } from './schema.ts';

let app: FastifyInstance;
let w: World;
let managerToken: string;
let clientAToken: string;
let formA: string;
let formB: string;
const db = rawClient();

async function formOf(projectId: string, integrationId: string): Promise<string> {
  const [row] = await withSystem(projectId, (tx) =>
    tx
      .insert(leadForms)
      .values({ projectId, integrationId, externalFormId: `f-${randomUUID()}`, name: 'Form' })
      .returning({ id: leadForms.id }),
  );
  return row?.id as string;
}

beforeAll(async () => {
  const built = await buildTestApp();
  app = built.app;
  await db.connect();
  w = await seedWorld();
  managerToken = (await signIn(app, built.mail, (await seedUser({ role: 'manager' })).email)).token;
  const clientA = await seedUser({ role: 'client', projectId: w.a.projectId });
  clientAToken = (await signIn(app, built.mail, clientA.email)).token;
  formA = await formOf(w.a.projectId, w.a.integrationId);
  formB = await formOf(w.b.projectId, w.b.integrationId);
});
afterAll(async () => {
  await app.close();
  await db.end();
  setEmailTransport(undefined);
  await getPool().end();
});

const put = (
  formId: string,
  projectId: string,
  token: string,
  mapping: Record<string, string> = { Mobile: 'phone' },
) =>
  app.inject({
    method: 'PUT',
    url: `/lead-forms/${formId}/mapping`,
    headers: asSession(token),
    payload: { projectId, mapping },
  });

describe('PUT /lead-forms/:id/mapping', () => {
  it('staff save a mapping; it is stored and audited once', async () => {
    const res = await put(formA, w.a.projectId, managerToken, {
      'Full name': 'name',
      Consent: 'ignore',
    });
    expect(res.statusCode).toBe(200);
    const { rows } = await db.query('select mapping from lead_forms where id = $1', [formA]);
    expect(rows[0].mapping).toEqual({ 'Full name': 'name', Consent: 'ignore' });
    const audits = await db.query(
      "select count(*) n from audit_log where entity_id = $1 and action = 'form.mapping_saved'",
      [formA],
    );
    expect(Number(audits.rows[0].n)).toBe(1);
  });

  it('a client user saves the mapping of its own client', async () => {
    expect((await put(formA, w.a.projectId, clientAToken)).statusCode).toBe(200);
  });

  it('a client user gets 404 for another client, whether it names that client or not', async () => {
    expect((await put(formB, w.b.projectId, clientAToken)).statusCode).toBe(404);
    expect((await put(formB, w.a.projectId, clientAToken)).statusCode).toBe(404);
  });

  it('a form that does not belong to the named client is 404, even for staff', async () => {
    expect((await put(formB, w.a.projectId, managerToken)).statusCode).toBe(404);
    expect((await put(randomUUID(), w.a.projectId, managerToken)).statusCode).toBe(404);
  });

  it('an unknown target is a validation error', async () => {
    expect((await put(formA, w.a.projectId, managerToken, { Mobile: 'fax' })).statusCode).toBe(422);
  });
});
