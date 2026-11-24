'use client';

import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { type CreateProjectRequest, projectCity } from '../../contracts/projects.ts';
import type { ActionError } from '../../lib/action.ts';
import { createProject } from '../../lib/actions/projects.ts';
import { useRouter } from '../../lib/i18n/navigation.ts';
import { FormError } from '../auth/form-error.tsx';
import { Button } from '../ui/button.tsx';
import { Field } from '../ui/field.tsx';
import { Input } from '../ui/input.tsx';
import { Modal } from '../ui/modal.tsx';
import { Select } from '../ui/select.tsx';
import { useToast } from '../ui/toast.tsx';

const FORM_ID = 'add-client-form';

// "Add client" (super admin, F2b S2): the mockup's four fields. The first client user's invite name is derived from
// the email by the api (decision D3). On success the new client opens on its Overview.
export function AddClient({ defaultOpen = false }: { defaultOpen?: boolean }) {
  const t = useTranslations('projects.create');
  const tCity = useTranslations('projects.city');
  const tUi = useTranslations('ui');
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = useState(defaultOpen);
  const [pending, start] = useTransition();
  const [error, setError] = useState<ActionError | null>(null);
  const [form, setForm] = useState<{
    name: string;
    city: CreateProjectRequest['city'];
    industry: string;
    email: string;
  }>({ name: '', city: 'Dubai', industry: '', email: '' });
  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    start(async () => {
      const res = await createProject({
        name: form.name,
        city: form.city,
        industry: form.industry,
        firstUser: { email: form.email },
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setOpen(false);
      toast(t('created', { name: form.name.trim(), email: form.email.trim() }));
      router.push(`/p/${res.data.projectId}/overview`);
    });
  };

  const ready = form.name.trim() && form.industry.trim() && form.email.includes('@');

  return (
    <>
      <Button variant="primary" icon="plus" onClick={() => setOpen(true)}>
        {t('button')}
      </Button>
      <Modal
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) setError(null);
        }}
        title={t('title')}
        description={t('description')}
        footer={
          <>
            <Button onClick={() => setOpen(false)}>{tUi('cancel')}</Button>
            <Button
              variant="primary"
              type="submit"
              form={FORM_ID}
              loading={pending}
              disabled={!ready}
            >
              {pending ? t('submitting') : t('submit')}
            </Button>
          </>
        }
      >
        <form id={FORM_ID} onSubmit={submit} className="flex flex-col gap-4" noValidate>
          <Field label={t('name')}>
            <Input
              value={form.name}
              onChange={(e) => set('name')(e.target.value)}
              placeholder={t('namePlaceholder')}
              required
            />
          </Field>
          <div className="grid gap-4 rail:grid-cols-2">
            <Field label={t('city')}>
              <Select
                value={form.city}
                onValueChange={set('city')}
                options={projectCity.options.map((c) => ({ value: c, label: tCity(c) }))}
              />
            </Field>
            <Field label={t('industry')}>
              <Input
                value={form.industry}
                onChange={(e) => set('industry')(e.target.value)}
                placeholder={t('industryPlaceholder')}
                required
              />
            </Field>
          </div>
          <Field label={t('email')}>
            <Input
              type="email"
              inputMode="email"
              autoComplete="off"
              value={form.email}
              onChange={(e) => set('email')(e.target.value)}
              placeholder={t('emailPlaceholder')}
              dir="ltr"
              required
            />
          </Field>
          <FormError
            error={error?.code === 'CONFLICT' ? null : error}
            override={error?.code === 'CONFLICT' ? t('conflict') : undefined}
          />
        </form>
      </Modal>
    </>
  );
}
