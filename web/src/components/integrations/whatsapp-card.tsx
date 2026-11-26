'use client';

import { useTranslations } from 'next-intl';
import type { WaNumbersResponse } from '../../contracts/whatsapp.ts';
import { Button } from '../ui/button.tsx';
import { Card } from '../ui/card.tsx';
import { Icon } from '../ui/icons.tsx';
import { WaNumberList } from './wa-number-list.tsx';
import { WhatsAppConnect } from './whatsapp-connect.tsx';

/**
 * Temporary integrations page body (F3a plan §6.3), replaced by the hub card and generic wizard in F14b, where
 * `WhatsAppConnect` becomes the `qr` step. One card: what this is, the one primary button, a notice when Meta limits new
 * connections, and below it the connected numbers.
 */
export function WhatsAppCard({
  projectId,
  numbers,
  connect,
  meta,
  nonce,
  timeZone,
}: {
  projectId: string;
  numbers: WaNumbersResponse['numbers'];
  connect: WaNumbersResponse['connect'];
  /** Null when this environment has no Meta app configured for the web. */
  meta: { appId: string; configId: string; graphVersion: string } | null;
  nonce?: string;
  timeZone: string;
}) {
  const t = useTranslations('integrations.whatsapp');
  const ready = connect.ready && meta !== null;

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <div className="flex flex-col gap-3">
          <div>
            <h2 className="font-heading text-section text-sx-black">{t('title')}</h2>
            <p className="max-w-prose text-label text-sx-muted">{t('intro')}</p>
          </div>
          {connect.limited ? <Notice>{t('limitNotice')}</Notice> : null}
          {ready && meta ? (
            <WhatsAppConnect
              projectId={projectId}
              appId={meta.appId}
              configId={meta.configId}
              graphVersion={meta.graphVersion}
              nonce={nonce}
            />
          ) : (
            <div className="flex flex-col gap-3">
              <div>
                <Button variant="primary" icon="qr" disabled>
                  {t('connect')}
                </Button>
              </div>
              <Notice>{t('awaiting')}</Notice>
            </div>
          )}
        </div>
      </Card>
      <WaNumberList numbers={numbers} timeZone={timeZone} />
    </div>
  );
}

/** A neutral info box: shell grey, an icon and one sentence. Not an alert, nothing is wrong. */
function Notice({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex max-w-prose items-start gap-2 rounded-field border border-sx-border bg-sx-shell px-3 py-2 text-label text-sx-black">
      <Icon name="info" size="sm" className="mt-0.5 flex-none" />
      <p>{children}</p>
    </div>
  );
}
