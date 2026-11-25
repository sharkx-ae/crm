import { expect, type Page, test } from '@playwright/test';
import { FIXTURE } from '../support/fixtures.ts';

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

  // Tabs carry the counts. All is first for staff, and 40 is the whole fixture.
  await expect(page.getByRole('tab').first()).toHaveAccessibleName(/All/);
  for (const name of ['All', 'Unreviewed', 'MQL', 'SQL', 'Not qualified']) {
    await expect(page.getByRole('tab', { name: new RegExp(name) })).toContainText(/\d/);
  }
  await expect(page.getByRole('tab', { name: /All/ })).toContainText('40');

  // The 21st lead is past the first page until "Show 20 more".
  await expect(page.getByRole('link', { name: 'Open Page Two Lead' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Show 20 more' }).click();
  await expect(page).toHaveURL(/limit=40/);
  await expect(page.getByRole('link', { name: 'Open Page Two Lead' })).toBeVisible();

  await page.getByRole('tab', { name: /Unreviewed/ }).click();
  await expect(page).toHaveURL(/tab=unreviewed/);
  await expect(page).not.toHaveURL(/limit=/);
  await expect(page.getByRole('link', { name: 'Open Sara Al Noor' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Open Noor SQL' })).toHaveCount(0);

  await page.getByRole('tab', { name: /All/ }).click();
  await expect(page).not.toHaveURL(/tab=/);
  await page.getByLabel('Source').selectOption('google');
  await expect(page).toHaveURL(/source=google/);
  await expect(page).not.toHaveURL(/tab=/);
  await expect(page.getByRole('link', { name: 'Open Google Only' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Open Sara Al Noor' })).toHaveCount(0);
  const href = await page.getByRole('link', { name: 'Export' }).getAttribute('href');
  expect(href).toContain('source=google');
  expect(href).toContain(`projectId=${lumiere}`);
  expect(href).not.toContain('limit=');

  await page.getByLabel('Source').selectOption('');
  await expect(page).not.toHaveURL(/source=/);
  await page.getByLabel('Owner').selectOption('unassigned');
  await expect(page).toHaveURL(/owner=unassigned/);
  await expect(page.getByRole('link', { name: 'Open Sara Al Noor' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Open Hadi New' })).toHaveCount(0);

  await page.getByLabel('Owner').selectOption('');
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

  await drawer.getByLabel('Owner').selectOption({ label: 'Rami Haddad' });
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
