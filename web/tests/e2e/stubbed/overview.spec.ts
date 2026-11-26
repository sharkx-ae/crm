import { expect, type Page, test } from '@playwright/test';
import { FIXTURE } from '../support/fixtures.ts';

// F13a on the stubbed api: the staff and client Overview, the empty client, the agency view's zone labels, and the
// 1440/360 EN/AR screenshots.
const { lumiere, pearl } = FIXTURE.ids;

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

const noSideScroll = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

test('staff: five tiles, leads per day with its peak, sources folded into Other', async ({
  page,
}) => {
  await signIn(page, 'admin@example.test');
  await page.goto(`/en/p/${lumiere}/overview`);
  const main = page.locator('main');
  for (const label of [
    'Leads (30 days)',
    'New today',
    'Median first reply',
    'MQL rate',
    'SQL rate',
  ]) {
    await expect(main.getByText(label, { exact: true })).toBeVisible();
  }
  await expect(main.getByText('Waiting for review')).toHaveCount(0);
  await expect(main.getByText('40', { exact: true }).first()).toBeVisible();
  await expect(main.getByText('19 min', { exact: true })).toBeVisible();
  await expect(main.getByText(/^\d+\.\d%$/).first()).toBeVisible();

  await expect(main.getByRole('heading', { name: 'Leads per day' })).toBeVisible();
  await expect(main.getByText('Peak 4 on 7 Nov')).toBeVisible();
  await expect(
    main.getByRole('img', { name: /Leads per day, last 30 days, days in (GST|GMT\+4)/ }),
  ).toBeVisible();
  await expect(page.locator('svg[data-chart="bars"]:visible path[fill="#e70101"]')).toHaveCount(1);

  await expect(main.getByRole('heading', { name: 'Leads by source' })).toBeVisible();
  await expect(main.locator('li[data-rank]')).toHaveCount(5);
  await expect(main.getByText('Other (2 sources)')).toBeVisible();
  // No primary (red) button on the Overview.
  await expect(main.locator('button.bg-sx-red, a.bg-sx-red')).toHaveCount(0);
});

test('staff: a client without leads shows dashes and the empty states', async ({ page }) => {
  await signIn(page, 'admin@example.test');
  await page.goto(`/en/p/${pearl}/overview`);
  const main = page.locator('main');
  await expect(main.getByRole('img', { name: 'No data yet' })).toHaveCount(3);
  await expect(main.getByText('Last 30 days', { exact: true }).first()).toBeVisible();
  await expect(main.getByText('No leads in the last 30 days.')).toBeVisible();
  await expect(page.locator('svg[data-chart="bars"]:visible path')).toHaveCount(0);
});

test('client: six tiles, the waiting card with inline marks, and no agency view', async ({
  page,
}) => {
  await signIn(page, 'client@example.test');
  await expect(page).toHaveURL(new RegExp(`/en/p/${lumiere}/overview$`));
  const main = page.locator('main');
  await expect(main.getByText('Waiting for review', { exact: true }).first()).toBeVisible();

  const table = main.getByRole('table', { name: 'Leads waiting for your review' });
  await expect(table).toBeVisible();
  await expect(table.getByRole('columnheader', { name: 'Status' })).toHaveCount(0);
  const rows = table.locator('tbody tr');
  await expect(rows).toHaveCount(5);

  const review = main.getByRole('link', { name: 'Review leads' });
  await expect(review).toHaveAttribute('href', new RegExp(`/p/${lumiere}/leads\\?tab=unreviewed$`));

  // Marking a waiting lead takes it off the list after the refresh. The last row, an unnamed filler lead: the leads
  // spec marks the named ones and shares this fake api's state.
  const label = (await rows.last().locator('a').first().getAttribute('aria-label')) ?? '';
  const name = label.replace(/^Open /, '');
  await rows
    .last()
    .getByRole('button', { name: `Mark ${name} as MQL` })
    .click();
  await expect(page.getByText(`Marked ${name} as MQL.`, { exact: true })).toBeVisible();
  await expect(table.getByRole('link', { name: `Open ${name}` })).toHaveCount(0);

  // A row opens the lead in the Leads screen's drawer.
  await rows.first().locator('a').first().click();
  await expect(page).toHaveURL(/\/leads\?tab=unreviewed&lead=/);
  await expect(page.getByRole('dialog')).toBeVisible();

  await page.goto('/en/clients');
  await expect(page.getByRole('heading', { name: 'We could not find that page' })).toBeVisible();
});

test("agency view: each client's time zone is labelled", async ({ page }) => {
  await signIn(page, 'admin@example.test');
  await page.goto('/en/clients');
  // Scoped to each client's own row: other specs add clients to the shared fake api, some in the same city.
  await expect(page.getByRole('link', { name: 'Open Lumière Aesthetics' })).toContainText(
    'Dubai, Aesthetic clinic · GST',
  );
  await expect(page.getByRole('link', { name: 'Open Pearl Derma Clinic' })).toContainText(
    'Abu Dhabi, Dermatology · GST',
  );
});

for (const size of SIZES) {
  for (const lang of ['en', 'ar'] as const) {
    test(`overview screens ${size.name} ${lang}`, async ({ page }) => {
      await page.setViewportSize({ width: size.width, height: size.height });
      const shot = async (screen: string) => {
        expect(await noSideScroll(page)).toBe(true);
        await page.screenshot({
          path: `test-results/screens/f13a-${screen}-${size.name}-${lang}.png`,
          fullPage: true,
        });
      };

      await signIn(page, 'admin@example.test');
      await page.goto(`/${lang}/p/${lumiere}/overview`);
      const plot = page.locator('svg[data-chart="bars"]:visible');
      await expect(plot).toBeVisible();
      // The time axis stays left to right in Arabic too.
      await expect(plot.locator('xpath=..')).toHaveAttribute('dir', 'ltr');
      await shot('staff');

      await page.goto(`/${lang}/clients`);
      await expect(page.getByRole('table')).toBeVisible();
      await shot('agency');

      await page.context().clearCookies();
      await signIn(page, 'client@example.test');
      await page.goto(`/${lang}/p/${lumiere}/overview`);
      await expect(page.locator('svg[data-chart="bars"]:visible')).toBeVisible();
      await shot('client');
    });
  }
}
