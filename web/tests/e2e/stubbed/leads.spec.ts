import { expect, type Page, test } from '@playwright/test';
import { FIXTURE, LEAD_COUNT } from '../support/fixtures.ts';

// F4b on the stubbed api: staff and client leads, the drawer, export, contacts, and the EN/AR screenshots.
const { lumiere, sara } = FIXTURE.ids;

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

/** Opens a Select by its name and picks an option by its label (the list is a Radix portal, not a native select). */
async function choose(page: Page, name: string, option: string | RegExp) {
  await page.getByRole('combobox', { name }).click();
  await page.getByRole('option', { name: option, exact: true }).click();
}
const range = (page: Page, text: string) =>
  expect(page.getByRole('navigation', { name: 'Pagination' })).toContainText(text);

const noPageScroll = (page: Page) =>
  page.evaluate(
    () =>
      document.documentElement.scrollWidth <= window.innerWidth &&
      window.scrollX === 0 &&
      window.scrollY === 0,
  );

test('staff: filters, drawer, mark, assign, export and contacts', async ({ page }) => {
  test.setTimeout(60_000);
  await signIn(page, 'admin@example.test');
  await page.goto(`/en/p/${lumiere}/leads`);
  await expect(page.getByRole('table', { name: 'Leads' })).toBeVisible();

  // Tabs carry the counts. All is first for staff, and 64 is the whole fixture.
  await expect(page.getByRole('tab').first()).toHaveAccessibleName(/All/);
  for (const name of ['All', 'Unreviewed', 'MQL', 'SQL', 'Not qualified']) {
    await expect(page.getByRole('tab', { name: new RegExp(name) })).toContainText(/\d/);
  }
  await expect(page.getByRole('tab', { name: /All/ })).toContainText(String(LEAD_COUNT));

  // The 21st lead is on page 2; the footer pages through the server, one real link per page.
  await range(page, '1–20 of 64');
  await expect(page.getByRole('link', { name: 'Open Page Two Lead' })).toHaveCount(0);
  await page.getByRole('link', { name: 'Next page' }).click();
  await expect(page).toHaveURL(/page=2/);
  await expect(page.getByRole('link', { name: 'Open Page Two Lead' })).toBeVisible();
  await range(page, '21–40 of 64');
  await page.getByRole('link', { name: 'Previous page' }).click();
  await expect(page).not.toHaveURL(/page=/);
  await expect(page.getByRole('link', { name: 'Open Page Two Lead' })).toHaveCount(0);

  await page.getByRole('tab', { name: /Unreviewed/ }).click();
  await expect(page).toHaveURL(/tab=unreviewed/);
  await expect(page).not.toHaveURL(/page=|size=/);
  await expect(page.getByRole('link', { name: 'Open Sara Al Noor' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Open Noor SQL' })).toHaveCount(0);

  await page.getByRole('tab', { name: /All/ }).click();
  await expect(page).not.toHaveURL(/tab=/);
  await choose(page, 'Source', 'Google Ads');
  await expect(page).toHaveURL(/source=google/);
  await expect(page).not.toHaveURL(/tab=/);
  await expect(page.getByRole('link', { name: 'Open Google Only' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Open Sara Al Noor' })).toHaveCount(0);
  const href = await page.getByRole('link', { name: 'Export' }).getAttribute('href');
  expect(href).toContain('source=google');
  expect(href).toContain(`projectId=${lumiere}`);
  // The export is the whole filtered set: no paging in it.
  expect(href).not.toContain('limit=');
  expect(href).not.toContain('page=');

  await choose(page, 'Source', 'All sources');
  await expect(page).not.toHaveURL(/source=/);
  await choose(page, 'Owner', 'Unassigned');
  await expect(page).toHaveURL(/owner=unassigned/);
  await expect(page.getByRole('link', { name: 'Open Sara Al Noor' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Open Hadi New' })).toHaveCount(0);

  await choose(page, 'Owner', 'All owners');
  await expect(page).not.toHaveURL(/owner=/);
  await page.getByRole('searchbox', { name: 'Search leads' }).fill('Sara');
  await expect(page).toHaveURL(/q=Sara/);
  await expect(page.getByRole('link', { name: 'Open Sara Al Noor' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Open Google Only' })).toHaveCount(0);

  await page.getByRole('link', { name: 'Open Sara Al Noor' }).click();
  const drawer = page.getByRole('dialog', { name: 'Sara Al Noor' });
  await expect(drawer.getByText('Lead received from Meta Lead Ads')).toBeVisible();
  await expect(drawer.getByText('Botox')).toBeVisible();
  await drawer.getByRole('button', { name: 'Mark Sara Al Noor as Not qualified' }).click();
  const reason = page.getByRole('dialog', { name: 'Why is this lead not qualified?' });
  await expect(reason).toBeVisible();
  await reason.getByRole('button', { name: 'Mark not qualified' }).click();
  await expect(
    page.getByText(
      'Marked Sara Al Noor as Not qualified. Sent to the ad platform within 60 seconds.',
      { exact: true },
    ),
  ).toBeVisible();

  await drawer.getByRole('combobox', { name: 'Owner' }).click();
  await page.getByRole('option', { name: 'Rami Haddad' }).click();
  await expect(page.getByText('Assigned to Rami Haddad.', { exact: true })).toBeVisible();

  await page.goto(`/en/p/${lumiere}/contacts`);
  await expect(page.getByRole('table', { name: 'Contacts' })).toBeVisible();
  await page.getByRole('link', { name: 'Open Sara Al Noor' }).click();
  const contact = page.getByRole('dialog', { name: 'Sara Al Noor' });
  await expect(contact.getByText('Contact profile')).toBeVisible();
  await contact.getByRole('link', { name: /Ramadan consult/ }).click();
  await expect(page).toHaveURL(new RegExp(`/leads\\?lead=${sara}`));
  await expect(page.getByRole('dialog', { name: 'Sara Al Noor' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Timeline' })).toBeVisible();
});

test('staff: leads paging, page size, reload, filter reset, a page past the end, an old link', async ({
  page,
}) => {
  test.setTimeout(60_000);
  await signIn(page, 'admin@example.test');
  await page.goto(`/en/p/${lumiere}/leads`);
  await range(page, '1–20 of 64');
  const nav = page.getByRole('navigation', { name: 'Pagination' });
  // Previous is dimmed on the first page; the current page is marked; compact numbers show 1 … 4.
  await expect(nav.getByRole('button', { name: 'Previous page' })).toHaveAttribute(
    'aria-disabled',
    'true',
  );
  await expect(nav.getByRole('link', { name: 'Page 1' })).toHaveAttribute('aria-current', 'page');
  await expect(nav.getByRole('link', { name: 'Page 4' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Show d+ more/ })).toHaveCount(0);

  // A bigger page: the address carries size=50 and starts again at page 1; page 2 holds the other 14.
  await page.getByRole('link', { name: 'Page 3' }).click();
  await expect(page).toHaveURL(/page=3/);
  await choose(page, 'Rows per page', '50');
  await expect(page).toHaveURL(/size=50/);
  await expect(page).not.toHaveURL(/page=/);
  await range(page, '1–50 of 64');
  await page.getByRole('link', { name: 'Next page' }).click();
  await expect(page).toHaveURL(/page=2/);
  await range(page, '51–64 of 64');
  await expect(nav.getByRole('button', { name: 'Next page' })).toHaveAttribute(
    'aria-disabled',
    'true',
  );

  // The address is the state: a reload keeps the page and the size.
  await page.reload();
  await expect(page).toHaveURL(/page=2/);
  await expect(page).toHaveURL(/size=50/);
  await range(page, '51–64 of 64');

  // Changing a filter, the tab or the search starts again at page 1 (the size stays).
  await choose(page, 'Source', 'Google Ads');
  await expect(page).toHaveURL(/source=google/);
  await expect(page).not.toHaveURL(/page=/);
  await expect(page).toHaveURL(/size=50/);
  await choose(page, 'Source', 'All sources');
  await page.getByRole('link', { name: 'Next page' }).click();
  await expect(page).toHaveURL(/page=2/);
  await page.getByRole('tab', { name: /MQL/ }).click();
  await expect(page).toHaveURL(/tab=mql/);
  await expect(page).not.toHaveURL(/page=/);

  // A page past the end shows the last page and fixes the address.
  await page.goto(`/en/p/${lumiere}/leads?page=99`);
  await expect(page).toHaveURL(/page=4/);
  await range(page, '61–64 of 64');

  // An old ?limit= link is ignored: the default page of 20.
  await page.goto(`/en/p/${lumiere}/leads?limit=40`);
  await range(page, '1–20 of 64');
});

test('staff: contacts paging and the search toolbar inside the card', async ({ page }) => {
  test.setTimeout(60_000);
  await signIn(page, 'admin@example.test');
  await page.goto(`/en/p/${lumiere}/contacts`);
  await expect(page.getByRole('table', { name: 'Contacts' })).toBeVisible();
  // The search is the toolbar of the flush card, not a box above it.
  const card = page
    .locator('div.rounded-card')
    .filter({ has: page.getByRole('table', { name: 'Contacts' }) });
  await expect(card.getByRole('searchbox', { name: 'Search contacts' })).toBeVisible();
  await range(page, '1–20 of 30');
  await expect(page.getByRole('button', { name: /Show d+ more/ })).toHaveCount(0);
  await page.getByRole('link', { name: 'Next page' }).click();
  await expect(page).toHaveURL(/page=2/);
  await range(page, '21–30 of 30');

  await choose(page, 'Rows per page', '10');
  await expect(page).toHaveURL(/size=10/);
  await expect(page).not.toHaveURL(/page=/);
  await range(page, '1–10 of 30');
  await page.getByRole('link', { name: 'Page 3' }).click();
  await expect(page).toHaveURL(/page=3/);
  await range(page, '21–30 of 30');
  await page.reload();
  await range(page, '21–30 of 30');

  // The search starts again at page 1.
  await page.getByRole('searchbox', { name: 'Search contacts' }).fill('Person');
  await expect(page).toHaveURL(/q=Person/);
  await expect(page).not.toHaveURL(/page=/);
  await range(page, '1–10 of 28');

  await page.goto(`/en/p/${lumiere}/contacts?page=99`);
  await expect(page).toHaveURL(/page=2/);
  await range(page, '21–30 of 30');
});

test('client: waiting tab first, inline mark, no staff chrome, contacts not found', async ({
  page,
}) => {
  await signIn(page, 'client@example.test');
  await page.goto(`/en/p/${lumiere}/leads`);
  await expect(page.getByText(/leads waiting for your review/)).toBeVisible();
  await expect(page.getByRole('tab').first()).toHaveAccessibleName(/Waiting for review/);
  await expect(page.getByLabel('Owner')).toHaveCount(0);
  await expect(page.getByRole('columnheader', { name: 'Owner' })).toHaveCount(0);
  const rail = page.getByRole('navigation', { name: 'Main' });
  await expect(rail.getByRole('link')).toHaveText(['Overview', 'Leads']);
  await expect(rail.getByRole('link', { name: 'Contacts' })).toHaveCount(0);

  await page.getByRole('button', { name: 'Mark Hadi New as MQL' }).click();
  await expect(page.getByText('Marked Hadi New as MQL.', { exact: true })).toBeVisible();
  await expect(page.getByText(/Sent to the ad platform/)).toHaveCount(0);

  await page.getByRole('link', { name: 'Open Sara Al Noor' }).click();
  const drawer = page.getByRole('dialog', { name: 'Sara Al Noor' });
  await expect(drawer.getByRole('heading', { name: 'Qualification' })).toBeVisible();
  await expect(drawer.getByRole('heading', { name: 'Contact' })).toBeVisible();
  await expect(drawer.getByRole('heading', { name: 'Form answers' })).toBeVisible();
  await expect(drawer.getByText('Ramadan consult')).toBeVisible();
  await expect(drawer.getByRole('heading', { name: 'Owner' })).toHaveCount(0);
  await expect(drawer.getByRole('heading', { name: 'Timeline' })).toHaveCount(0);

  await page.goto(`/en/p/${lumiere}/contacts`);
  await expect(page.getByRole('heading', { name: 'We could not find that page' })).toBeVisible();
});

for (const size of SIZES) {
  for (const lang of ['en', 'ar'] as const) {
    test(`staff screens ${size.name} ${lang}`, async ({ page }) => {
      await page.setViewportSize({ width: size.width, height: size.height });
      await signIn(page, 'admin@example.test');
      const shot = async (screen: string) => {
        expect(await noPageScroll(page)).toBe(true);
        await page.screenshot({
          path: `test-results/screens/f4b-${screen}-${size.name}-${lang}.png`,
        });
      };

      await page.goto(`/${lang}/p/${lumiere}/leads`);
      await expect(page.getByRole('table', { name: 'Leads' })).toBeVisible();
      await shot('leads');

      await page.goto(`/${lang}/p/${lumiere}/leads?lead=${sara}`);
      const drawer = page.getByRole('dialog', { name: 'Sara Al Noor' });
      await expect(drawer).toBeVisible();
      if (size.width === 1440) {
        const box = await drawer.boundingBox();
        if (lang === 'ar') {
          expect(box?.x ?? 999).toBeLessThan(8);
          expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThan(size.width - 100);
        } else {
          expect(box?.x ?? 0).toBeGreaterThan(size.width - 530);
        }
      }
      await shot('drawer');

      await page.goto(`/${lang}/p/${lumiere}/contacts`);
      await expect(page.getByRole('table', { name: 'Contacts' })).toBeVisible();
      await shot('contacts');
    });

    test(`client screens ${size.name} ${lang}`, async ({ page }) => {
      await page.setViewportSize({ width: size.width, height: size.height });
      await signIn(page, 'client@example.test');
      const shot = async (screen: string) => {
        expect(await noPageScroll(page)).toBe(true);
        await page.screenshot({
          path: `test-results/screens/f4b-client-${screen}-${size.name}-${lang}.png`,
        });
      };

      await page.goto(`/${lang}/p/${lumiere}/leads`);
      await expect(page.getByText(/leads waiting for your review/)).toBeVisible();
      await shot('leads');

      await page.goto(`/${lang}/p/${lumiere}/leads?lead=${sara}`);
      const drawer = page.getByRole('dialog', { name: 'Sara Al Noor' });
      await expect(drawer).toBeVisible();
      await expect(drawer.getByRole('heading', { name: 'Timeline' })).toHaveCount(0);
      if (size.width === 1440 && lang === 'ar') {
        const box = await drawer.boundingBox();
        expect(box?.x ?? 999).toBeLessThan(8);
      }
      await shot('drawer');
    });
  }
}
