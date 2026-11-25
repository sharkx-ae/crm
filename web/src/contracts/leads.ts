// GENERATED from api/src/contracts by scripts/sync-contracts.mjs. Do not edit; change the source and re-run the script.
import { z } from 'zod';
import { actorKind, e164, email, iso, leadStatus, source } from './common.ts';

// F4a/F4b shapes (web plan §3.4, §4.1, §4.4). Responses carry a `view` so a client-role
// shape is always the strict allowlist and a new endpoint cannot forget the projection.
export const leadTab = z.enum(['all', 'unreviewed', 'mql', 'sql', 'not_qualified']);
const owner = z.union([z.uuid(), z.literal('unassigned')]);

// The query of a read by id (GET /leads/:id, GET /contacts/:id): can() runs on the client before the row is read.
export const projectScope = z.object({ projectId: z.uuid() });

// GET /leads. `limit` pages by "Show 20 more", up to 200.
export const leadsQuery = z.object({
  projectId: z.uuid(),
  tab: leadTab.default('all'),
  q: z.string().trim().max(120).optional(),
  source: source.optional(),
  owner: owner.optional(),
  limit: z.coerce.number().int().min(1).max(200).default(20),
});

// The client allowlist (CONTRACTS §1: never owner, stage, notes, events, tasks, isTest).
const clientLeadShape = {
  id: z.uuid(),
  name: z.string().nullable(),
  phone: e164.nullable(),
  phoneDisplay: z.string().nullable(),
  email: email.nullable(),
  source,
  campaign: z.string().nullable(),
  status: leadStatus,
  reason: z.string().nullable(),
  createdAt: iso,
  answers: z.record(z.string(), z.string()),
};
export const clientLeadRow = z.object(clientLeadShape).strict();
export const clientLeadKeys = Object.keys(clientLeadShape) as (keyof typeof clientLeadShape)[];
export const staffLeadRow = z.object({
  ...clientLeadShape,
  ownerId: z.uuid().nullable(),
  ownerName: z.string().nullable(),
});

const counts = z.object({
  all: z.number().int().nonnegative(),
  unreviewed: z.number().int().nonnegative(),
  mql: z.number().int().nonnegative(),
  sql: z.number().int().nonnegative(),
  not_qualified: z.number().int().nonnegative(),
});
const pageBase = { counts, total: z.number().int().nonnegative(), sources: z.array(source) };
// The owner filter (staff): active managers, plus anyone else who still owns a lead of this client.
const ownerChoice = z.object({ id: z.uuid(), name: z.string(), active: z.boolean() });
export const leadsPage = z.discriminatedUnion('view', [
  z.object({
    view: z.literal('staff'),
    ...pageBase,
    rows: z.array(staffLeadRow),
    owners: z.array(ownerChoice),
  }),
  z.object({ view: z.literal('client'), ...pageBase, rows: z.array(clientLeadRow) }),
]);

const qualification = z.object({
  mqlDefinition: z.string(),
  sqlDefinition: z.string(),
  reasons: z.array(z.string()),
});
// Staff see the owner choices and the timeline; the client shape has neither.
export const leadDetail = z.discriminatedUnion('view', [
  z.object({
    view: z.literal('staff'),
    lead: staffLeadRow,
    qualification,
    whatsappState: z.enum(['none', 'replied', 'unreplied']),
    owners: z.array(z.object({ id: z.uuid(), name: z.string() })),
    timeline: z.array(
      z.object({
        id: z.uuid(),
        kind: z.string(),
        data: z.record(z.string(), z.unknown()),
        actorKind,
        actorName: z.string().nullable(),
        at: iso,
      }),
    ),
  }),
  z.object({ view: z.literal('client'), lead: clientLeadRow, qualification }),
]);

// POST /leads/:id/status. Not qualified needs a reason from qualification_settings (checked by the service).
export const markLeadRequest = z.object({
  projectId: z.uuid(),
  to: z.enum(['mql', 'sql', 'not_qualified']),
  reason: z.string().trim().min(1).max(200).optional(),
});
const outboxQueued = z.number().int().nonnegative();
export const markLeadResponse = z.discriminatedUnion('view', [
  z.object({ view: z.literal('staff'), lead: staffLeadRow, outboxQueued }),
  z.object({ view: z.literal('client'), lead: clientLeadRow, outboxQueued }),
]);

// POST /leads/:id/assign (staff only). null = unassign; the owner must be an active manager.
export const assignLeadRequest = z.object({ projectId: z.uuid(), ownerId: z.uuid().nullable() });
export const assignLeadResponse = z.object({ lead: staffLeadRow });

// Per-form field mapping (the connect wizard's "Check the fields" step).
export const mappingTarget = z.enum(['name', 'phone', 'email', 'custom', 'notes', 'ignore']);
export const saveFormMappingRequest = z.object({
  projectId: z.uuid(),
  mapping: z.record(z.string(), mappingTarget),
});

// POST /leads/export: same filters as the list, no paging. Test leads never appear.
export const leadExportRequest = z.object({
  projectId: z.uuid(),
  tab: leadTab.default('all'),
  q: z.string().trim().max(120).optional(),
  source: source.optional(),
  owner: owner.optional(),
});
const exportRowShape = {
  name: z.string().nullable(),
  phone: e164.nullable(),
  email: email.nullable(),
  source,
  campaign: z.string().nullable(),
  status: leadStatus,
  reason: z.string().nullable(),
  receivedAt: iso,
};
export const leadExportRows = z.discriminatedUnion('view', [
  z.object({
    view: z.literal('staff'),
    rows: z.array(z.object({ ...exportRowShape, ownerName: z.string().nullable() })).max(10_000),
  }),
  z.object({
    view: z.literal('client'),
    rows: z.array(z.object(exportRowShape).strict()).max(10_000),
  }),
]);

export type LeadTab = z.infer<typeof leadTab>;
export type ProjectScope = z.infer<typeof projectScope>;
export type LeadsQuery = z.infer<typeof leadsQuery>;
export type ClientLeadRow = z.infer<typeof clientLeadRow>;
export type StaffLeadRow = z.infer<typeof staffLeadRow>;
export type LeadsPage = z.infer<typeof leadsPage>;
export type LeadDetail = z.infer<typeof leadDetail>;
export type MarkLeadRequest = z.infer<typeof markLeadRequest>;
export type MarkLeadResponse = z.infer<typeof markLeadResponse>;
export type AssignLeadRequest = z.infer<typeof assignLeadRequest>;
export type MappingTarget = z.infer<typeof mappingTarget>;
export type SaveFormMappingRequest = z.infer<typeof saveFormMappingRequest>;
export type LeadExportRequest = z.infer<typeof leadExportRequest>;
export type LeadExportRows = z.infer<typeof leadExportRows>;
