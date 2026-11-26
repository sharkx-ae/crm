// Helpers for the real-api Playwright path (`chromium` project) on the seeded local database (F10a S1).
// Needs: `pnpm db:seed` run once in api/, SEED_PASSWORD in api/.env.local, and no RESEND_API_KEY there, so the api
// writes every email to api/.mail (the local file transport). Nothing here is used by src/.
import { existsSync, readFileSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';
import { expect, type Page } from '@playwright/test';

const API_DIR = fileURLToPath(new URL('../../../../api/', import.meta.url));
const MAIL_DIR = `${API_DIR}.mail/`;

/** The seed's shared password (D5), read from the api's local env file; undefined when it is not set up. */
export function seedPassword(): string | undefined {
  const file = `${API_DIR}.env.local`;
  if (!existsSync(file)) return undefined;
  return parseEnv(readFileSync(file, 'utf8')).SEED_PASSWORD || undefined;
}

/** Waits for a sign-in code mailed to `to` after `since` (ms) and returns its six digits. */
async function codeFor(to: string, since: number): Promise<string> {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    // File names start with the send time in ms, so the newest is last by name.
    const names = existsSync(MAIL_DIR) ? (await readdir(MAIL_DIR)).sort().reverse() : [];
    for (const name of names) {
      if (Number(name.split('-')[0]) < since) break;
      const mail = JSON.parse(await readFile(`${MAIL_DIR}${name}`, 'utf8')) as {
        to: string;
        template?: string;
        text: string;
      };
      const code = /\b(\d{6})\b/.exec(mail.text)?.[1];
      if (mail.to === to && mail.template === 'code' && code) return code;
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(
    `no sign-in code for ${to} in api/.mail (is RESEND_API_KEY unset in api/.env.local?)`,
  );
}

/** Signs in through the real screens: password, then the code from api/.mail. */
export async function signInReal(page: Page, email: string, password: string) {
  await page.goto('/en/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  const since = Date.now() - 1_000;
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page).toHaveURL(/\/en\/code$/);
  // The code form submits itself once the sixth digit lands.
  await page.getByLabel('Digit 1 of 6').fill(await codeFor(email, since));
  await expect(page).not.toHaveURL(/\/code$/);
}

export const NOT_FOUND = 'We could not find that page';
