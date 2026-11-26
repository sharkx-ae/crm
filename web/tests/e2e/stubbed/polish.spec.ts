import { expect, type Page, test } from '@playwright/test';
import { FIXTURE } from '../support/fixtures.ts';

// UI polish review set (before/after): login, code, Clients home, Overview (staff and client), Leads page 2,
// Contacts, an open Select, and a visible toast; 1440 and 360, EN and AR. Saved to
// test-results/screens/polish-<screen>-<size>-<lang>.png (git-ignored). Each shot also asserts no sideways scroll.
const { lumiere } = FIXTURE.ids;

const SIZES = [
  { name: '1440', width: 1440, height: 900 },
  { name: '360', width: 360, height: 800 },
] as const;

async function signIn(page: Page, email: string) {
  await page.goto('/en/login');
  await page.locator('#email').fill(email);
  await page.locator('#password').fill(FIXTURE.password);
  await page.locator('form button[type="submit"]').click();
  await page.locator('input[inputmode="numeric"]').first().fill(FIXTURE.code);
  await expect(page).not.toHaveURL(/\/code$/);
}

for (const size of SIZES) {
  for (const lang of ['en', 'ar'] as const) {
    test(`polish ${size.name} ${lang}`, async ({ page }) => {
      test.setTimeout(90_000);
      await page.setViewportSize({ width: size.width, height: size.height });
      const shot = async (screen: string) => {
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
          `${screen}: horizontal page scroll`,
        ).toBe(true);
        await page.screenshot({
          path: `test-results/screens/polish-${screen}-${size.name}-${lang}.png`,
        });
      };

      // Auth screens.
      await page.goto(`/${lang}/login`);
      await shot('login');
      await page.locator('#email').fill('client@example.test');
      await page.locator('#password').fill(FIXTURE.password);
      await page.locator('form button[type="submit"]').click();
      await expect(page).toHaveURL(new RegExp(`/${lang}/code$`));
      await shot('code');
      await page.context().clearCookies();

      // Staff.
      await signIn(page, 'admin@example.test');
      await page.goto(`/${lang}/clients`);
      await expect(page.getByRole('table')).toBeVisible();
      await shot('clients');

      await page.goto(`/${lang}/p/${lumiere}/overview`);
      await expect(page.locator('svg[data-chart="bars"]:visible').first()).toBeVisible();
      await shot('overview-staff');

      await page.goto(`/${lang}/p/${lumiere}/leads?page=2`);
      await expect(page.getByRole('table')).toBeVisible();
      await shot('leads-page2');

      // An open Select (Leads source). A native select draws no popup in a screenshot; the custom one does.
      await page.getByRole('combobox').first().click();
      await page
        .getByRole('listbox')
        .waitFor({ timeout: 2000 })
        .catch(() => undefined);
      await shot('select-open');
      await page.keyboard.press('Escape');

      await page.goto(`/${lang}/p/${lumiere}/contacts`);
      await expect(page.getByRole('table')).toBeVisible();
      await shot('contacts');

      // A toast: a contact id that does not exist raises "no longer available".
      await page.goto(
        `/${lang}/p/${lumiere}/contacts?contact=d1000000-0000-4000-8000-0000000000ff`,
      );
      await expect(page.locator('[role="status"]').first()).toBeVisible();
      await shot('toast');
      await page.context().clearCookies();

      // Client.
      await signIn(page, 'client@example.test');
      await page.goto(`/${lang}/p/${lumiere}/overview`);
      await expect(page.locator('svg[data-chart="bars"]:visible').first()).toBeVisible();
      await shot('overview-client');
    });
  }
}
