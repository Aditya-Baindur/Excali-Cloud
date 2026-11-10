import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './test/browser', workers: 1, timeout: 45000,
  use: { channel: 'chrome', headless: true, viewport: { width: 1440, height: 1000 } },
})
