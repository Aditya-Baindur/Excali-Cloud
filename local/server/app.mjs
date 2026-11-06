import { createServer } from 'node:http'
import { createHmac, timingSafeEqual, randomUUID } from 'node:crypto'
import { readFileSync, existsSync } from 'node:fs'
import { extname, resolve, sep } from 'node:path'
import { networkInterfaces, hostname } from 'node:os'
import { WebSocketServer, WebSocket } from 'ws'
import { BoardStore, WorkspaceError, validId } from './store.mjs'

const LIMIT = 25_000_000
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.png': 'image/png', '.json': 'application/json' }
const equal = (a, b) => typeof a === 'string' && typeof b === 'string' && Buffer.byteLength(a) === Buffer.byteLength(b) && timingSafeEqual(Buffer.from(a), Buffer.from(b))
const loopback = value => ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(value)

export function createWorkspaceServer({ directory, ownerKey, host = '127.0.0.1', port = 4318, staticDirectory, frontend }) {
  if (typeof ownerKey !== 'string' || ownerKey.length < 24) throw new Error('Owner key must be at least 24 characters')
  const store = new BoardStore({ directory })
  const wss = new WebSocketServer({ noServer: true, maxPayload: 1024 })
  const sign = value => createHmac('sha256', ownerKey).update(value).digest('base64url')
  const inviteToken = boardId => sign(`invite:${validId(boardId)}`)
  const cookieName = () => `excali_session_${server.address()?.port ?? port}`
  const allowedHosts = new Set(['localhost', '127.0.0.1', '[::1]', host, hostname().toLowerCase()])
  // URL.hostname keeps IPv6 brackets, so store IPv6 addresses the same way.
  for (const values of Object.values(networkInterfaces())) for (const address of values ?? [])
    allowedHosts.add(address.family === 'IPv6' || address.family === 6 ? `[${address.address}]` : address.address)

  function checkRequest(req) {
    let url
    try { url = new URL(`http://${req.headers.host}`) } catch { throw new WorkspaceError('Invalid Host', 403) }
    if (!allowedHosts.has(url.hostname.toLowerCase()) || Number(url.port || 80) !== server.address()?.port)
      throw new WorkspaceError('Host is not allowed', 403)
    const origin = req.headers.origin
    if (origin && origin !== url.origin) throw new WorkspaceError('Origin is not allowed', 403)
    if (req.headers['sec-fetch-site'] === 'cross-site') throw new WorkspaceError('Cross-site requests are not allowed', 403)
    return url
  }
  function auth(req) {
    const bearer = req.headers.authorization?.replace(/^Bearer /, '')
    if (equal(bearer, ownerKey)) return { role: 'owner', voterId: 'mcp' }
    const cookie = req.headers.cookie?.split(';').map(v => v.trim()).find(v => v.startsWith(`${cookieName()}=`))?.slice(cookieName().length + 1)
    if (cookie) {
      const [value, signature] = cookie.split('.')
      if (equal(sign(value), signature)) {
        try {
          const session = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'))
          if (session.expires > Date.now() && ['owner', 'guest'].includes(session.role)) return session
        } catch { /* invalid cookie is unauthenticated */ }
      }
    }
    throw new WorkspaceError('Open the local app or use a valid board invitation to sign in', 401)
  }
  function authorize(req, boardId) {
    const session = auth(req)
    if (session.role !== 'owner' && session.boardId !== boardId) throw new WorkspaceError('This invitation only opens its own board', 403)
    return session
  }
  function owner(req) {
    const session = auth(req)
    if (session.role !== 'owner') throw new WorkspaceError('Only the workspace owner can do that', 403)
    return session
  }
  function setSession(res, role, boardId) {
    const session = { role, ...(boardId ? { boardId } : {}), voterId: randomUUID(), expires: Date.now() + 30 * 86400000 }
    const value = Buffer.from(JSON.stringify(session)).toString('base64url')
    res.setHeader('Set-Cookie', `${cookieName()}=${value}.${sign(value)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=2592000`)
    return session
  }
  async function body(req) {
    let size = 0; const chunks = []
    for await (const chunk of req) {
      size += chunk.length
      if (size > LIMIT) throw new WorkspaceError('Request exceeds 25 MB', 413)
      chunks.push(chunk)
    }
    try { return JSON.parse(Buffer.concat(chunks).toString('utf8')) }
    catch { throw new WorkspaceError('Invalid JSON') }
  }
  function json(res, data, status = 200) {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
    res.end(JSON.stringify(data))
  }
  // Images are sent once per socket; later updates carry only files that socket hasn't received.
  function boardMessage(board, socket) {
    const files = Object.fromEntries(Object.entries(board.files).filter(([fileId]) => !socket.sentFiles.has(fileId)))
    for (const fileId of Object.keys(files)) socket.sentFiles.add(fileId)
    return JSON.stringify({ type: 'board', board: { ...board, files } })
  }
  function broadcast(id) {
    const board = store.read(id)
    for (const socket of wss.clients) if (socket.boardId === id && socket.readyState === WebSocket.OPEN) {
      if (socket.bufferedAmount > LIMIT * 2) socket.close(1013, 'Reconnect to receive the latest board')
      else socket.send(boardMessage(board, socket))
    }
  }
  const withoutFiles = board => ({ ...board, files: {} })
  store.on('change', broadcast)
  const server = createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.setHeader('Referrer-Policy', 'no-referrer')
    res.setHeader('Content-Security-Policy', "frame-ancestors 'self'; object-src 'none'; base-uri 'self'")
    try {
      const requestUrl = checkRequest(req)
      const path = new URL(req.url, requestUrl).pathname
      if (path === '/api/session') {
        if (req.method === 'GET') {
          try { return json(res, auth(req)) }
          catch (error) {
            // Only an actual loopback browser may bootstrap the owner session.
            if (loopback(req.socket.remoteAddress) && ['localhost', '127.0.0.1', '[::1]'].includes(requestUrl.hostname))
              return json(res, setSession(res, 'owner'))
            throw error
          }
        }
        if (req.method === 'POST') {
          const data = await body(req)
          if (equal(data.key, ownerKey)) return json(res, setSession(res, 'owner'))
          if (data.boardId && equal(data.key, inviteToken(data.boardId))) {
            store.read(data.boardId)
            return json(res, setSession(res, 'guest', data.boardId))
          }
          throw new WorkspaceError('Invitation is invalid', 401)
        }
      }
      if (path === '/api/boards') {
        owner(req)
        if (req.method === 'GET') return json(res, { boards: store.list() })
        if (req.method === 'POST') return json(res, store.create(await body(req)), 201)
      }
      if (path === '/api/import' && req.method === 'POST') {
        owner(req)
        return json(res, store.import(await body(req)), 201)
      }
      const match = /^\/api\/boards\/([^/]+)(?:\/(patch|invite|vote|backup))?$/.exec(path)
      if (match) {
        const [, id, operation] = match; validId(id)
        const session = authorize(req, id)
        if (!operation && req.method === 'GET') return json(res, store.read(id))
        if (operation === 'patch' && req.method === 'POST') return json(res, withoutFiles(store.patch(id, await body(req))))
        if (operation === 'invite' && req.method === 'POST') { owner(req); store.read(id); return json(res, { token: inviteToken(id) }) }
        if (operation === 'vote' && req.method === 'POST') return json(res, withoutFiles(store.vote(id, session.voterId, (await body(req)).elementId)))
        if (operation === 'backup' && req.method === 'GET') {
          res.setHeader('Content-Disposition', 'attachment; filename="workspace-backup.json"')
          return json(res, { format: 'excali-cloud-local', version: 1, board: store.read(id) })
        }
      }
      if (path.startsWith('/api/') || path.startsWith('/live/')) throw new WorkspaceError('Not found', 404)
      if (frontend) return frontend(req, res)
      if (!staticDirectory) throw new WorkspaceError('Build the local app first with npm run build', 503)
      let decoded
      try { decoded = decodeURIComponent(path) } catch { throw new WorkspaceError('Not found', 404) }
      const file = resolve(staticDirectory, `.${decoded}`)
      if (!file.startsWith(resolve(staticDirectory) + sep) && file !== resolve(staticDirectory)) throw new WorkspaceError('Not found', 404)
      const target = extname(path) && existsSync(file) ? file : resolve(staticDirectory, 'index.html')
      if (req.method !== 'GET' && req.method !== 'HEAD') throw new WorkspaceError('Method not allowed', 405)
      const contents = readFileSync(target)
      res.writeHead(200, { 'Content-Type': mime[extname(target)] ?? 'application/octet-stream', 'Cache-Control': 'no-cache' })
      res.end(req.method === 'HEAD' ? undefined : contents)
    } catch (error) {
      if (!res.headersSent) json(res, { error: error instanceof WorkspaceError ? error.message : 'Could not save or load the workspace. Check disk space and restart.' }, error.status ?? 500)
      else res.end()
    }
  })
  server.on('upgrade', (req, socket, head) => {
    try {
      checkRequest(req)
      const match = /^\/live\/([a-zA-Z0-9_-]+)$/.exec(new URL(req.url, 'http://local').pathname)
      if (!match) throw new WorkspaceError('Not found', 404)
      const id = validId(match[1]); authorize(req, id); const board = store.read(id)
      wss.handleUpgrade(req, socket, head, ws => {
        ws.boardId = id; ws.alive = true; ws.sentFiles = new Set()
        ws.on('pong', () => { ws.alive = true })
        ws.on('error', () => {})
        ws.send(boardMessage(board, ws))
      })
    } catch { socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n') }
  })
  const heartbeat = setInterval(() => {
    for (const socket of wss.clients) {
      if (!socket.alive) socket.terminate()
      else { socket.alive = false; socket.ping() }
    }
  }, 20000)
  heartbeat.unref()
  return {
    server, store,
    setFrontend(handler) { frontend = handler },
    listen: () => new Promise((resolve, reject) => {
      server.once('error', reject)
      server.listen(port, host, () => resolve(`http://${host === '0.0.0.0' ? '127.0.0.1' : host}:${server.address().port}`))
    }),
    close: () => new Promise(resolve => {
      clearInterval(heartbeat)
      for (const socket of wss.clients) socket.terminate()
      wss.close()
      server.closeAllConnections()
      server.close(() => resolve())
    }),
  }
}
