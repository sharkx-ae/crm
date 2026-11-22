import { z } from 'zod';
import { locale } from './common.ts';

// Later templates (task_due, connection_issue…) are added by their owners as new enum values.
export const emailTemplate = z.enum(['invite', 'code', 'reset', 'alert']);

// CONTRACTS §5: pg-boss job name → payload.
export const jobs = {
  'webhook.process': z.object({ webhookEventId: z.uuid() }),
  'wa.history.sync': z.object({ numberId: z.uuid(), cursor: z.string().optional() }),
  'conversion.send': z.object({ conversionEventId: z.uuid() }),
  'integration.health': z.object({}),
  'automation.timer': z.object({
    ruleId: z.uuid(),
    leadId: z.uuid(),
    kind: z.enum(['no_reply', 'unreviewed']),
  }),
  'task.reminder': z.object({ taskId: z.uuid() }),
  'email.send': z.object({
    to: z.email(),
    template: emailTemplate,
    locale,
    data: z.record(z.string(), z.unknown()),
  }),
  'csv.import': z.object({
    projectId: z.uuid(),
    uploadId: z.uuid(),
    mapping: z.record(z.string(), z.string()),
  }),
  maintenance: z.object({}),
};

export type EmailTemplate = z.infer<typeof emailTemplate>;
export type JobName = keyof typeof jobs;
export type JobPayload<N extends JobName> = z.infer<(typeof jobs)[N]>;
