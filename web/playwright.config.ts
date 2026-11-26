import { defineConfig, devices } from '@playwright/test';

// E2E runs against production builds: `pnpm build && pnpm test:e2e` (in web/).
// Ports differ from dev (3000/4000) so a running dev server is never reused by mistake.
// - chromium: web + the real api (needs the local Postgres): tests/e2e/*.spec.ts
// - stubbed:  web + tests/e2e/support/fake-api.ts (no database): tests/e2e/stubbed/*.spec.ts (web plan §2.15)
const WEB_PORT = 3100;
const API_PORT = 4100;
const STUB_WEB_PORT = 3200;
const STUB_API_PORT = 4200;

export default defineConfig({
  testDir: './tests/e2e',
  // Traces and failure artifacts only: Playwright empties this folder on every run, so the review screenshots
  // (test-results/screens) live next to it and survive.
  outputDir: './test-results/artifacts',
  timeout: 30_000,
  retries: 0,
  reporter: 'list',
  projects: [
    {
      name: 'chromium',
      testIgnore: 'stubbed/**',
      use: { ...devices['Desktop Chrome'], baseURL: `http://localhost:${WEB_PORT}` },
    },
    {
      name: 'stubbed',
      testMatch: 'stubbed/**/*.spec.ts',
      use: { ...devices['Desktop Chrome'], baseURL: `http://localhost:${STUB_WEB_PORT}` },
    },
  ],
  webServer: [
    {
      command: 'pnpm --dir ../api start',
      url: `http://localhost:${API_PORT}/health`,
      env: { PORT: String(API_PORT) },
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command: `pnpm start --port ${WEB_PORT}`,
      url: `http://localhost:${WEB_PORT}/api/health`,
      env: { API_URL: `http://localhost:${API_PORT}` },
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command: `node tests/e2e/support/fake-api.ts ${STUB_API_PORT}`,
      url: `http://localhost:${STUB_API_PORT}/health`,
      reuseExistingServer: false,
      timeout: 30_000,
    },
    {
      command: `pnpm start --port ${STUB_WEB_PORT}`,
      url: `http://localhost:${STUB_WEB_PORT}/api/health`,
      env: { API_URL: `http://localhost:${STUB_API_PORT}` },
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
});
