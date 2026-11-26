'use client';

import { useTranslations } from 'next-intl';
import type { LeadDetail } from '../../contracts/leads.ts';
import { useProjectFormat } from '../../lib/i18n/use-project-format.ts';
import { UserText } from '../ui/bidi.tsx';

type Event = Extract<LeadDetail, { view: 'staff' }>['timeline'][number];

const str = (v: unknown): string | undefined => (typeof v === 'string' && v ? v : undefined);

/**
 * The lead's history, newest first (the api orders it). Each kind has its own sentence (D6); a kind this screen does
 * not know yet reads "Updated", so a new event from a later spec never breaks the drawer.
 */
export function Timeline({ events }: { events: readonly Event[] }) {
  const t = useTranslations('leads.timeline');
  const tSource = useTranslations('common.source');
  const tStatus = useTranslations('common.status');
  const format = useProjectFormat();

  const source = (e: Event) => {
    const s = str(e.data.source);
    return s && s in SOURCES ? tSource(s as keyof typeof SOURCES) : null;
  };
  const actor = (e: Event) =>
    e.actorKind === 'client' && e.actorName
      ? t('byClient', { name: e.actorName })
      : (e.actorName ?? t('bySystem'));

  const line = (e: Event): string => {
    switch (e.kind) {
      case 'created': {
        const s = source(e);
        return s ? t('created', { source: s }) : t('other');
      }
      case 'merged': {
        const s = source(e);
        return s ? t('merged', { source: s }) : t('other');
      }
      case 'assigned': {
        const name = str(e.data.ownerName);
        return name ? t('assigned', { name }) : t('unassigned');
      }
      case 'status_changed': {
        const to = str(e.data.to);
        if (!to || !(to in STATUSES)) return t('other');
        const reason = str(e.data.reason);
        const values = { to: tStatus(to as keyof typeof STATUSES), actor: actor(e) };
        return reason
          ? t('status_changedReason', { ...values, reason })
          : t('status_changed', values);
      }
      default:
        return t('other');
    }
  };

  return (
    <ol className="m-0 flex list-none flex-col p-0">
      {events.map((e) => (
        <li key={e.id} className="border-sx-border border-b py-2.5 last:border-b-0">
          <p className="font-label">
            <UserText>{line(e)}</UserText>
          </p>
          <p className="text-label text-sx-muted">{format.ago(e.at)}</p>
        </li>
      ))}
    </ol>
  );
}

const SOURCES = {
  meta: 1,
  google: 1,
  youtube: 1,
  tiktok: 1,
  linkedin: 1,
  snapchat: 1,
  website: 1,
  whatsapp: 1,
  csv: 1,
} as const;
const STATUSES = { new: 1, mql: 1, sql: 1, not_qualified: 1 } as const;
