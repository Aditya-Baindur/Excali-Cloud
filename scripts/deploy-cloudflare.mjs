import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const frontend = fileURLToPath(new URL('../frontend', import.meta.url))
const builtConfig = `${frontend}/dist/server/wrangler.json`
const wrangler = fileURLToPath(new URL('../frontend/node_modules/wrangler/bin/wrangler.js', import.meta.url))
const args = process.argv.slice(2)
if (args.some((arg) => arg !== '--dry-run')) {
  console.error('Usage: npm run deploy [-- --dry-run]')
  process.exit(1)
}
if (!existsSync(builtConfig)) {
  console.error('Build the app first with npm run build, then run npm run deploy.')
  process.exit(1)
}
if (!args.includes('--dry-run')) {
  const config = JSON.parse(readFileSync(builtConfig, 'utf8'))
  if (!/^pk_(test|live)_[A-Za-z0-9+/=_-]+$/.test(config.vars?.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? '')) {
    console.error('Set NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY in the Cloudflare setup, then rebuild before deploying.')
    process.exit(1)
  }
  const database = config.d1_databases?.find((binding) => binding.binding === 'DB')
  if (!database?.database_id || database.database_id === '00000000-0000-0000-0000-000000000000') {
    console.error('Use the Deploy to Cloudflare button to provision DB and BUCKET before deploying this template.')
    process.exit(1)
  }
}

function run(args) {
  const result = spawnSync(process.execPath, [wrangler, ...args], {
    cwd: frontend,
    stdio: ['ignore', 'inherit', 'inherit'],
  })
  if (result.error) throw result.error
  if (result.status !== 0) process.exit(result.status ?? 1)
}

// Cloudflare's button provisions DB and BUCKET and writes their IDs into the
// source config before building. Use the binding so renamed databases work.
// Always check the built Worker before touching the remote database.
run(['deploy', '--config', builtConfig, '--dry-run'])
if (!args.includes('--dry-run')) {
  run(['d1', 'migrations', 'apply', 'DB', '--remote', '--config', `${root}/wrangler.jsonc`])
  run(['deploy', '--config', builtConfig])
}
