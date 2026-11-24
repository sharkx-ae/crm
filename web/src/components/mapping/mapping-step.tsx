'use client';

import { useTranslations } from 'next-intl';
import { type MappingTarget, mappingTarget } from '../../contracts/leads.ts';
import { UserText } from '../ui/bidi.tsx';
import { Select } from '../ui/select.tsx';
import { Table, Td, Th } from '../ui/table.tsx';

export type MappingQuestion = { key: string; sample?: string };

// The "Check the fields" step of the connect wizard (mockup: Connect → Fields): one row per form question with the
// sample answer and where it goes. Controlled: the wizard (F14b) owns the value and saves it with saveFormMapping.
export function MappingStep({
  questions,
  value,
  onChange,
  disabled = false,
}: {
  questions: readonly MappingQuestion[];
  value: Readonly<Record<string, MappingTarget>>;
  onChange: (next: Record<string, MappingTarget>) => void;
  disabled?: boolean;
}) {
  const t = useTranslations('leads.mapping');
  const options = mappingTarget.options.map((v) => ({ value: v, label: t(`target.${v}`) }));

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sx-muted">{t('help')}</p>
      <Table aria-label={t('label')}>
        <thead>
          <tr>
            <Th>{t('question')}</Th>
            <Th className="w-48">{t('field')}</Th>
          </tr>
        </thead>
        <tbody>
          {questions.map((q) => (
            <tr key={q.key}>
              <Td>
                <p className="font-label text-sx-black">
                  <UserText>{q.key}</UserText>
                </p>
                {q.sample ? (
                  <p className="text-label text-sx-muted">
                    {t.rich('sample', {
                      answer: q.sample,
                      a: (chunks) => <UserText>{chunks}</UserText>,
                    })}
                  </p>
                ) : null}
              </Td>
              <Td>
                <Select
                  aria-label={`${t('field')}: ${q.key}`}
                  options={options}
                  value={value[q.key] ?? 'custom'}
                  disabled={disabled}
                  size="sm"
                  onValueChange={(v) => onChange({ ...value, [q.key]: v as MappingTarget })}
                />
              </Td>
            </tr>
          ))}
        </tbody>
      </Table>
    </div>
  );
}
