// Public API of the leads module. Adapters (Alex: WhatsApp, Meta, Google, website, CSV) call ingestLead only.
export { assertCan } from './access.ts';
export { saveFormMapping } from './forms.ts';
export { type IngestOutcome, ingestLead, ingestLeadTx } from './ingest.ts';
export { listLeads } from './list.ts';
export { applyMapping } from './mapping.ts';
export { normalisePhone } from './phone.ts';
export {
  clientLeadKeys,
  hideTestLeads,
  type LeadRow,
  type LeadView,
  leadViewFor,
  phoneDisplay,
  projectLead,
  projectLeadExport,
  projectLeadsPage,
  toClientLead,
  toStaffLead,
  visibleTo,
} from './projection.ts';
export { leadRoutes } from './routes.ts';
export { type By, changeStatus } from './status.ts';
