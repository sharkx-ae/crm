import { expect, type Page, test } from '@playwright/test';
import { NOT_FOUND, seedPassword, signInReal } from './support/real.ts';

// F10a S1 on the real api and the seeded database (no fake api): a client user sees only its own client and never a
// staff screen; a manager is unaffected. Each run sends one sign-in code per account (limit: 3 per 10 minutes).
const password = seedPassword();
test.skip(!password, 'needs `pnpm db:seed` and SEED_PASSWORD in api/.env.local');
test.describe.configure({ mode: 'serial' });

const UUID = /\/p\/([0-9a-f-]{36})\//;
const ids: { lumiere?: string; pearl?: string } = {};

async function projectIdFromHome(page: Page, name: string): Promise<string> {
  const href = await page.getByRole('link', { name: `Open ${name}` }).getAttribute('href');
  const id = UUID.exec(href ?? '')?.[1];
  if (!id) throw new Error(`no link to ${name} on the clients home (is the database seeded?)`);
  return id;
}

test('manager: sees every client and the staff screens', async ({ page }) => {
  await signInReal(page, 'aisha.rahman@sharkx.test', password as string);
  await expect(page).toHaveURL(/\/en\/clients$/);
  ids.lumiere = await projectIdFromHome(page, 'Lumière Aesthetics');
  ids.pearl = await projectIdFromHome(page, 'Pearl Derma Clinic');

  for (const id of [ids.lumiere, ids.pearl]) {
    await page.goto(`/en/p/${id}/settings/hours`);
    await expect(page.getByRole('heading', { name: 'Business hours' })).toBeVisible();
  }
  // Managers have no Team page (super admin only).
  await page.goto('/en/team');
  await expect(page.getByRole('heading', { name: NOT_FOUND })).toBeVisible();
});

test('client user: lands on its own client; foreign and staff-only URLs are not found', async ({
  page,
}) => {
  test.skip(!ids.lumiere || !ids.pearl, 'the manager test finds the seeded client ids');
  await signInReal(page, 'lina@lumiere.test', password as string);
  await expect(page).toHaveURL(new RegExp(`/en/p/${ids.lumiere}/overview$`));

  // The top bar names the client (no switcher); the rail shows only the client's areas.
  await expect(page.getByText('Lumière Aesthetics').first()).toBeVisible();
  await expect(page.getByRole('button', { name: /Agency workspace/ })).toHaveCount(0);
  const rail = page.getByRole('navigation', { name: 'Main' });
  await expect(rail.getByRole('link')).toHaveText(['Overview']);

  // Design check: no staff-only label anywhere on the client's page.
  // biome-ignore lint/performance/useDomNodeTextContent: rendered text only; textContent would also read the inline RSC scripts (message catalogs).
  const text = await page.locator('body').innerText();
  for (const label of ['Pipeline', 'Tasks', 'Contacts', 'Owner', 'Stage', 'Notes', 'Team', 'Audit'])
    expect(text, label).not.toContain(label);

  const deny = [
    '/en/clients',
    '/en/team',
    '/en/audit',
    `/en/p/${ids.lumiere}/settings`,
    `/en/p/${ids.lumiere}/settings/hours`,
    `/en/p/${ids.lumiere}/settings/client-users`,
    `/en/p/${ids.lumiere}/contacts`,
    `/en/p/${ids.lumiere}/pipeline`,
    `/en/p/${ids.lumiere}/tasks`,
    `/en/p/${ids.pearl}/overview`,
    `/en/p/${ids.pearl}/settings/hours`,
  ];
  for (const path of deny) {
    await page.goto(path);
    await expect(page.getByRole('heading', { name: NOT_FOUND }), path).toBeVisible();
  }

  // Still signed in and still fine on its own overview afterwards.
  await page.goto(`/en/p/${ids.lumiere}/overview`);
  await expect(page.getByRole('heading', { name: NOT_FOUND })).toHaveCount(0);
});
