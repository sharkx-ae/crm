// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import leads from '../../../messages/en/leads.json';
import type { MappingTarget } from '../../contracts/leads.ts';
import { renderIntl } from '../../test/render.tsx';
import { MappingStep } from './mapping-step.tsx';

const QUESTIONS = [
  { key: 'Full name', sample: 'Sara Benali' },
  { key: 'Mobile', sample: '055 300 8812' },
  { key: 'Which treatment?' },
];

function Harness({ onSave }: { onSave: (v: Record<string, MappingTarget>) => void }) {
  const [value, setValue] = useState<Record<string, MappingTarget>>({ 'Full name': 'name' });
  return (
    <MappingStep
      questions={QUESTIONS}
      value={value}
      onChange={(next) => {
        setValue(next);
        onSave(next);
      }}
    />
  );
}

const render = (onSave = vi.fn()) => {
  renderIntl(<Harness onSave={onSave} />, { extra: { leads } });
  return onSave;
};

describe('MappingStep', () => {
  it('lists each question with its sample answer and a labelled field select', () => {
    render();
    expect(screen.getByRole('table', { name: 'Form fields' })).toBeTruthy();
    expect(screen.getByText('Mobile')).toBeTruthy();
    expect(screen.getByText('055 300 8812')).toBeTruthy();
    const name = screen.getByRole('combobox', {
      name: 'Lead field: Full name',
    }) as HTMLSelectElement;
    expect(name.value).toBe('name');
    // Without a saved choice a question stays a custom field (nothing is dropped silently).
    expect(
      (screen.getByRole('combobox', { name: 'Lead field: Mobile' }) as HTMLSelectElement).value,
    ).toBe('custom');
  });

  it('offers the six targets in words', () => {
    render();
    const options = Array.from(
      (screen.getByRole('combobox', { name: 'Lead field: Mobile' }) as HTMLSelectElement).options,
    ).map((o) => o.textContent);
    expect(options).toEqual(['Name', 'Phone', 'Email', 'Custom field', 'Note', 'Ignore']);
  });

  it('reports the whole mapping on change', async () => {
    const onSave = render();
    await userEvent.selectOptions(
      screen.getByRole('combobox', { name: 'Lead field: Mobile' }),
      'phone',
    );
    expect(onSave).toHaveBeenLastCalledWith({ 'Full name': 'name', Mobile: 'phone' });
  });

  it('can be disabled while saving', () => {
    renderIntl(<MappingStep questions={QUESTIONS} value={{}} onChange={() => {}} disabled />, {
      extra: { leads },
    });
    for (const select of screen.getAllByRole('combobox')) {
      expect((select as HTMLSelectElement).disabled).toBe(true);
    }
  });
});
