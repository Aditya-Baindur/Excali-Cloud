import { existsSync, mkdirSync, openSync, closeSync, unlinkSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { spawn } from 'node:child_process'
import { loadLocalConfig, localRoot } from './config.mjs'
import { createWorkspaceServer } from './app.mjs'

const config = loadLocalConfig()
function openBrowser(url) {
  if (process.platform !== 'win32') return
  const browser = spawn('rundll32.exe', ['url.dll,FileProtocolHandler', url], { detached: true, stdio: 'ignore', windowsHide: true })
  browser.on('error', () => console.log(`Open ${url} in your browser.`)); browser.unref()
}
mkdirSync(config.directory, { recursive: true })
const lock = resolve(config.directory, '.server.lock')
if (existsSync(lock)) {
  // Ask the workspace itself: Windows reuses process IDs, so a live PID can belong to another program.
  let alive = false
  try { await fetch(`${config.baseUrl}/api/session`, { signal: AbortSignal.timeout(1500) }); alive = true } catch { /* nothing is listening */ }
  if (alive) {
    if (process.argv.includes('--open')) { openBrowser(config.baseUrl); process.exit(0) }
    throw new Error('This workspace already has a running server. Open its existing URL instead.')
  }
  unlinkSync(lock)
}
const fd = openSync(lock, 'wx'); writeFileSync(fd, String(process.pid)); closeSync(fd)
const app = createWorkspaceServer({ ...config, staticDirectory: resolve(localRoot, 'dist') })
let vite
async function close() {
  await app.close(); await vite?.close()
  try { unlinkSync(lock) } catch { /* lock already removed */ }
}
try {
  if (process.argv.includes('--dev')) {
    const { createServer } = await import('vite')
    vite = await createServer({ configFile: resolve(localRoot, 'vite.config.mjs'), server: { middlewareMode: true, hmr: { server: app.server } } })
    app.setFrontend(vite.middlewares)
  } else if (!existsSync(resolve(localRoot, 'dist/index.html'))) throw new Error('Run npm run build in local/ before starting the app.')
  const url = await app.listen()
  console.log(`Night Crew workspace: ${url}\nBoards are saved in local/data. Keep this process running during shared sessions.`)
  if (process.argv.includes('--open')) openBrowser(url)
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, async () => { await close(); process.exit(0) })
} catch (error) { await close(); throw error }
