import { expect, test } from '@playwright/test';

test('home sends a visitor to sign in', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/en\/login$/);
  await expect(page.getByLabel('Email')).toBeVisible();
});

test('arabic renders right-to-left', async ({ page }) => {
  await page.goto('/ar');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
});

test('/api/health returns ok (web → api → db)', async ({ request }) => {
  const res = await request.get('/api/health');
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body).toMatchObject({ status: 'ok', service: 'web', checks: { api: 'ok', db: 'ok' } });
  expect(body.version).toBeTruthy();
});
