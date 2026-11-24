// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderIntl } from '../../test/render.tsx';
import { Button, IconButton } from './button.tsx';
import { Field } from './field.tsx';
import { Input, Textarea } from './input.tsx';
import { Select } from './select.tsx';
import { Switch } from './switch.tsx';

describe('Button', () => {
  it('is a secondary button by default, so a forgotten prop never adds a red one', () => {
    renderIntl(<Button>Save</Button>);
    const b = screen.getByRole('button', { name: 'Save' });
    expect(b.className).toContain('border-sx-black');
    expect(b.className).not.toContain('bg-sx-red');
    expect(b.getAttribute('type')).toBe('button');
  });

  it('renders the three variants and two sizes', () => {
    renderIntl(
      <>
        <Button variant="primary">P</Button>
        <Button variant="ghost">G</Button>
        <Button size="sm">S</Button>
      </>,
    );
    expect(screen.getByText('P').className).toContain('bg-sx-red');
    expect(screen.getByText('G').className).toContain('bg-transparent');
    expect(screen.getByText('S').className).toContain('h-8');
    expect(screen.getByText('P').className).toContain('h-[38px]');
  });

  it('keeps type=submit when asked and fires onClick', async () => {
    const onClick = vi.fn();
    renderIntl(
      <Button type="submit" onClick={onClick}>
        Go
      </Button>,
    );
    const b = screen.getByRole('button', { name: 'Go' });
    expect(b.getAttribute('type')).toBe('submit');
    await userEvent.click(b);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('does not fire when disabled', async () => {
    const onClick = vi.fn();
    renderIntl(
      <Button disabled onClick={onClick}>
        Go
      </Button>,
    );
    const b = screen.getByRole('button', { name: 'Go' }) as HTMLButtonElement;
    expect(b.disabled).toBe(true);
    await userEvent.click(b);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('loading disables, marks busy and keeps the label', () => {
    renderIntl(<Button loading>Saving</Button>);
    const b = screen.getByRole('button', { name: 'Saving' }) as HTMLButtonElement;
    expect(b.disabled).toBe(true);
    expect(b.getAttribute('aria-busy')).toBe('true');
    expect(b.querySelector('svg.animate-spin')).not.toBeNull();
  });

  it('puts the icon before the label and hides it from assistive tech', () => {
    renderIntl(<Button icon="plus">Add</Button>);
    const b = screen.getByRole('button', { name: 'Add' });
    expect(b.firstElementChild?.tagName.toLowerCase()).toBe('svg');
    expect(b.firstElementChild?.getAttribute('aria-hidden')).toBe('true');
  });

  it('asChild styles the child link instead of rendering a button', () => {
    renderIntl(
      <Button asChild variant="primary" icon="arrow">
        <a href="/go">Go on</a>
      </Button>,
    );
    expect(screen.queryByRole('button')).toBeNull();
    const a = screen.getByRole('link', { name: 'Go on' });
    expect(a.getAttribute('href')).toBe('/go');
    expect(a.className).toContain('bg-sx-red');
    expect(a.querySelector('svg')).not.toBeNull();
  });

  it('asChild uses aria-disabled, since a link cannot be disabled', () => {
    renderIntl(
      <Button asChild disabled>
        <a href="/go">Go on</a>
      </Button>,
    );
    expect(screen.getByRole('link').getAttribute('aria-disabled')).toBe('true');
  });
});

describe('IconButton', () => {
  it('takes its accessible name from label', () => {
    renderIntl(<IconButton label="Close" icon="x" />);
    expect(screen.getByRole('button', { name: 'Close' })).toBeTruthy();
  });

  it('shows a dot only when asked', () => {
    const { container, rerender } = renderIntl(<IconButton label="Bell" icon="bell" />);
    expect(container.querySelectorAll('span[aria-hidden="true"]')).toHaveLength(0);
    rerender(<IconButton label="Bell" icon="bell" badgeDot />);
    expect(container.querySelectorAll('span[aria-hidden="true"]')).toHaveLength(1);
  });
});

describe('Field', () => {
  it('connects the label to the control', () => {
    renderIntl(
      <Field label="Name">
        <Input />
      </Field>,
    );
    expect(screen.getByLabelText('Name').tagName.toLowerCase()).toBe('input');
  });

  it('wires hint and error into aria-describedby and sets aria-invalid', () => {
    renderIntl(
      <Field label="Email" hint="Work address" error="Not an email">
        <Input type="email" />
      </Field>,
    );
    const input = screen.getByLabelText('Email');
    const describedBy = (input.getAttribute('aria-describedby') ?? '').split(' ');
    expect(describedBy).toHaveLength(2);
    expect(document.getElementById(describedBy[0] as string)?.textContent).toBe('Work address');
    expect(document.getElementById(describedBy[1] as string)?.textContent).toBe('Not an email');
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(screen.getByRole('alert').textContent).toBe('Not an email');
  });

  it('adds neither aria-invalid nor aria-describedby when there is nothing to say', () => {
    renderIntl(
      <Field label="City">
        <Input />
      </Field>,
    );
    const input = screen.getByLabelText('City');
    expect(input.hasAttribute('aria-invalid')).toBe(false);
    expect(input.hasAttribute('aria-describedby')).toBe(false);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('honours htmlFor and the control keeps its own id', () => {
    renderIntl(
      <Field label="Industry" htmlFor="industry">
        <Input id="industry" />
      </Field>,
    );
    expect(screen.getByLabelText('Industry').id).toBe('industry');
  });

  it('merges a describedby the control already has', () => {
    renderIntl(
      <Field label="Note" hint="Optional">
        <Textarea aria-describedby="extra" />
      </Field>,
    );
    const ids = (screen.getByLabelText('Note').getAttribute('aria-describedby') ?? '').split(' ');
    expect(ids).toContain('extra');
    expect(ids).toHaveLength(2);
  });

  it('wires a Select the same way', () => {
    renderIntl(
      <Field label="City" error="Pick one">
        <Select options={[{ value: 'a', label: 'A' }]} value="a" onValueChange={() => {}} />
      </Field>,
    );
    const select = screen.getByLabelText('City');
    expect(select.tagName.toLowerCase()).toBe('select');
    expect(select.getAttribute('aria-invalid')).toBe('true');
  });
});

describe('Input and Textarea', () => {
  it('inherits the page direction for text (no dir), keeps emails, phones and passwords left-to-right', () => {
    renderIntl(
      <>
        <Input aria-label="n" />
        <Input aria-label="e" type="email" />
        <Input aria-label="t" type="tel" />
        <Input aria-label="p" type="password" />
        <Input aria-label="x" dir="rtl" />
        <Textarea aria-label="a" />
      </>,
      { locale: 'ar' },
    );
    const dir = (name: string) => screen.getByLabelText(name).getAttribute('dir');
    // null = no attribute: the control inherits <html dir="rtl">. An explicit dir="auto" would make an EMPTY
    // input resolve to LTR in Chromium (placeholder and caret on the wrong side of an Arabic page).
    expect([dir('n'), dir('e'), dir('t'), dir('p'), dir('x'), dir('a')]).toEqual([
      null,
      'ltr',
      'ltr',
      'ltr',
      'rtl',
      null,
    ]);
    expect(document.documentElement.dir).toBe('rtl');
  });

  it('is 40px high, or 34px when small, and shows the red focus ring utility', () => {
    renderIntl(
      <>
        <Input aria-label="md" />
        <Input aria-label="sm" size="sm" />
      </>,
    );
    expect(screen.getByLabelText('md').className).toContain('h-10');
    expect(screen.getByLabelText('md').className).toContain('focus-ring');
    expect(screen.getByLabelText('sm').className).toContain('h-[34px]');
  });

  it('passes typing through', async () => {
    const onChange = vi.fn();
    renderIntl(<Input aria-label="n" onChange={onChange} />);
    await userEvent.type(screen.getByLabelText('n'), 'Lina');
    expect(onChange).toHaveBeenCalledTimes(4);
    expect((screen.getByLabelText('n') as HTMLInputElement).value).toBe('Lina');
  });
});

describe('Select', () => {
  const options = [
    { value: 'dubai', label: 'Dubai' },
    { value: 'abu', label: 'Abu Dhabi' },
    { value: 'ma', label: 'Morocco', disabled: true },
  ];

  it('is a native select with the options', () => {
    renderIntl(<Select aria-label="City" options={options} value="abu" onValueChange={() => {}} />);
    const s = screen.getByRole('combobox', { name: 'City' }) as HTMLSelectElement;
    expect(s.value).toBe('abu');
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual([
      'Dubai',
      'Abu Dhabi',
      'Morocco',
    ]);
    expect((screen.getByRole('option', { name: 'Morocco' }) as HTMLOptionElement).disabled).toBe(
      true,
    );
  });

  it('reports the chosen value, not the event', async () => {
    const onValueChange = vi.fn();
    renderIntl(
      <Select aria-label="City" options={options} value="dubai" onValueChange={onValueChange} />,
    );
    await userEvent.selectOptions(screen.getByLabelText('City'), 'abu');
    expect(onValueChange).toHaveBeenCalledWith('abu');
  });
});

describe('Switch', () => {
  it('is a switch with an accessible name and state', () => {
    renderIntl(<Switch label="Monday open" checked={false} onCheckedChange={() => {}} />);
    const sw = screen.getByRole('switch', { name: 'Monday open' });
    expect(sw.getAttribute('aria-checked')).toBe('false');
  });

  it('toggles with a click and with Space', async () => {
    const onCheckedChange = vi.fn();
    renderIntl(<Switch label="Open" checked={false} onCheckedChange={onCheckedChange} />);
    const sw = screen.getByRole('switch', { name: 'Open' });
    await userEvent.click(sw);
    expect(onCheckedChange).toHaveBeenLastCalledWith(true);
    sw.focus();
    await userEvent.keyboard(' ');
    expect(onCheckedChange).toHaveBeenCalledTimes(2);
  });

  it('shows checked state and does not toggle when disabled', async () => {
    const onCheckedChange = vi.fn();
    renderIntl(<Switch label="Open" checked disabled onCheckedChange={onCheckedChange} />);
    const sw = screen.getByRole('switch', { name: 'Open' });
    expect(sw.getAttribute('aria-checked')).toBe('true');
    await userEvent.click(sw);
    expect(onCheckedChange).not.toHaveBeenCalled();
  });
});
