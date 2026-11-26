import { asc, eq, inArray, sql } from 'drizzle-orm';
import type { ProjectDetail, ProjectOption } from '../../contracts/projects.ts';
import { AppError } from '../../lib/errors/index.ts';
import type { ResolvedSession } from '../../lib/http/route.ts';
import { withTenant } from '../../lib/tenant/index.ts';
import { colorFor } from './colors.ts';
import { toDailyHours } from './hours.ts';
import { projects } from './schema.ts';

const optionColumns = {
  id: projects.id,
  name: projects.name,
  city: projects.city,
  industry: projects.industry,
  color: projects.color,
  timezone: projects.timezone,
};

type OptionRow = { [K in keyof typeof optionColumns]: (typeof projects.$inferSelect)[K] };
const toOption = (r: OptionRow): ProjectOption => ({ ...r, color: colorFor(r.id, r.color) });

/** Project switcher rows: staff see every client, a client user only its own (RLS, and filtered here as well). */
export async function listProjectOptions(session: ResolvedSession): Promise<ProjectOption[]> {
  if (session.role === 'client' && session.projectIds.length === 0) return [];
  const rows = await withTenant(session, (tx) => {
    const q = tx.select(optionColumns).from(projects);
    const scoped =
      session.role === 'client' ? q.where(inArray(projects.id, session.projectIds)) : q;
    return scoped.orderBy(asc(sql`lower(${projects.name})`));
  });
  return rows.map(toOption);
}

/** One client. Unknown, or not the caller's: NOT_FOUND for every role, so the answer never reveals that it exists. */
export async function getProjectDetail(
  session: ResolvedSession,
  projectId: string,
): Promise<ProjectDetail> {
  if (session.role === 'client' && !session.projectIds.includes(projectId)) {
    throw new AppError('NOT_FOUND');
  }
  const [row] = await withTenant(session, (tx) =>
    tx
      .select({ ...optionColumns, businessHours: projects.businessHours })
      .from(projects)
      .where(eq(projects.id, projectId)),
  );
  if (!row) throw new AppError('NOT_FOUND');
  const { businessHours, ...option } = row;
  return { ...toOption(option), businessHours: toDailyHours(businessHours) };
}
