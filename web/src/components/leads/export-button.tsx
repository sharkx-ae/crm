'use client';

import { useTranslations } from 'next-intl';
import type { MouseEvent } from 'react';
import type { Me } from '../../contracts/auth.ts';
import { can } from '../../contracts/session.ts';
import { type LeadFilters, leadsApiParams } from '../../lib/leads-url.ts';
import { Button } from '../ui/button.tsx';
import { useToast } from '../ui/toast.tsx';

/**
 * The Leads page's one action (mockup secondary Export). The address carries the current filter and no limit, so
 * the file is the same set the table is showing. A failed download stays on the page and says why.
 */
export function ExportButton({
  me,
  projectId,
  filters,
}: {
  me: Me;
  projectId: string;
  filters: LeadFilters;
}) {
  const t = useTranslations('leads');
  const { toast } = useToast();
  if (!can(me, 'lead.export', projectId)) return null;

  const href = `/api/export/leads?${leadsApiParams(projectId, filters, { withPaging: false })}`;

  const download = async (event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    let res: Response;
    try {
      res = await fetch(href);
    } catch {
      toast(t('export.failed'), { tone: 'error' });
      return;
    }
    if (!res.ok) {
      const message = (await res.text()).trim();
      toast(message || t('export.failed'), { tone: 'error' });
      return;
    }
    const blob = await res.blob();
    const named = /filename="([^"]+)"/.exec(res.headers.get('content-disposition') ?? '');
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = named?.[1] ?? 'leads.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Button asChild variant="secondary" icon="download">
      <a href={href} onClick={download}>
        {t('export.button')}
      </a>
    </Button>
  );
}
