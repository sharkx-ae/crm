import { defineConfig } from 'vitest/config';

// Pure and api-shaped tests run in node. A component test opts into jsdom with `// @vitest-environment jsdom`
// on its first line and renders through src/test/render.tsx.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
