'use client';

import Script from 'next/script';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { WaNumber } from '../../contracts/whatsapp.ts';
import { connectWhatsApp } from '../../lib/actions/whatsapp.ts';
import { useRouter } from '../../lib/i18n/navigation.ts';
import {
  ES_EXTRAS,
  isQrPath,
  PAIRING_TIMEOUT_MS,
  type Pairing,
  pairingReady,
  parseSignupMessage,
  type SignupMessage,
  signupErrorKey,
} from '../../lib/whatsapp/signup.ts';
import { Button } from '../ui/button.tsx';
import { useToast } from '../ui/toast.tsx';
import { useErrorToast } from '../ui/use-error-toast.ts';

// The Facebook JS SDK, as much of it as we call.
type FbLoginResponse = { authResponse?: { code?: string } | null };
type FbSdk = {
  init(options: {
    appId: string;
    autoLogAppEvents: boolean;
    xfbml: boolean;
    version: string;
  }): void;
  login(callback: (response: FbLoginResponse) => void, options: Record<string, unknown>): void;
};
declare global {
  interface Window {
    FB?: FbSdk;
  }
}

const SDK_URL = 'https://connect.facebook.net/en_US/sdk.js';
const REASONS = [
  'not_configured',
  'qr_only',
  'code_expired',
  'waba_mismatch',
  'no_number',
  'subscribe_failed',
  'graph_unavailable',
  'number_taken',
] as const;
type Reason = (typeof REASONS)[number];
const isReason = (v: unknown): v is Reason => (REASONS as readonly unknown[]).includes(v);

type Phase = 'idle' | 'popup' | 'connecting';

/**
 * The "Connect a WhatsApp number" button: Embedded Signup v5, QR path (F3a plan §6.1). It loads the Facebook SDK with the
 * page's CSP nonce, opens the popup, waits for BOTH halves of the answer (the code from FB.login and the session info
 * from the popup's message event, at most a minute apart), then hands them to the Server Action. The browser's ids are
 * only hints; the api checks them against the token. Written so the F14b wizard can mount it unchanged as the `qr` step.
 */
export function WhatsAppConnect({
  projectId,
  appId,
  configId,
  graphVersion,
  nonce,
  onConnected,
}: {
  projectId: string;
  appId: string;
  configId: string;
  graphVersion: string;
  /** The page's CSP nonce: with 'strict-dynamic' only a nonce-carrying script may load the SDK. */
  nonce?: string;
  onConnected?: (numbers: WaNumber[]) => void;
}) {
  const t = useTranslations('integrations.whatsapp');
  const router = useRouter();
  const { toast } = useToast();
  const showError = useErrorToast();
  const [sdk, setSdk] = useState<'loading' | 'ready' | 'failed'>('loading');
  const [phase, setPhase] = useState<Phase>('idle');
  const [message, setMessage] = useState<string | null>(null);
  const pairing = useRef<Pairing>({});
  const phaseRef = useRef<Phase>('idle');
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const move = useCallback((next: Phase) => {
    phaseRef.current = next;
    setPhase(next);
  }, []);
  const disarm = useCallback(() => {
    clearTimeout(timer.current);
    timer.current = undefined;
  }, []);
  /** Back to the start, with a message (or none). The next click is a fresh flow. */
  const stop = useCallback(
    (text: string | null) => {
      disarm();
      pairing.current = {};
      setMessage(text);
      move('idle');
    },
    [disarm, move],
  );

  const submit = useCallback(async () => {
    const p = pairing.current;
    if (!pairingReady(p) || phaseRef.current !== 'popup') return;
    disarm();
    pairing.current = {};
    move('connecting');
    const res = await connectWhatsApp({
      projectId,
      code: p.code,
      event: p.session.event,
      messagingAccountIds: p.session.messagingAccountIds,
      phoneNumberId: p.session.phoneNumberId,
      isOnBizApp: p.session.isOnBizApp,
    });
    if (res.ok) {
      const number = res.data.numbers[0];
      setMessage(null);
      toast(t('connected', { number: number?.phoneE164 ?? '' }));
      router.refresh();
      onConnected?.(res.data.numbers);
    } else {
      const reason = res.error.details?.reason;
      if (isReason(reason)) setMessage(t(`reasons.${reason}`));
      else showError(res.error);
    }
    move('idle');
  }, [projectId, disarm, move, toast, t, router, onConnected, showError]);

  /** The first half arrived: the second must follow within a minute. */
  const armTimeout = useCallback(() => {
    if (timer.current) return;
    timer.current = setTimeout(() => {
      if (phaseRef.current === 'popup') stop(t('timeout'));
    }, PAIRING_TIMEOUT_MS);
  }, [stop, t]);

  const explain = useCallback(
    (m: Extract<SignupMessage, { kind: 'error' | 'unexpected' }>): string => {
      const code = m.kind === 'error' ? m.code : null;
      const key = signupErrorKey(code);
      if (key) return t(`signupErrors.${key}`);
      if (m.kind === 'error' && m.message && code) {
        return t('signupErrors.unknown', { message: m.message, code });
      }
      return t('signupErrors.unknownNoMessage', { code: code ?? '?' });
    },
    [t],
  );

  // The popup's answer. Only Meta's two origins are read; anything else is ignored.
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      const m = parseSignupMessage(e.origin, e.data);
      if (!m || phaseRef.current !== 'popup') return;
      if (m.kind === 'cancel') return stop(t('cancelled'));
      if (m.kind === 'error' || m.kind === 'unexpected') return stop(explain(m));
      // A new Cloud API number is not the QR path: refused here and again by the api.
      if (!isQrPath(m.session)) return stop(t('reasons.qr_only'));
      pairing.current = { ...pairing.current, session: m.session };
      armTimeout();
      void submit();
    };
    window.addEventListener('message', onMessage);
    return () => {
      window.removeEventListener('message', onMessage);
      disarm();
    };
  }, [stop, t, explain, armTimeout, submit, disarm]);

  const start = () => {
    const fb = window.FB;
    if (!fb || phaseRef.current !== 'idle') return;
    setMessage(null);
    pairing.current = {};
    move('popup');
    fb.login(
      (response) => {
        const code = response.authResponse?.code;
        if (!code) return stop(t('cancelled')); // the person closed the popup
        pairing.current = { ...pairing.current, code };
        armTimeout();
        void submit();
      },
      {
        config_id: configId,
        response_type: 'code',
        override_default_response_type: true,
        extras: ES_EXTRAS,
      },
    );
  };

  return (
    <div className="flex flex-col gap-3">
      <Script
        src={SDK_URL}
        nonce={nonce}
        strategy="afterInteractive"
        onReady={() => {
          if (!window.FB) return setSdk('failed');
          window.FB.init({ appId, autoLogAppEvents: true, xfbml: false, version: graphVersion });
          setSdk('ready');
        }}
        onError={() => setSdk('failed')}
      />
      <div>
        <Button
          variant="primary"
          icon="qr"
          onClick={start}
          loading={phase === 'connecting'}
          disabled={sdk !== 'ready' || phase !== 'idle'}
        >
          {phase === 'connecting' ? t('connecting') : t('connect')}
        </Button>
      </div>
      {sdk === 'failed' ? (
        <p role="alert" className="text-label text-sx-black">
          {t('loadError')}
        </p>
      ) : null}
      {message ? (
        <p role="alert" className="max-w-prose text-body text-sx-black">
          {message}
        </p>
      ) : null}
    </div>
  );
}
