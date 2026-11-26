'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { Button } from '../ui/button.tsx';
import { Field } from '../ui/field.tsx';
import { Modal } from '../ui/modal.tsx';
import { Select } from '../ui/select.tsx';
import { usePauseRefresh } from './refresh-pause.tsx';

/**
 * "Why is this lead not qualified?" (mockup `askReason`): a choice from the client's own list. Its confirm button is
 * this view's single primary. While it is open the 5 s refresh waits.
 */
export function ReasonModal({
  open,
  onOpenChange,
  leadLabel,
  reasons,
  pending,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  leadLabel: string;
  reasons: readonly string[];
  pending: boolean;
  onConfirm: (reason: string) => void;
}) {
  const t = useTranslations('leads.reason');
  const tUi = useTranslations('ui');
  const [reason, setReason] = useState(reasons[0] ?? '');
  usePauseRefresh(open);

  // A fresh list (or a reopened dialog) starts on its first reason.
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset when the dialog opens or the list changes
  useEffect(() => setReason(reasons[0] ?? ''), [open, reasons]);

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={t('title')}
      description={leadLabel}
      footer={
        <>
          <Button onClick={() => onOpenChange(false)}>{tUi('cancel')}</Button>
          <Button
            variant="primary"
            loading={pending}
            disabled={!reason}
            onClick={() => onConfirm(reason)}
          >
            {t('confirm')}
          </Button>
        </>
      }
    >
      <Field label={t('label')}>
        <Select
          value={reason}
          onValueChange={setReason}
          options={reasons.map((r) => ({ value: r, label: r }))}
        />
      </Field>
    </Modal>
  );
}
