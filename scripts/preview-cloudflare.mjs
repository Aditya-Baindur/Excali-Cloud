import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const config = `${root}/frontend/dist/server/wrangler.json`
if (!existsSync(config) || !existsSync(`${root}/.dev.vars`)) {
  console.error('Run npm run build and configure the root .dev.vars file first (see README.md).')
  process.exit(1)
}
const child = spawn(process.execPath, [
  `${root}/frontend/node_modules/wrangler/bin/wrangler.js`,
  'dev', '--config', config, '--local', '--port', '3000',
  '--env-file', `${root}/.dev.vars`, '--persist-to', `${root}/.wrangler/state`,
], { cwd: root, stdio: 'inherit' })
child.on('error', (error) => { console.error(error.message); process.exitCode = 1 })
child.on('exit', (code) => { process.exitCode = code ?? 1 })
