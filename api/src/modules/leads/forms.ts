import { and, eq } from 'drizzle-orm';
import type { MappingTarget } from '../../contracts/leads.ts';
import { AppError } from '../../lib/errors/index.ts';
import type { ResolvedSession } from '../../lib/http/route.ts';
import { withTenant } from '../../lib/tenant/index.ts';
import { audit } from '../audit/index.ts';
import { actorOf } from '../auth/index.ts';
import { leadForms } from './schema.ts';

/**
 * Saves a form's field mapping (F4a S2): the connect wizard's "Check the fields" step, used by staff and by a client
 * user on its own client (`integration.manage`; RLS lead_forms is 'write' for clients). A form of another client, or
 * one that does not exist, is NOT_FOUND. The next lead from this form is mapped with it (ingestLead).
 */
export async function saveFormMapping(
  session: ResolvedSession,
  formId: string,
  input: { projectId: string; mapping: Record<string, MappingTarget> },
): Promise<{ ok: true }> {
  return withTenant(session, async (tx) => {
    const [form] = await tx
      .update(leadForms)
      .set({ mapping: input.mapping })
      .where(and(eq(leadForms.id, formId), eq(leadForms.projectId, input.projectId)))
      .returning({ id: leadForms.id });
    if (!form) throw new AppError('NOT_FOUND');
    await audit(tx, {
      actor: actorOf(session),
      action: 'form.mapping_saved',
      projectId: input.projectId,
      entity: 'lead_form',
      entityId: form.id,
      meta: { fields: Object.keys(input.mapping).length },
    });
    return { ok: true as const };
  });
}
