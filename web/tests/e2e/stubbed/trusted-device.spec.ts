import { expect, type Page, test } from '@playwright/test';
import { FIXTURE } from '../support/fixtures.ts';

// Spec F1c-remember-device on the fake api: tick the box at the code step, sign out, and the next sign-in
// needs the password only. An unticked sign-in still asks for the code.
async function password(page: Page, email: string) {
  await page.goto('/en/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(FIXTURE.password);
  await page.getByRole('button', { name: 'Continue' }).click();
}

test('ticked at the code step: the next sign-in skips the code', async ({ page }) => {
  await password(page, 'admin@example.test');
  await expect(page).toHaveURL(/\/en\/code$/);
  const trust = page.getByRole('checkbox', { name: /Don't ask for a code on this device/ });
  await expect(trust).not.toBeChecked();
  await trust.check();
  await page.getByLabel('Digit 1 of 6').fill(FIXTURE.code);
  await expect(page).not.toHaveURL(/\/code$/);

  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/en\/login$/);

  await password(page, 'admin@example.test');
  await expect(page).not.toHaveURL(/\/(code|login)$/);
  await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();
});

test('not ticked: the code is asked every time', async ({ page }) => {
  await password(page, 'client@example.test');
  await page.getByLabel('Digit 1 of 6').fill(FIXTURE.code);
  await expect(page).not.toHaveURL(/\/code$/);
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/en\/login$/);

  await password(page, 'client@example.test');
  await expect(page).toHaveURL(/\/en\/code$/);
});
