import { readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'))

// Database for the API tests. They drop and recreate its `terria` schema, so it
// must be a scratch database; tests/api refuses names not ending in "_test".
const testDatabaseUrl = process.env.TEST_DATABASE_URL ?? 'postgres://terria:terria@localhost:5432/terria_test'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  define: { __APP_VERSION__: JSON.stringify(version) },
  server: {
    // API server from `npm run dev:api`.
    proxy: {
      '/api': process.env.API_URL ?? 'http://localhost:3000',
      '/config': process.env.API_URL ?? 'http://localhost:3000',
    },
  },
  test: {
    coverage: {
      include: ['src/**', 'server/**', 'scripts/**'],
      exclude: ['**/*.test.*', 'server/test/**', 'src/test/**', 'src/terria/generated/**'],
    },
    projects: [
      {
        // Frontend: pure modules and React components, in a simulated browser.
        extends: true,
        test: {
          name: 'web',
          environment: 'jsdom',
          include: ['src/**/*.test.{ts,tsx}', 'scripts/**/*.test.mjs'],
          setupFiles: ['src/test/setup.ts'],
        },
      },
      {
        // Server modules that don't need a database.
        extends: true,
        test: {
          name: 'server',
          environment: 'node',
          include: ['server/*.test.ts'],
        },
      },
      {
        // The HTTP API against a real PostgreSQL database (TEST_DATABASE_URL).
        extends: true,
        test: {
          name: 'api',
          environment: 'node',
          include: ['server/test/**/*.test.ts'],
          globalSetup: ['server/test/global-setup.ts'],
          // One database, so test files run one at a time.
          fileParallelism: false,
          env: {
            DATABASE_URL: testDatabaseUrl,
            CONFIG_DIR: join(tmpdir(), `tlm-test-config-${process.pid}`),
            NODE_ENV: 'test',
          },
          testTimeout: 20000,
          hookTimeout: 60000,
        },
      },
    ],
  },
})
