'use client';

import { useTranslations } from 'next-intl';
import { useTransition } from 'react';
import { assignLead } from '../../lib/actions/leads.ts';
import { useRouter } from '../../lib/i18n/navigation.ts';
import { Field } from '../ui/field.tsx';
import { Select } from '../ui/select.tsx';
import { useToast } from '../ui/toast.tsx';
import { usePauseRefresh } from './refresh-pause.tsx';

/**
 * The owner of a lead (staff, mockup "Owner and stage"): Unassigned and the active managers. Assigning is one call
 * and one audit row; a manager who has since been disabled still shows as the current owner until it is changed.
 */
export function OwnerSelect({
  leadId,
  projectId,
  ownerId,
  ownerName,
  owners,
}: {
  leadId: string;
  projectId: string;
  ownerId: string | null;
  ownerName: string | null;
  owners: readonly { id: string; name: string }[];
}) {
  const t = useTranslations('leads');
  const tErr = useTranslations('errors');
  const router = useRouter();
  const { toast } = useToast();
  const [pending, start] = useTransition();
  usePauseRefresh(pending);

  const current =
    ownerId && !owners.some((o) => o.id === ownerId)
      ? { id: ownerId, name: ownerName ?? '' }
      : null;
  const options = [
    { value: '', label: t('owner.unassigned') },
    ...(current ? [{ value: current.id, label: current.name }] : []),
    ...owners.map((o) => ({ value: o.id, label: o.name })),
  ];

  const change = (value: string) =>
    start(async () => {
      const res = await assignLead({ projectId, leadId, ownerId: value || null });
      if (!res.ok) {
        toast(
          tErr(res.error.code, {
            minutes: Math.max(1, Math.ceil((res.error.retryAfterSec ?? 60) / 60)),
          }),
        );
        return;
      }
      const name = res.data.lead.ownerName;
      toast(name ? t('toast.assigned', { name }) : t('toast.unassigned'));
      router.refresh();
    });

  return (
    <Field label={t('owner.label')}>
      <Select value={ownerId ?? ''} onValueChange={change} disabled={pending} options={options} />
    </Field>
  );
}
