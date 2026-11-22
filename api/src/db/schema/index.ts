// Schema barrel (append-only, shared by Alex and John). Each module keeps its tables in
// src/modules/<module>/schema.ts and is re-exported here.
//
// RLS is NOT declared here: roles, grants, helper functions and policies are hand-written SQL in
// src/db/migrations/0002_roles_rls.sql (ARCHITECTURE §4). A new tenant table (one with project_id)
// must call app_secure_tenant_table('<table>', '<client_access>') in its migration; tests/rls/structure.test.ts fails otherwise.

export * from '../../lib/errors/schema.ts';
export * from '../../lib/rate-limit/schema.ts';
export * from '../../lib/tenant/schema.ts';
export * from '../../modules/audit/schema.ts';
export * from '../../modules/auth/schema.ts';
export * from '../../modules/automation/schema.ts';
export * from '../../modules/contacts/schema.ts';
export * from '../../modules/conversion/schema.ts';
export * from '../../modules/integrations/hub/schema.ts';
export * from '../../modules/leads/schema.ts';
export * from '../../modules/notifications/schema.ts';
export * from '../../modules/pipeline/schema.ts';
export * from '../../modules/projects/schema.ts';
export * from '../../modules/tasks/schema.ts';
export * from '../../modules/webhooks/schema.ts';
export * from '../../modules/whatsapp/schema.ts';
export * from './enums.ts';
