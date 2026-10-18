import { readFileSync } from 'node:fs';
import { defineWorkersConfig } from '@cloudflare/vitest-pool-workers/config';

// Deliberately do not load the deployment config: these bindings are always local.
export default defineWorkersConfig({
  test: {
    testTimeout: 30_000,
    poolOptions: {
      workers: {
        main: './src/index.ts',
        miniflare: {
          compatibilityDate: '2025-09-27',
          d1Databases: ['DB'],
          r2Buckets: ['BUCKET'],
          bindings: {
            ALLOW_DEMO_AUTH: 'false',
            TEST_SCHEMA: ['0001_schema.sql', '0002_shares_and_videos.sql', '0003_board_folders.sql'].map((file) => readFileSync(new URL(`./migrations/${file}`, import.meta.url), 'utf8')).join('\n'),
          },
        },
      },
    },
  },
});
