'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import type { BusinessHoursDay } from '../../contracts/projects.ts';
import { updateProjectSettings } from '../../lib/actions/projects.ts';
import { useRouter } from '../../lib/i18n/navigation.ts';
import { Button } from '../ui/button.tsx';
import { Card } from '../ui/card.tsx';
import { Field } from '../ui/field.tsx';
import { Input } from '../ui/input.tsx';
import { Select } from '../ui/select.tsx';
import { Switch } from '../ui/switch.tsx';
import { useToast } from '../ui/toast.tsx';
import { useErrorToast } from '../ui/use-error-toast.ts';

/** The zones the clients use (Dubai, Abu Dhabi, Morocco). */
export const ZONES = ['Asia/Dubai', 'Africa/Casablanca'] as const;

// 2024-01-01 was a Monday: ISO day n is that date plus n-1 days. Names come from Intl, so every language is right.
const dayName = (day: number, locale: string) =>
  new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone: 'UTC' }).format(
    new Date(Date.UTC(2024, 0, day)),
  );

/** Client settings → Business hours (F2b S4, mockup Settings → hours). */
export function HoursForm({
  projectId,
  timezone: initialZone,
  businessHours,
}: {
  projectId: string;
  timezone: string;
  businessHours: BusinessHoursDay[];
}) {
  const t = useTranslations('projects.hours');
  const locale = useLocale();
  const router = useRouter();
  const { toast } = useToast();
  const [timezone, setTimezone] = useState(initialZone);
  const [days, setDays] = useState(() => [...businessHours].sort((a, b) => a.day - b.day));
  const showError = useErrorToast();
  const [pending, start] = useTransition();

  const patch = (day: number, change: Partial<BusinessHoursDay>) =>
    setDays((ds) => ds.map((d) => (d.day === day ? { ...d, ...change } : d)));
  const invalid = days.some((d) => d.open && d.to <= d.from);
  const zones = ZONES.includes(initialZone as (typeof ZONES)[number])
    ? ZONES
    : [initialZone, ...ZONES];

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    if (invalid) {
      toast(t('invalid'), { tone: 'error' });
      return;
    }
    start(async () => {
      const res = await updateProjectSettings({ projectId, timezone, businessHours: days });
      if (!res.ok) {
        showError(res.error);
        return;
      }
      toast(t('saved'));
      router.refresh();
    });
  };

  return (
    <Card>
      <form onSubmit={save} className="flex flex-col gap-5" noValidate>
        <div>
          <h2 className="font-heading text-section text-sx-black">{t('title')}</h2>
          <p className="text-label text-sx-muted">{t('help')}</p>
        </div>
        <div className="max-w-80">
          <Field label={t('timezone')}>
            <Select
              value={timezone}
              onValueChange={setTimezone}
              options={zones.map((z) => ({ value: z, label: z }))}
            />
          </Field>
        </div>
        <ul className="flex flex-col">
          {days.map((d) => {
            const name = dayName(d.day, locale);
            return (
              <li
                key={d.day}
                className="flex flex-wrap items-center gap-3 border-b border-sx-border py-3 last:border-b-0"
              >
                <span className="w-12 font-heading">{name}</span>
                <Switch
                  checked={d.open}
                  onCheckedChange={(open) => patch(d.day, { open })}
                  label={t('openToggle', { day: name })}
                />
                <span className="w-14 text-label text-sx-muted">
                  {d.open ? t('open') : t('closed')}
                </span>
                <div className="w-32 flex-none">
                  <Input
                    type="time"
                    size="sm"
                    value={d.from}
                    disabled={!d.open}
                    aria-label={t('opens', { day: name })}
                    aria-invalid={(d.open && d.to <= d.from) || undefined}
                    onChange={(e) => patch(d.day, { from: e.target.value })}
                  />
                </div>
                <span className="text-label text-sx-muted">{t('to')}</span>
                <div className="w-32 flex-none">
                  <Input
                    type="time"
                    size="sm"
                    value={d.to}
                    disabled={!d.open}
                    aria-label={t('closes', { day: name })}
                    aria-invalid={(d.open && d.to <= d.from) || undefined}
                    onChange={(e) => patch(d.day, { to: e.target.value })}
                  />
                </div>
              </li>
            );
          })}
        </ul>
        <div>
          <Button variant="primary" type="submit" loading={pending} disabled={invalid}>
            {pending ? t('saving') : t('save')}
          </Button>
        </div>
      </form>
    </Card>
  );
}
