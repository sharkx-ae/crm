import { z } from 'zod';
import { email, healthState, source } from './common.ts';

// F2a/F2b shapes (web plan §2.5, §4.2). A project is one client.
export const projectCity = z.enum(['Dubai', 'Abu Dhabi', 'Morocco']);

// Token colours only (brand skill): the service always returns one.
const color = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const timezone = z.string().refine((tz) => {
  try {
    new Intl.DateTimeFormat('en', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}, 'IANA time zone');
const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

// One entry per ISO weekday (1 = Monday … 7 = Sunday); seven different windows are possible.
export const businessHoursDay = z.object({
  day: z.number().int().min(1).max(7),
  open: z.boolean(),
  from: hhmm,
  to: hhmm,
});
export const businessHours = z
  .array(businessHoursDay)
  .length(7)
  .refine((days) => new Set(days.map((d) => d.day)).size === 7, 'one entry per weekday')
  .refine((days) => days.every((d) => !d.open || d.to > d.from), 'to must be after from');

// Project switcher rows (GET /projects/options): staff get all, a client only its own.
export const projectOption = z.object({
  id: z.uuid(),
  name: z.string(),
  city: z.string().nullable(),
  industry: z.string().nullable(),
  color,
  timezone: z.string(),
});
export const projectOptionsResponse = z.object({ options: z.array(projectOption) });

// GET /projects/:id and the response of PATCH /projects/:id/settings.
export const projectDetail = projectOption.extend({ businessHours });

// Clients home (GET /projects): `totals` ignore the search so the KPI strip stays put.
export const projectHomeRow = projectOption.extend({
  newToday: z.number().int().nonnegative(),
  unreplied: z.number().int().nonnegative(),
  overdue: z.number().int().nonnegative(),
  integrations: z.array(z.object({ platform: source, status: healthState })),
});
export const projectsHomeResponse = z.object({
  totals: z.object({
    newToday: z.number().int().nonnegative(),
    unreplied: z.number().int().nonnegative(),
    overdue: z.number().int().nonnegative(),
    toFix: z.number().int().nonnegative(),
  }),
  rows: z.array(projectHomeRow),
});

const name = z.string().trim().min(1).max(120);
export const createProjectRequest = z.object({
  name,
  city: projectCity,
  industry: z.string().trim().min(1).max(120),
  firstUser: z.object({ email, name }),
});
export const createProjectResponse = z.object({ projectId: z.uuid() });

// The body also carries projectId (even though the path has it) so can() runs before any read.
export const updateProjectSettingsRequest = z.object({
  projectId: z.uuid(),
  timezone,
  businessHours,
});

export type ProjectCity = z.infer<typeof projectCity>;
export type BusinessHoursDay = z.infer<typeof businessHoursDay>;
export type ProjectOption = z.infer<typeof projectOption>;
export type ProjectOptionsResponse = z.infer<typeof projectOptionsResponse>;
export type ProjectDetail = z.infer<typeof projectDetail>;
export type ProjectHomeRow = z.infer<typeof projectHomeRow>;
export type ProjectsHomeResponse = z.infer<typeof projectsHomeResponse>;
export type CreateProjectRequest = z.infer<typeof createProjectRequest>;
export type UpdateProjectSettingsRequest = z.infer<typeof updateProjectSettingsRequest>;
