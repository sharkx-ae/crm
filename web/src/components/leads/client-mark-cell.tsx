'use client';

import { useTranslations } from 'next-intl';
import type { ClientLeadRow } from '../../contracts/leads.ts';
import { MarkControl } from './mark-control.tsx';

/**
 * The client table's "Mark as" cell (mockup `markInline`): the buttons while a lead still waits for review, and a
 * hint once it is marked (open it to change the mark).
 */
export function ClientMarkCell({ row, projectId }: { row: ClientLeadRow; projectId: string }) {
  const t = useTranslations('leads');
  if (row.status !== 'new') return <span className="text-sx-muted">{t('mark.openToChange')}</span>;
  return (
    <MarkControl
      inline
      projectId={projectId}
      lead={{ id: row.id, label: row.name ?? row.phoneDisplay ?? t('unnamed'), status: row.status }}
    />
  );
}
