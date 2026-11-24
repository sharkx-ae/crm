// Public API of the leads module. Adapters (Alex: WhatsApp, Meta, Google, website, CSV) call ingestLead only.
export { saveFormMapping } from './forms.ts';
export { type IngestOutcome, ingestLead, ingestLeadTx } from './ingest.ts';
export { applyMapping } from './mapping.ts';
export { normalisePhone } from './phone.ts';
export { leadRoutes } from './routes.ts';
