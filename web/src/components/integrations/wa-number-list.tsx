'use client';

import { useLocale, useTranslations } from 'next-intl';
import type { WaNumber } from '../../contracts/whatsapp.ts';
import { createFormat } from '../../lib/i18n/format.ts';
import type { Locale } from '../../lib/i18n/routing.ts';
import { Phone } from '../ui/bidi.tsx';
import { Card } from '../ui/card.tsx';
import { EmptyState } from '../ui/empty-state.tsx';
import { Table, Td, Th } from '../ui/table.tsx';

/** The project's WhatsApp numbers: number, label, history sync state and %, connected date (in the client's time zone). */
export function WaNumberList({ numbers, timeZone }: { numbers: WaNumber[]; timeZone: string }) {
  const t = useTranslations('integrations.whatsapp');
  const locale = useLocale() as Locale;
  const format = createFormat({ locale, timeZone });

  if (numbers.length === 0) {
    return (
      <Card>
        <EmptyState title={t('table.empty')} body={t('table.emptyBody')} />
      </Card>
    );
  }
  return (
    <Card flush>
      <Table aria-label={t('table.caption')}>
        <thead>
          <tr>
            <Th>{t('table.number')}</Th>
            <Th>{t('table.label')}</Th>
            <Th>{t('table.sync')}</Th>
            <Th>{t('table.connected')}</Th>
          </tr>
        </thead>
        <tbody>
          {numbers.map((n) => (
            <tr key={n.id}>
              <Td strong>
                <Phone>{n.phoneE164}</Phone>
              </Td>
              <Td>{n.label ?? format.date(null)}</Td>
              <Td>{t(`sync.${n.syncState}`, { pct: n.syncPct })}</Td>
              <Td>{format.date(n.onboardedAt)}</Td>
            </tr>
          ))}
        </tbody>
      </Table>
    </Card>
  );
}
