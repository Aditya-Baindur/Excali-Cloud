import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import vinext from 'vinext'
import { cloudflare } from '@cloudflare/vite-plugin'

const local = (path: string) => fileURLToPath(new URL(path, import.meta.url))

// vinext also derives NEXT_PUBLIC_* replacements from process.env. Set these
// before its config hook so a developer's .env.local cannot redirect a clone.
process.env.NEXT_PUBLIC_API_BASE = '/api/worker'
process.env.NEXT_PUBLIC_USE_ANALYTICS = 'false'

export default defineConfig({
  environments: {
    rsc: { build: { minify: true } },
    ssr: { build: { minify: true } },
  },
  // A cloned deployment must never inherit a developer's remote API URL.
  define: {
    'process.env.NEXT_PUBLIC_API_BASE': JSON.stringify('/api/worker'),
    'process.env.NEXT_PUBLIC_USE_ANALYTICS': JSON.stringify('false'),
  },
  resolve: {
    alias: [
      { find: '@/lib/backend-fetch', replacement: local('./cloudflare/backend-fetch.ts') },
      { find: '@/lib/clerk-config', replacement: local('./cloudflare/clerk-config.ts') },
    ],
  },
  plugins: [
    vinext({ react: { compiler: true } }),
    cloudflare({
      configPath: '../wrangler.jsonc',
      viteEnvironment: { name: 'rsc', childEnvironments: ['ssr'] },
    }),
  ],
})
