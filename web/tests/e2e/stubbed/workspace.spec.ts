import { expect, type Page, test } from '@playwright/test';
import { FIXTURE } from '../support/fixtures.ts';

// F2b against the fake api: Clients home, Add client modal, Team, Business hours.
const { lumiere } = FIXTURE.ids;

async function signIn(page: Page, email: string) {
  await page.goto('/en/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(FIXTURE.password);
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page).toHaveURL(/\/en\/code$/);
  await page.getByLabel('Digit 1 of 6').fill(FIXTURE.code);
  await expect(page).not.toHaveURL(/\/code$/);
}
const noSideScroll = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

test('clients home: KPI strip, one row per client, search, row opens the client', async ({
  page,
}) => {
  await signIn(page, 'admin@example.test');
  await expect(page).toHaveURL(/\/en\/clients$/);
  await expect(page.getByText('Connections to fix')).toBeVisible();
  const table = page.getByRole('table', { name: 'Clients' });
  await expect(table.getByRole('link', { name: 'Open Lumière Aesthetics' })).toBeVisible();
  await expect(table.getByRole('link', { name: 'Open Pearl Derma Clinic' })).toBeVisible();

  await page.getByPlaceholder('Find a client').fill('pearl');
  await expect(page).toHaveURL(/\?q=pearl$/);
  await expect(table.getByRole('link', { name: 'Open Lumière Aesthetics' })).toHaveCount(0);
  await page.getByPlaceholder('Find a client').fill('nothing like this');
  await expect(page.getByText('No client matches')).toBeVisible();

  await page.getByPlaceholder('Find a client').fill('');
  await page.getByRole('link', { name: 'Open Lumière Aesthetics' }).click();
  await expect(page).toHaveURL(new RegExp(`/en/p/${lumiere}/overview$`));
});

test('add client: the mockup four fields, and the button waits for them', async ({ page }) => {
  await signIn(page, 'admin@example.test');
  await page.getByRole('button', { name: 'Add client' }).click();
  const dialog = page.getByRole('dialog', { name: 'Add a client' });
  await expect(dialog.getByLabel('Client name')).toBeFocused();
  await expect(dialog.getByLabel('City')).toBeVisible();
  await expect(dialog.getByLabel('Industry')).toBeVisible();
  await expect(dialog.getByLabel('Email')).toBeVisible();
  const create = dialog.getByRole('button', { name: 'Create client' });
  await expect(create).toBeDisabled();
  await dialog.getByLabel('Client name').fill('Marina Dental');
  await dialog.getByLabel('Industry').fill('Dental clinic');
  await dialog.getByLabel('Email').fill('owner@marina.test');
  await expect(create).toBeEnabled();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
});

