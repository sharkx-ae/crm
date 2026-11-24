import { expect, type Page, test } from '@playwright/test';
import { FIXTURE } from '../support/fixtures.ts';

// Stubbed path (web plan §7): web against the fake api. Sign in → land → shell → guards → RTL → sign out.
const { lumiere, pearl } = FIXTURE.ids;

async function signIn(page: Page, email: string) {
  await page.goto('/');
  await expect(page).toHaveURL(/\/en\/login$/);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(FIXTURE.password);
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page).toHaveURL(/\/en\/code$/);
  // The code form submits itself once the sixth digit lands.
  await page.getByLabel('Digit 1 of 6').fill(FIXTURE.code);
  await expect(page).not.toHaveURL(/\/code$/);
}

const noSideScroll = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

test('client user: lands on its overview, sees only its own areas, gets not-found elsewhere', async ({
  page,
}) => {
  await signIn(page, 'client@example.test');
  await expect(page).toHaveURL(new RegExp(`/en/p/${lumiere}/overview$`));
  const rail = page.getByRole('navigation', { name: 'Main' });
  await expect(rail.getByRole('link')).toHaveText(['Overview']);
  await expect(page.getByText('Client dashboard')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Overview' })).toHaveAttribute(
    'aria-current',
    'page',
  );
  expect(await noSideScroll(page)).toBe(true);

  for (const path of ['/en/clients', `/en/p/${pearl}/overview`, '/en/no-such-page']) {
    await page.goto(path);
    await expect(page.getByRole('heading', { name: 'We could not find that page' })).toBeVisible();
  }
});

test('language switch saves the choice and turns the page right-to-left', async ({ page }) => {
  await signIn(page, 'client@example.test');
  await expect(page).toHaveURL(new RegExp(`/en/p/${lumiere}/overview$`));
  await page.getByRole('button', { name: 'Language' }).click();
  await page.getByRole('menuitem', { name: 'العربية' }).click();
  await expect(page).toHaveURL(new RegExp(`/ar/p/${lumiere}/overview$`));
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');

  // The rail sits at the inline start: the right edge in Arabic.
  const box = await page.locator('#sx-rail').boundingBox();
  const width = page.viewportSize()?.width ?? 0;
  expect(box && box.x + box.width).toBeGreaterThan(width - 2);
  expect(await noSideScroll(page)).toBe(true);
});

test('super admin: clients landing, switcher lists every client, sign out', async ({ page }) => {
  await signIn(page, 'admin@example.test');
  await expect(page).toHaveURL(/\/en\/clients$/);
  await page.getByRole('button', { name: /Agency workspace/ }).click();
  await expect(page.getByRole('menuitem', { name: /Pearl Derma Clinic/ })).toBeVisible();
  await page.getByRole('menuitem', { name: /Lumière Aesthetics/ }).click();
  await expect(page).toHaveURL(new RegExp(`/en/p/${lumiere}/overview$`));

  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/en\/login$/);
});

test('sign-in lands in the saved language, whatever the sign-in page was in', async ({ page }) => {
  await signIn(page, 'manager-fr@example.test');
  await expect(page).toHaveURL(/\/fr\/clients$/);
  await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
});

test.describe('360 px', () => {
  test.use({ viewport: { width: 360, height: 800 } });

  test('no horizontal scroll; the menu button opens the rail; the closed rail is out of the tab order', async ({
    page,
  }) => {
    await signIn(page, 'client@example.test');
    await expect(page).toHaveURL(new RegExp(`/en/p/${lumiere}/overview$`));
    expect(await noSideScroll(page)).toBe(true);
    // CSS, not role: a closed rail is invisible, so it is (correctly) absent from the accessibility tree.
    const railLink = page.locator('#sx-rail nav a').first();

    // Closed: tabbing past the skip link reaches the menu button, never a hidden rail link.
    await page.locator('body').press('Tab');
    await page.keyboard.press('Tab');
    await expect(railLink).not.toBeFocused();
    const menu = page.getByRole('button', { name: 'Open menu' });
    await expect(menu).toBeFocused();

    await menu.click();
    await expect(page.locator('#sx-rail')).toHaveAttribute('data-open', 'true');
    await expect(railLink).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(page.locator('#sx-rail')).toHaveAttribute('data-open', 'false');
    await expect(page.getByRole('button', { name: 'Open menu' })).toBeFocused();
  });

  test('staff screens in Arabic: no horizontal scroll, switcher open included', async ({
    page,
  }) => {
    await signIn(page, 'admin@example.test');
    await expect(page).toHaveURL(/\/en\/clients$/);
    for (const path of ['/ar/clients', `/ar/p/${pearl}/overview`]) {
      await page.goto(path);
      await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
      expect(await noSideScroll(page), path).toBe(true);
    }
    await page.getByRole('button', { name: /Pearl Derma Clinic/ }).click();
    await expect(page.getByRole('menu')).toBeVisible();
    expect(await noSideScroll(page)).toBe(true);
  });
});
