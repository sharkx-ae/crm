'use client';

import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import type { LeadDetail } from '../../contracts/leads.ts';
import { cx } from '../../lib/cx.ts';
import { useProjectFormat } from '../../lib/i18n/use-project-format.ts';
import { useProject } from '../shell/project-context.tsx';
import { Phone, UserText } from '../ui/bidi.tsx';
import { Chip } from '../ui/chip.tsx';
import { Drawer } from '../ui/drawer.tsx';
import { StatusChip } from './leads-table.tsx';
import { MarkControl } from './mark-control.tsx';
import { OwnerSelect } from './owner-select.tsx';
import { SourceBadge } from './source-badge.tsx';
import { Timeline } from './timeline.tsx';

const WHATSAPP_TONE = { none: 'off', replied: 'ok', unreplied: 'warn' } as const;

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

/** Label and value rows (mockup `kv`): 100px labels under 900px, 120px above. */
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
 * The lead drawer (mockup `openLead`), open while the address names a lead. Staff: qualification, contact, answers,
 * owner, timeline. A client: qualification, contact (with the campaign, without WhatsApp) and answers only: its
 * response has nothing else to show (F4b §4.5).
 */
export function LeadDrawer({
  detail,
  projectId,
  onClose,
}: {
  detail: LeadDetail;
  projectId: string;
  onClose: () => void;
}) {
  const t = useTranslations('leads');
  const tSource = useTranslations('common.source');
  const format = useProjectFormat();
  const project = useProject();
  const { lead, qualification } = detail;
  const label = lead.name ?? lead.phoneDisplay ?? t('unnamed');
  const answers = Object.entries(lead.answers);

  return (
    <Drawer
      open
      onOpenChange={(open) => !open && onClose()}
      title={label}
      subtitle={
        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          <StatusChip status={lead.status} />
          <span className="text-label text-sx-muted">
            <UserText>
              {t('drawer.received', { client: project.name, ago: format.ago(lead.createdAt) })}
            </UserText>
          </span>
        </div>
      }
    >
      <Section title={t('drawer.qualification')} first>
        <MarkControl
          size="lg"
          projectId={projectId}
          reasons={qualification.reasons}
          lead={{ id: lead.id, label, status: lead.status }}
        />
        {lead.status === 'not_qualified' && lead.reason ? (
          <p className="mt-2.5 text-label text-sx-muted">
            <UserText>{t('drawer.reason', { reason: lead.reason })}</UserText>
          </p>
        ) : null}
        <div className="mt-3.5 rounded-btn bg-sx-shell px-4 py-3">
          <Kv>
            <Row label={t('drawer.mqlMeans')}>
              {qualification.mqlDefinition || (
                <span className="text-sx-muted">{t('drawer.noDefinition')}</span>
              )}
            </Row>
            <Row label={t('drawer.sqlMeans')}>
              {qualification.sqlDefinition || (
                <span className="text-sx-muted">{t('drawer.noDefinition')}</span>
              )}
            </Row>
          </Kv>
        </div>
      </Section>

      <Section title={t('drawer.contact')}>
        <Kv>
          <Row label={t('drawer.field.phone')}>
            {lead.phoneDisplay ? <Phone>{lead.phoneDisplay}</Phone> : '—'}
          </Row>
          <Row label={t('drawer.field.email')}>
            {lead.email ? <bdi dir="ltr">{lead.email}</bdi> : '—'}
          </Row>
          <Row label={t('drawer.field.source')}>
            <SourceBadge source={lead.source} label={tSource(lead.source)} />
          </Row>
          <Row label={t('drawer.field.campaign')}>
            {lead.campaign ? <UserText>{lead.campaign}</UserText> : '—'}
          </Row>
          {detail.view === 'staff' ? (
            <Row label={t('drawer.field.whatsapp')}>
              <Chip tone={WHATSAPP_TONE[detail.whatsappState]}>
                {t(`drawer.whatsapp.${detail.whatsappState}`)}
              </Chip>
            </Row>
          ) : null}
        </Kv>
      </Section>

      <Section title={t('drawer.answers')}>
        {answers.length ? (
          <Kv>
            {answers.map(([question, answer]) => (
              <Row key={question} label={question}>
                <UserText>{answer}</UserText>
              </Row>
            ))}
          </Kv>
        ) : (
          <p className="text-label text-sx-muted">{t('drawer.noAnswers')}</p>
        )}
      </Section>

      {detail.view === 'staff' ? (
        <>
          <Section title={t('drawer.owner')}>
            <OwnerSelect
              leadId={lead.id}
              projectId={projectId}
              ownerId={detail.lead.ownerId}
              ownerName={detail.lead.ownerName}
              owners={detail.owners}
            />
          </Section>
          <Section title={t('drawer.timeline')}>
            <Timeline events={detail.timeline} />
          </Section>
        </>
      ) : null}
    </Drawer>
  );
}
