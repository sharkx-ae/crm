// Helpers for the Radix Select in jsdom tests. The list is a portal that only exists while open, and while it is open
// Radix hides the rest of the page from the accessibility tree, so close it again (Escape) before querying elsewhere.
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

/** Opens a Select with the keyboard (focus, Enter) and returns the labels of its options. */
export async function openSelect(trigger: HTMLElement): Promise<string[]> {
  trigger.focus();
  await userEvent.keyboard('{Enter}');
  return screen.getAllByRole('option').map((o) => o.textContent ?? '');
}

/** Picks one option by its visible label; the list closes by itself. */
export async function chooseOption(trigger: HTMLElement, label: string | RegExp): Promise<void> {
  trigger.focus();
  await userEvent.keyboard('{Enter}');
  await userEvent.click(await screen.findByRole('option', { name: label }));
}

/** The labels of a Select's options, read without leaving it open. */
export async function optionLabels(trigger: HTMLElement): Promise<string[]> {
  const labels = await openSelect(trigger);
  await userEvent.keyboard('{Escape}');
  return labels;
}
