'use client';

import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { inviteUser } from '../../lib/actions/users.ts';
import { useRouter } from '../../lib/i18n/navigation.ts';
import { Button } from '../ui/button.tsx';
import { Field } from '../ui/field.tsx';
import { Input } from '../ui/input.tsx';
import { Modal } from '../ui/modal.tsx';
import { useToast } from '../ui/toast.tsx';
import { useErrorToast } from '../ui/use-error-toast.ts';

// "Invite manager" (Team) or "Invite client user" (a client's settings, F10a): full name and email. The invited
// person gets a single-use link by email; the list refreshes and shows them as Invited.
export function InviteUser(
  props: { label: string; title: string; description: string } & (
    | { kind: 'manager' }
    | { kind: 'client'; projectId: string }
  ),
) {
  const t = useTranslations('team.inviteForm');
  const tUi = useTranslations('ui');
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const showError = useErrorToast();
  const [pending, start] = useTransition();
  const formId = `invite-${props.kind}`;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    start(async () => {
      const res = await inviteUser(
        props.kind === 'manager'
          ? { kind: 'manager', name, email }
          : { kind: 'client', name, email, projectId: props.projectId },
      );
      if (!res.ok) {
        showError(res.error);
        return;
      }
      setOpen(false);
      setName('');
      setEmail('');
      toast(t('sent', { email: email.trim() }));
      router.refresh();
    });
  };

  return (
    <>
      <Button variant="primary" icon="plus" onClick={() => setOpen(true)}>
        {props.label}
      </Button>
      <Modal
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
        }}
        title={props.title}
        description={props.description}
        footer={
          <>
            <Button onClick={() => setOpen(false)}>{tUi('cancel')}</Button>
            <Button
              variant="primary"
              type="submit"
              form={formId}
              loading={pending}
              disabled={!name.trim() || !email.includes('@')}
            >
              {pending ? t('submitting') : t('submit')}
            </Button>
          </>
        }
      >
        <form id={formId} onSubmit={submit} className="flex flex-col gap-4" noValidate>
          <Field label={t('name')}>
            <Input value={name} onChange={(e) => setName(e.target.value)} required />
          </Field>
          <Field label={t('email')} hint={t('help')}>
            <Input
              type="email"
              inputMode="email"
              autoComplete="off"
              dir="ltr"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </Field>
        </form>
      </Modal>
    </>
  );
}
