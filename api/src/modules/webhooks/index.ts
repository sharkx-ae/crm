// Public API of the webhooks module (F3a). Routes in src/routes/webhooks call these; F3b's `webhook.process` reads
// the stored rows. Nothing else reaches into signature.ts or service.ts.

export { externalIdOf, type StoredWebhook, storeWebhook } from './service.ts';
export { verifyMetaSignature } from './signature.ts';
