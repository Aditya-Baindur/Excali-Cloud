import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtempSync, mkdirSync, copyFileSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

function deployment(t, { args = [], fail, configured = true } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'excali-deploy-test-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  for (const directory of ['scripts', 'frontend/dist/server', 'frontend/node_modules/wrangler/bin']) {
    mkdirSync(join(root, directory), { recursive: true })
  }
  copyFileSync(new URL('../scripts/deploy-cloudflare.mjs', import.meta.url), join(root, 'scripts/deploy-cloudflare.mjs'))
  writeFileSync(join(root, 'frontend/dist/server/wrangler.json'), JSON.stringify({
    vars: { NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: configured ? 'pk_test_ZXhhbXBsZS5jbGVyay5hY2NvdW50cy5kZXYk' : '' },
    d1_databases: [{ binding: 'DB', database_name: 'a-renamed-database', database_id: '11111111-1111-1111-1111-111111111111' }],
  }))
  const log = join(root, 'calls.jsonl')
  writeFileSync(log, '')
  writeFileSync(join(root, 'frontend/node_modules/wrangler/bin/wrangler.js'), `
    const fs = require('node:fs');
    const args = process.argv.slice(2);
    fs.appendFileSync(process.env.DEPLOY_TEST_LOG, JSON.stringify(args) + '\\n');
    if ((process.env.DEPLOY_TEST_FAIL === 'check' && args.includes('--dry-run')) ||
        (process.env.DEPLOY_TEST_FAIL === 'migration' && args[0] === 'd1')) process.exit(1);
  `)
  const result = spawnSync(process.execPath, [join(root, 'scripts/deploy-cloudflare.mjs'), ...args], {
    encoding: 'utf8', env: { ...process.env, DEPLOY_TEST_LOG: log, DEPLOY_TEST_FAIL: fail ?? '' },
  })
  return { result, calls: readFileSync(log, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse) }
}

test('deploy checks the built Worker, migrates the DB binding, then publishes', (t) => {
  const { result, calls } = deployment(t)
  assert.equal(result.status, 0, result.stderr)
  assert.equal(calls.length, 3)
  assert.ok(calls[0].includes('--dry-run'))
  assert.deepEqual(calls[1].slice(0, 5), ['d1', 'migrations', 'apply', 'DB', '--remote'])
  assert.equal(calls[2][0], 'deploy')
  assert.ok(!calls[2].includes('--dry-run'))
  assert.equal(calls[0][2], calls[2][2])
})

test('dry-run never changes remote resources and needs no Clerk keys', (t) => {
  const { result, calls } = deployment(t, { args: ['--dry-run'], configured: false })
  assert.equal(result.status, 0, result.stderr)
  assert.equal(calls.length, 1)
  assert.ok(calls[0].includes('--dry-run'))
})

test('a failed bundle check prevents migrations and deployment', (t) => {
  const { result, calls } = deployment(t, { fail: 'check' })
  assert.equal(result.status, 1)
  assert.equal(calls.length, 1)
})

test('a failed migration prevents deployment', (t) => {
  const { result, calls } = deployment(t, { fail: 'migration' })
  assert.equal(result.status, 1)
  assert.equal(calls.length, 2)
})

test('missing setup values fail before any remote commands', (t) => {
  const { result, calls } = deployment(t, { configured: false })
  assert.equal(result.status, 1)
  assert.match(result.stderr, /NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY/)
  assert.equal(calls.length, 0)
})

test('unsupported flags cannot silently select a different deployment target', (t) => {
  const { result, calls } = deployment(t, { args: ['--env', 'unexpected'] })
  assert.equal(result.status, 1)
  assert.equal(calls.length, 0)
})
