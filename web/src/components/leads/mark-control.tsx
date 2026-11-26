'use client';

import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import type { LeadStatus } from '../../contracts/common.ts';
import type { ActionError } from '../../lib/action.ts';
import { leadReasons, markLead } from '../../lib/actions/leads.ts';
import { cx } from '../../lib/cx.ts';
import { useRouter } from '../../lib/i18n/navigation.ts';
import { useToast } from '../ui/toast.tsx';
import { ReasonModal } from './reason-modal.tsx';
import { usePauseRefresh } from './refresh-pause.tsx';

export type MarkTarget = { id: string; label: string; status: LeadStatus };
type Mark = Exclude<LeadStatus, 'new'>;

const RING = 'focus-visible:outline-3 focus-visible:-outline-offset-3 focus-visible:outline-sx-red';
const ON: Record<LeadStatus, string> = {
  new: 'bg-sx-border font-heading',
  mql: 'bg-sx-red-soft font-heading',
  sql: 'bg-sx-red font-heading text-white',
  not_qualified: 'bg-sx-black font-heading text-white',
};

/**
 * The qualification buttons (mockup `segmark`): New (never a target), MQL, SQL, Not qualified. `inline` is the
 * table's short form without New. Not qualified asks for a reason from the client's list first. Reused by the
 * client overview (F13a). `reasons` is known inside the drawer; a table row loads them when asked.
 */
export function MarkControl({
  lead,
  projectId,
  reasons,
  size = 'md',
  inline = false,
}: {
  lead: MarkTarget;
  projectId: string;
  reasons?: readonly string[];
  size?: 'md' | 'lg';
  inline?: boolean;
}) {
  const t = useTranslations('leads');
  const tStatus = useTranslations('common.status');
  const tErr = useTranslations('errors');
  const router = useRouter();
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState<readonly string[] | null>(null);
  usePauseRefresh(pending);

  const fail = (error: ActionError) =>
    toast(tErr(error.code, { minutes: Math.max(1, Math.ceil((error.retryAfterSec ?? 60) / 60)) }), {
      tone: 'error',
    });

  const submit = (to: Mark, reason?: string) =>
    start(async () => {
      const res = await markLead({ projectId, leadId: lead.id, to, reason });
      if (!res.ok) return fail(res.error);
      setOpen(false);
      const marked = t('toast.marked', { name: lead.label, status: tStatus(to) });
      // Only staff see the outbox: it is the agency's feed to the ad platforms.
      toast(
        res.data.view === 'staff' && res.data.outboxQueued > 0
          ? `${marked} ${t('toast.sent')}`
          : marked,
      );
      router.refresh();
    });

  const askReason = () => {
    const known = reasons ?? loaded;
    if (known) return setOpen(true);
    start(async () => {
      const res = await leadReasons({ projectId, leadId: lead.id });
      if (!res.ok) return fail(res.error);
      setLoaded(res.data);
      setOpen(true);
    });
  };

  const choose = (to: Mark) => {
    if (to === 'not_qualified') return askReason();
    if (to !== lead.status) submit(to);
  };

  const buttons: LeadStatus[] = inline
    ? ['mql', 'sql', 'not_qualified']
    : ['new', 'mql', 'sql', 'not_qualified'];

  return (
    <>
      <fieldset className="m-0 inline-flex min-w-0 max-w-full overflow-hidden rounded-field border border-sx-line bg-sx-paper p-0">
        <legend className="sr-only">{t('mark.group')}</legend>
        {buttons.map((s) => {
          const on = !inline && lead.status === s;
          return (
            <button
              key={s}
              type="button"
              disabled={s === 'new' || pending}
              aria-pressed={inline ? undefined : on}
              aria-label={
                s === 'new' ? undefined : t('mark.markAs', { name: lead.label, status: tStatus(s) })
              }
              onClick={() => s !== 'new' && choose(s)}
              className={cx(
                'cursor-pointer whitespace-nowrap px-3 font-label text-label not-first:border-s not-first:border-sx-line hover:bg-sx-shell disabled:cursor-default disabled:opacity-100',
                size === 'lg' ? 'h-[38px] px-4 text-body' : 'h-[30px]',
                RING,
                on ? ON[s] : s === 'new' ? 'text-sx-muted' : 'text-sx-black',
                pending && 'opacity-60',
              )}
            >
              {tStatus(s)}
            </button>
          );
        })}
      </fieldset>
      <ReasonModal
        open={open}
        onOpenChange={setOpen}
        leadLabel={lead.label}
        reasons={reasons ?? loaded ?? []}
        pending={pending}
        onConfirm={(reason) => submit('not_qualified', reason)}
      />
    </>
  );
}
