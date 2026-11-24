import { expect, test } from '@playwright/test';
import { FIXTURE } from '../support/fixtures.ts';

// Screenshots for the design review against the mockup (web plan §7): sign-in and the shell, EN and AR, desktop and
// 360px. Saved under test-results/screens (git-ignored). Each also asserts no horizontal page scroll.
const SIZES = [
  { name: '1440', width: 1440, height: 900 },
  { name: '360', width: 360, height: 800 },
] as const;

for (const size of SIZES) {
  for (const lang of ['en', 'ar'] as const) {
    test(`screens ${size.name} ${lang}`, async ({ page }) => {
      await page.setViewportSize({ width: size.width, height: size.height });
      const shot = async (screen: string) => {
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
        ).toBe(true);
        await page.screenshot({
          path: `test-results/screens/f2a-${screen}-${size.name}-${lang}.png`,
        });
      };

      await page.goto(`/${lang}/login`);
      await shot('login');

      await page.locator('#email').fill('client@example.test');
      await page.locator('#password').fill(FIXTURE.password);
      await page.locator('form button[type="submit"]').click();
      await expect(page).toHaveURL(new RegExp(`/${lang}/code$`));
      await shot('code');

      await page.locator('input[inputmode="numeric"]').first().fill(FIXTURE.code);
      // The client's saved language is English, so sign-in lands in English.
      await expect(page).toHaveURL(new RegExp(`/en/p/${FIXTURE.ids.lumiere}/overview$`));
      if (lang === 'ar') await page.goto(`/ar/p/${FIXTURE.ids.lumiere}/overview`);
      await shot('overview');
    });
  }
}
