import { randomUUID } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import type {
  CreateProjectRequest,
  ProjectDetail,
  UpdateProjectSettingsRequest,
} from '../../contracts/projects.ts';
import { AppError, reportError } from '../../lib/errors/index.ts';
import type { ResolvedSession } from '../../lib/http/route.ts';
import { withSystem, withTenant } from '../../lib/tenant/index.ts';
import { audit } from '../audit/index.ts';
import { actorOf, inviteUserTx } from '../auth/index.ts';
import { qualificationSettings } from '../leads/schema.ts';
import { pipelineStages } from '../pipeline/schema.ts';
import { colorFor, PROJECT_COLORS } from './colors.ts';
import { toDailyHours } from './hours.ts';
import { DEFAULT_BUSINESS_HOURS, projects } from './schema.ts';

// Create client (F2b S2) and client settings (F2b S4).

export const DEFAULT_STAGES = ['New', 'Contacted', 'Qualified', 'Visit booked', 'Won', 'Lost'];
const ZONE_BY_CITY: Record<CreateProjectRequest['city'], string> = {
  Dubai: 'Asia/Dubai',
  'Abu Dhabi': 'Asia/Dubai',
  Morocco: 'Africa/Casablanca',
};

/** "lina.haddad@clinic.ae" → "Lina Haddad" (D3: the modal asks only for the email). Never empty. */
export function nameFromEmail(email: string): string {
  // A "+tag" is a mailbox filter, not part of the name: "omar+crm@x.ae" → "Omar".
  const local = (email.split('@')[0] ?? '').split('+')[0] ?? '';
  const words = local
    .split(/[._-]+/)
    .map((w) => w.replace(/\d+/g, ''))
    .filter(Boolean)
    .map((w) => w.charAt(0).toLocaleUpperCase() + w.slice(1).toLocaleLowerCase());
  return words.join(' ') || local || email;
}

type PgError = { code?: string; constraint?: string; cause?: PgError };

/** The Postgres unique violation behind `err` (drizzle wraps it in `cause`), or null. */
const uniqueViolation = (err: unknown): PgError | null => {
  const e = err as PgError | null;
  if (e?.code === '23505') return e;
  if (e?.cause?.code === '23505') return e.cause;
  return null;
};
const CONFLICT_FIELD: Record<string, 'name' | 'email'> = {
  projects_name_lower_idx: 'name',
  users_email_unique: 'email',
};

/**
 * One transaction: the client (zone from the city, default hours, a token colour), the six default stages, the
 * qualification settings, then the first client user's invite. Any failure leaves nothing behind; the invite email
 * goes out only after the commit. Audit: project.created + user.invited (the route declares { count: 2 }).
 */
export async function createProject(
  session: ResolvedSession,
  input: CreateProjectRequest,
  o: { appUrl: string; now?: Date },
): Promise<{ projectId: string }> {
  const projectId = randomUUID();
  let deliver: () => Promise<void> = async () => {};
  try {
    await withSystem(projectId, async (tx) => {
      const [taken] = await tx
        .select({ id: projects.id })
        .from(projects)
        .where(sql`lower(${projects.name}) = lower(${input.name})`);
      if (taken) throw new AppError('CONFLICT', { details: { field: 'name' } });

      const [{ n } = { n: 0 }] = await tx.select({ n: sql<number>`count(*)::int` }).from(projects);
      await tx.insert(projects).values({
        id: projectId,
        name: input.name,
        city: input.city,
        industry: input.industry,
        timezone: ZONE_BY_CITY[input.city],
        businessHours: DEFAULT_BUSINESS_HOURS,
        color: PROJECT_COLORS[n % PROJECT_COLORS.length],
        createdBy: session.userId,
      });
      await tx
        .insert(pipelineStages)
        .values(DEFAULT_STAGES.map((name, i) => ({ projectId, name, position: i + 1 })));
      await tx.insert(qualificationSettings).values({ projectId });
      await audit(tx, {
        actor: actorOf(session),
        action: 'project.created',
        projectId,
        entity: 'project',
        entityId: projectId,
        meta: { city: input.city },
      });

      const invited = await inviteUserTx(
        tx,
        session,
        {
          kind: 'client',
          projectId,
          email: input.firstUser.email,
          name: input.firstUser.name?.trim() || nameFromEmail(input.firstUser.email),
        },
        o,
      );
      deliver = invited.deliver;
    });
  } catch (err) {
    // The unique indexes are the backstop for two creates racing on one name (or one email).
    const field = CONFLICT_FIELD[uniqueViolation(err)?.constraint ?? ''];
    if (field) throw new AppError('CONFLICT', { details: { field } });
    throw err;
  }
  // The client and its invite are committed: a failed send must not answer an error, or a retry would hit "name
  // taken" with the invite never sent. Report it instead; inviting the same email again reissues the link.
  try {
    await deliver();
  } catch (err) {
    await reportError({
      source: 'api',
      fingerprint: 'api:/projects:invite_delivery',
      message: 'client created but the first invite email failed',
      context: { projectId, errorName: err instanceof Error ? err.name : 'unknown' },
    });
  }
  return { projectId };
}

/** Time zone and seven per-day windows (F2b S4). Applies to future timers only (F12 reads it). */
export async function updateProjectSettings(
  session: ResolvedSession,
  projectId: string,
  input: UpdateProjectSettingsRequest,
): Promise<ProjectDetail> {
  if (input.projectId !== projectId) throw new AppError('NOT_FOUND');
  return withTenant(session, async (tx) => {
    const days = [...input.businessHours].sort((a, b) => a.day - b.day);
    const [row] = await tx
      .update(projects)
      .set({ timezone: input.timezone, businessHours: days, updatedAt: new Date() })
      .where(eq(projects.id, projectId))
      .returning({
        id: projects.id,
        name: projects.name,
        city: projects.city,
        industry: projects.industry,
        color: projects.color,
        timezone: projects.timezone,
        businessHours: projects.businessHours,
      });
    if (!row) throw new AppError('NOT_FOUND');
    await audit(tx, {
      actor: actorOf(session),
      action: 'project.updated',
      projectId,
      entity: 'project',
      entityId: projectId,
      meta: { timezone: input.timezone, openDays: days.filter((d) => d.open).length },
    });
    return {
      ...row,
      color: colorFor(row.id, row.color),
      businessHours: toDailyHours(row.businessHours),
    };
  });
}
