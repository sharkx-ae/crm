// Public API of the audit module. Other modules write audit rows only through here.
export { type Actor, type AuditEntryInput, audit } from './service.ts';
