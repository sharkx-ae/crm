'use client';

import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import type { ContactProfile } from '../../contracts/contacts.ts';
import { cx } from '../../lib/cx.ts';
import { Link } from '../../lib/i18n/navigation.ts';
import { useProjectFormat } from '../../lib/i18n/use-project-format.ts';
import { StatusChip } from '../leads/leads-table.tsx';
import { useProject } from '../shell/project-context.tsx';
import { Phone, UserText } from '../ui/bidi.tsx';
import { Drawer } from '../ui/drawer.tsx';

function Section({
  title,
  first = false,
  children,
}: {
  title: string;
  first?: boolean;
  children: ReactNode;
}) {
  return (
    <section className={cx(!first && 'border-sx-border border-t pt-6')}>
      <h3 className="mb-2.5 font-label text-body">{title}</h3>
      {children}
    </section>
  );
}

function Kv({ children }: { children: ReactNode }) {
  return (
    <dl className="m-0 grid grid-cols-[100px_minmax(0,1fr)] gap-x-3 gap-y-2 rail:grid-cols-[120px_minmax(0,1fr)]">
      {children}
    </dl>
  );
}

const Row = ({ label, children }: { label: string; children: ReactNode }) => (
  <>
    <dt className="text-sx-muted">
      <UserText>{label}</UserText>
    </dt>
    <dd className="m-0 min-w-0 break-words">{children}</dd>
  </>
);

/**
 * The contact drawer (mockup `openContact`) on `?contact=<id>`. Each lead opens that lead's drawer. Notes are
 * read-only; writing them arrives with F3c.
 */
export function ContactDrawer({
  profile,
  projectId,
  onClose,
}: {
  profile: ContactProfile;
  projectId: string;
  onClose: () => void;
}) {
  const t = useTranslations('contacts');
  const tStatus = useTranslations('common.status');
  const tSource = useTranslations('common.source');
  const format = useProjectFormat();
  const project = useProject();
  const { contact } = profile;
  const name = contact.name ?? contact.phoneDisplay ?? t('unnamed');

  return (
    <Drawer
      open
      onOpenChange={(open) => !open && onClose()}
      title={name}
      subtitle={<p className="text-label text-sx-muted">{t('drawer.subtitle')}</p>}
    >
      <Section title={t('drawer.details')} first>
        <Kv>
          <Row label={t('drawer.phone')}>
            {contact.phoneDisplay ? <Phone>{contact.phoneDisplay}</Phone> : null}
          </Row>
          <Row label={t('drawer.email')}>
            {contact.email ? <UserText>{contact.email}</UserText> : null}
          </Row>
          <Row label={t('drawer.client')}>
            <UserText>{project.name}</UserText>
          </Row>
        </Kv>
      </Section>
      <Section title={t('drawer.leads', { n: profile.leads.length })}>
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {profile.leads.map((lead) => (
            <li key={lead.id}>
              <Link
                href={`/p/${projectId}/leads?lead=${lead.id}`}
                className="flex items-center justify-between gap-3 rounded-field border border-sx-line px-3 py-2 text-start no-underline hover:bg-sx-page"
              >
                <span className="min-w-0">
                  <span className="block font-heading text-sx-black">
                    <UserText>{lead.campaign ?? t('drawer.noCampaign')}</UserText>
                  </span>
                  <span className="text-label text-sx-muted">
                    {t('drawer.leadMeta', {
                      source: tSource(lead.source),
                      ago: format.ago(lead.createdAt),
                    })}
                  </span>
                </span>
                <StatusChip status={lead.status} />
              </Link>
            </li>
          ))}
        </ul>
      </Section>
      <Section title={t('drawer.chats')}>
        {profile.chats.length === 0 ? (
          <p className="text-sx-muted">{t('drawer.noChats')}</p>
        ) : (
          <p className="text-sx-muted">
            {profile.chats
              .map((chat) =>
                t('drawer.messages', {
                  n: chat.messages,
                  number: chat.numberLabel ?? chat.phoneDisplay ?? t('drawer.unknownNumber'),
                }),
              )
              .join(', ')}
          </p>
        )}
      </Section>
      <Section title={t('drawer.notes')}>
        {profile.notes.length === 0 ? (
          <p className="text-sx-muted">{t('drawer.noNotes')}</p>
        ) : (
          <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
            {profile.notes.map((note) => (
              <li key={note.id} className="text-sx-muted">
                <span className="font-heading text-sx-black">
                  <UserText>{note.authorName ?? t('drawer.someone')}</UserText>:
                </span>{' '}
                <UserText>{note.text}</UserText>
              </li>
            ))}
          </ul>
        )}
      </Section>
      <Section title={t('drawer.statusChanges')}>
        {profile.statusChanges.length === 0 ? (
          <p className="text-sx-muted">{t('drawer.noMarks')}</p>
        ) : (
          <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
            {profile.statusChanges.map((mark) => (
              <li key={`${mark.leadId}-${mark.at}`} className="text-sx-muted">
                {mark.reason
                  ? t('drawer.markReason', {
                      to: tStatus(mark.to),
                      reason: mark.reason,
                      name: mark.byName ?? t('drawer.someone'),
                    })
                  : t('drawer.mark', {
                      to: tStatus(mark.to),
                      name: mark.byName ?? t('drawer.someone'),
                    })}
                {' · '}
                {format.ago(mark.at)}
              </li>
            ))}
          </ul>
        )}
      </Section>
    </Drawer>
  );
}