test('a manager has no Add client and no Team item', async ({ page }) => {
  await signIn(page, 'manager-fr@example.test');
  await page.goto('/en/clients');
  await expect(page.getByRole('table', { name: 'Clients' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add client' })).toHaveCount(0);
  await expect(page.getByRole('navigation', { name: 'Main' }).getByRole('link')).toHaveText([
    'Clients',
  ]);
  await page.goto('/en/team');
  await expect(page.getByRole('heading', { name: 'We could not find that page' })).toBeVisible();
});

test('team lists the managers with an invite button', async ({ page }) => {
  await signIn(page, 'admin@example.test');
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Team' }).click();
  await expect(page).toHaveURL(/\/en\/team$/);
  await expect(page.getByRole('table', { name: 'Users' }).getByText('Rami Haddad')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Invite manager' })).toBeVisible();
});

test('client users: settings opens on its tab; invite, disable and enable a client user', async ({
  page,
}) => {
  // A fresh email each run: the fake api keeps who it invited.
  const email = `reception-${Date.now().toString(36)}@lumiere.test`;
  await signIn(page, 'manager-fr@example.test');
  await page.goto(`/en/p/${lumiere}/settings`);
  await expect(page).toHaveURL(new RegExp(`/en/p/${lumiere}/settings/client-users$`));
  await expect(page.getByRole('link', { name: 'Client users' })).toHaveAttribute(
    'aria-current',
    'page',
  );
  const table = page.getByRole('table', { name: 'Users' });
  await expect(table.getByText('Lina Haddad')).toBeVisible();

  // An email that already has an account is refused in the modal.
  await page.getByRole('button', { name: 'Invite client user' }).click();
  let dialog = page.getByRole('dialog', { name: 'Invite a client user' });
  await expect(dialog.getByText('Joins Lumière Aesthetics with the client role.')).toBeVisible();
  await dialog.getByLabel('Full name').fill('Someone Else');
  await dialog.getByLabel('Email').fill('client@example.test');
  await dialog.getByRole('button', { name: 'Send invite' }).click();
  await expect(dialog.getByText('That email already has an account.')).toBeVisible();
  await dialog.getByRole('button', { name: 'Cancel' }).click();

  await page.getByRole('button', { name: 'Invite client user' }).click();
  dialog = page.getByRole('dialog', { name: 'Invite a client user' });
  await dialog.getByLabel('Full name').fill('Front Desk');
  await dialog.getByLabel('Email').fill(email);
  await dialog.getByRole('button', { name: 'Send invite' }).click();
  await expect(page.getByText(`Invite sent to ${email}`).first()).toBeVisible();
  const row = table.getByRole('row').filter({ hasText: email });
  await expect(row).toContainText('Invited');

  await row.getByRole('button', { name: 'Disable Front Desk' }).click();
  await expect(row).toContainText('Disabled');
  // They never set a password, so enabling puts them back to Invited (as the real api does).
  await row.getByRole('button', { name: 'Enable Front Desk' }).click();
  await expect(row).toContainText('Invited');
  expect(await noSideScroll(page)).toBe(true);
});

test('business hours: a closing time before opening blocks Save', async ({ page }) => {
  await signIn(page, 'admin@example.test');
  await page.goto(`/en/p/${lumiere}/settings`);
  await expect(page).toHaveURL(new RegExp(`/en/p/${lumiere}/settings/client-users$`));
  await page.getByRole('link', { name: 'Business hours' }).click();
  await expect(page).toHaveURL(new RegExp(`/en/p/${lumiere}/settings/hours$`));
  await expect(page.getByRole('link', { name: 'Business hours' })).toHaveAttribute(
    'aria-current',
    'page',
  );
  const save = page.getByRole('button', { name: 'Save' });
  await page.getByLabel('Mon closes').fill('08:00');
  await expect(page.getByText('closing time must be after opening time')).toBeVisible();
  await expect(save).toBeDisabled();
  await page.getByLabel('Mon closes').fill('18:00');
  await save.click();
  await expect(page.getByText('Business hours saved').first()).toBeVisible();
  expect(await noSideScroll(page)).toBe(true);
});

test.describe('360 px', () => {
  test.use({ viewport: { width: 360, height: 800 } });
  test('clients home and hours have no horizontal page scroll', async ({ page }) => {
    await signIn(page, 'admin@example.test');
    expect(await noSideScroll(page)).toBe(true);
    await page.goto(`/en/p/${lumiere}/settings/hours`);
    await expect(page.getByRole('button', { name: 'Save' })).toBeVisible();
    expect(await noSideScroll(page)).toBe(true);
  });
});

test('a new client shows in the switcher straight away, without a reload', async ({ page }) => {
  // A fresh name each run: the fake api keeps what it creates, so a retry would otherwise hit "name taken".
  const name = `Marina Dental ${Date.now().toString(36)}`;
  await signIn(page, 'admin@example.test');
  await page.getByRole('button', { name: 'Add client' }).click();
  const dialog = page.getByRole('dialog', { name: 'Add a client' });
  await dialog.getByLabel('Client name').fill(name);
  await dialog.getByLabel('Industry').fill('Dental clinic');
  await dialog.getByLabel('Email').fill('owner@marina.test');
  await dialog.getByRole('button', { name: 'Create client' }).click();
  await expect(page).toHaveURL(/\/en\/p\/[0-9a-f-]{36}\/overview$/);
  // The switcher names the open client, and its menu lists the new one: no page reload happened in between.
  const switcher = page.getByRole('button', { name: new RegExp(name) });
  await expect(switcher).toBeVisible();
  await switcher.click();
  await expect(page.getByRole('menuitem', { name: new RegExp(name) })).toBeVisible();
  await page.keyboard.press('Escape');
  await page
    .getByRole('navigation', { name: 'Main' })
    .getByRole('link', { name: 'Overview' })
    .click();
  await page.goto('/en/clients');
  await expect(page.getByRole('link', { name: `Open ${name}` })).toBeVisible();
});
