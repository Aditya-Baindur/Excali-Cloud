import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

export const localRoot = fileURLToPath(new URL('../', import.meta.url))
export function loadLocalConfig() {
  const path = resolve(localRoot, '.env')
  if (!existsSync(path)) writeFileSync(path, `WORKSPACE_OWNER_KEY=${randomBytes(32).toString('hex')}\nWORKSPACE_PORT=4318\nWORKSPACE_HOST=127.0.0.1\n`, { encoding: 'utf8', mode: 0o600, flag: 'wx' })
  const env = Object.fromEntries(readFileSync(path, 'utf8').split(/\r?\n/).filter(line => line && !line.startsWith('#')).map(line => {
    const index = line.indexOf('='); return [line.slice(0, index), line.slice(index + 1).trim()]
  }))
  const port = Number(process.env.WORKSPACE_PORT ?? env.WORKSPACE_PORT ?? 4318)
  const host = process.env.WORKSPACE_HOST ?? env.WORKSPACE_HOST ?? '127.0.0.1'
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('WORKSPACE_PORT must be between 1024 and 65535')
  if (!['127.0.0.1', '0.0.0.0'].includes(host)) throw new Error('WORKSPACE_HOST must be 127.0.0.1 or 0.0.0.0')
  return { ownerKey: env.WORKSPACE_OWNER_KEY, host, port, directory: resolve(localRoot, 'data'), baseUrl: `http://127.0.0.1:${port}` }
}
