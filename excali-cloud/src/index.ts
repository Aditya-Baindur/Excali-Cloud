import { createRemoteJWKSet, importSPKI, jwtVerify } from "jose"

export type Env = {
  DB: D1Database
  BUCKET: R2Bucket
  ALLOW_DEMO_AUTH?: string
  CLERK_ISSUER?: string
  CLERK_AUTHORIZED_PARTIES?: string
  CLERK_JWT_KEY?: string
}

type BoardRow = { id: string; user_id: string; name: string; created_at: number; updated_at: number }
type FolderRow = { id: string; user_id: string; name: string; created_at: number; updated_at: number }
type BoardListRow = BoardRow & { folder_id: string | null; folder_name: string | null }
type ShareRow = { id: string; board_id: string; board_name: string; token: string; created_at: number; revoked_at: number | null }
type VideoRow = { id: string; board_id: string; name: string; mime_type: string; size: number; created_at: number; r2_key: string }
type Scene = { elements: unknown[]; appState: Record<string, unknown>; files: Record<string, unknown> }

const MAX_VIDEO_BYTES = 50 * 1024 * 1024
const MAX_SCENE_BYTES = 20 * 1024 * 1024
const MAX_SCENE_REVISIONS = 50
const VIDEO_TYPES = new Set(["video/mp4", "video/webm", "video/ogg"])
const DEMO_USERS = new Set(["PUBLIC-USER", "demo-user"])
const ALLOWED_ORIGINS = new Set([
  "http://localhost:3000", "http://127.0.0.1:3000",
  "https://draw.adityabaindur.dev", "https://www.collabboard.dev", "https://collabboard.dev",
])

class HttpError extends Error {
  constructor(readonly status: number, message: string, readonly code?: string) { super(message) }
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } })
}

function withCors(req: Request, res: Response) {
  const headers = new Headers(res.headers)
  const origin = req.headers.get("Origin")
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    headers.set("Access-Control-Allow-Origin", origin)
    headers.set("Vary", "Origin")
  }
  headers.set("Access-Control-Allow-Methods", "GET,HEAD,POST,PUT,DELETE,OPTIONS")
  headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-User-Id, X-File-Name, Range")
  headers.set("Access-Control-Expose-Headers", "Content-Range, Accept-Ranges, Content-Length")
  headers.set("X-Content-Type-Options", "nosniff")
  return new Response(res.body, { status: res.status, headers })
}

async function getUserId(req: Request, env: Env): Promise<string | null> {
  const authorization = req.headers.get("Authorization")
  if (authorization) {
    if (!authorization.startsWith("Bearer ") || !env.CLERK_ISSUER) return null
    try {
      // The key URL comes only from trusted configuration, never unverified claims.
      const issuer = env.CLERK_ISSUER.replace(/\/$/, "")
      const key = env.CLERK_JWT_KEY
        ? await importSPKI(env.CLERK_JWT_KEY.replace(/\\n/g, "\n"), "RS256")
        : createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks.json`))
      const { payload } = await jwtVerify(authorization.slice(7), key, {
        algorithms: ["RS256"], issuer, requiredClaims: ["sub", "exp", "iat"], clockTolerance: 5,
      })
      const parties = env.CLERK_AUTHORIZED_PARTIES?.split(",").map((party) => party.trim()).filter(Boolean)
      const permittedParties = parties?.length ? new Set(parties) : ALLOWED_ORIGINS
      if (payload.azp !== undefined && (typeof payload.azp !== "string" || !permittedParties.has(payload.azp))) return null
      if (payload.sts === "pending" || !payload.sub || DEMO_USERS.has(payload.sub)) return null
      return payload.sub
    } catch {
      return null
    }
  }
  const demoId = req.headers.get("X-User-Id")
  return env.ALLOW_DEMO_AUTH === "true" && demoId && DEMO_USERS.has(demoId) ? demoId : null
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

async function readJson(req: Request, maxBytes = MAX_SCENE_BYTES): Promise<Record<string, unknown>> {
  const declaredLength = Number(req.headers.get("Content-Length"))
  if (declaredLength > maxBytes) throw new HttpError(413, "Request is too large")
  if (!req.body) throw new HttpError(400, "Invalid JSON")
  const reader = req.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > maxBytes) {
      await reader.cancel()
      throw new HttpError(413, "Request is too large")
    }
    chunks.push(value)
  }
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
  try {
    const result: unknown = JSON.parse(new TextDecoder().decode(bytes))
    if (!isObject(result)) throw new Error("Invalid object")
    return result
  } catch { throw new HttpError(400, "Invalid JSON") }
}

function boardName(body: Record<string, unknown>) {
  const name = typeof body.name === "string" ? body.name.trim() : ""
  if (!name || name.length > 200) throw new HttpError(400, "Board name must contain 1–200 characters")
  return name
}

function folderName(body: Record<string, unknown>) {
  const name = typeof body.name === "string" ? body.name.trim() : ""
  if (!name || name.length > 200) throw new HttpError(400, "Folder name must contain 1–200 characters")
  return name
}

function requestedFolder(body: Record<string, unknown>): string | null | undefined {
  if (!Object.hasOwn(body, "folderId")) return undefined
  if (body.folderId === null) return null
  if (typeof body.folderId !== "string" || !/^[a-zA-Z0-9_-]{1,200}$/.test(body.folderId)) throw new HttpError(400, "Invalid folder ID")
  return body.folderId
}

function toFolder(row: FolderRow) {
  return { id: row.id, name: row.name, createdAt: row.created_at, updatedAt: row.updated_at }
}

async function ownFolder(env: Env, folderId: string, userId: string) {
  const folder = await env.DB.prepare("SELECT * FROM board_folders WHERE id=? AND user_id=?").bind(folderId, userId).first<FolderRow>()
  if (!folder) throw new HttpError(404, "Folder not found")
  return folder
}

function assignFolder(env: Env, boardId: string, userId: string, folderId: string) {
  // A missing/deleted/foreign folder yields NULL and fails the NOT NULL check,
  // rolling back the batch. Composite foreign keys also enforce both owners.
  return env.DB.prepare(`INSERT INTO board_folder_assignments (board_id,user_id,folder_id)
    VALUES (?, ?, (SELECT id FROM board_folders WHERE id=? AND user_id=?))
    ON CONFLICT(board_id) DO UPDATE SET folder_id=excluded.folder_id`).bind(boardId, userId, folderId, userId)
}

function toShare(row: ShareRow) {
  return { id: row.id, boardId: row.board_id, boardName: row.board_name, token: row.token, createdAt: row.created_at, revokedAt: row.revoked_at }
}

function toVideo(row: VideoRow) {
  return { id: row.id, boardId: row.board_id, name: row.name, mimeType: row.mime_type, size: row.size, createdAt: row.created_at }
}

async function ownBoard(env: Env, boardId: string, userId: string) {
  const board = await env.DB.prepare("SELECT * FROM boards WHERE id=? AND user_id=?").bind(boardId, userId).first<BoardRow>()
  if (!board) throw new HttpError(404, "Board not found")
  return board
}

async function readScene(env: Env, board: BoardRow): Promise<Scene> {
  const scene = await env.DB.prepare("SELECT r2_key FROM board_scenes WHERE board_id=? AND user_id=?").bind(board.id, board.user_id).first<{ r2_key: string }>()
  if (!scene) return { elements: [], appState: { viewBackgroundColor: "#ffffff" }, files: {} }
  const object = await env.BUCKET.get(scene.r2_key)
  if (!object) throw new HttpError(404, "Board scene not found")
  return object.json<Scene>()
}

function revisionPrefix(userId: string, boardId: string) {
  return `users/${userId}/boards/${boardId}/revisions/`
}

async function revisionKeys(env: Env, userId: string, boardId: string) {
  const keys: string[] = []
  let cursor: string | undefined
  do {
    const result = await env.BUCKET.list({ prefix: revisionPrefix(userId, boardId), cursor })
    keys.push(...result.objects.map((object) => object.key))
    cursor = result.truncated ? result.cursor : undefined
  } while (cursor)
  return keys.sort()
}

async function storeScene(env: Env, board: BoardRow, payload: Record<string, unknown>, now: number) {
  const key = `users/${board.user_id}/boards/${board.id}/scene.json`
  const previous = await env.BUCKET.get(key)
  if (previous) {
    const previousBody = await previous.text()
    const previousScene: unknown = JSON.parse(previousBody)
    if (!isObject(previousScene) || !Array.isArray(previousScene.elements)) throw new Error("Invalid stored scene")
    if (previousScene.elements.length && (payload.elements as unknown[]).length === 0) {
      // A destroyed editor can report an empty scene during navigation. Real
      // delete-all edits retain Excalidraw's deleted-element tombstones.
      throw new HttpError(409, "An empty scene was not saved because this board already contains saved content. Reload the board before continuing.", "empty_scene_guard")
    }
    // Archive the exact previous object before replacing it. If archival fails,
    // fail the save instead of risking an unrecoverable overwrite.
    const revisionKey = `${revisionPrefix(board.user_id, board.id)}${String(now).padStart(13, "0")}-${crypto.randomUUID()}.json`
    await env.BUCKET.put(revisionKey, previousBody, {
      httpMetadata: { contentType: "application/json", cacheControl: "private, no-store" },
    })
  }
  const stored = await env.BUCKET.put(key, JSON.stringify({ type: "excalidraw", version: 1, updatedAt: now, boardId: board.id, elements: payload.elements, appState: payload.appState, files: isObject(payload.files) ? payload.files : {} }), {
    httpMetadata: { contentType: "application/json", cacheControl: "private, no-store" },
    // Protect the checked scene if another save wins while this one archives it.
    onlyIf: previous ? { etagMatches: previous.etag } : new Headers({ "If-None-Match": "*" }),
  })
  if (!stored) throw new HttpError(409, "This board changed while it was being saved. Reload it before saving again.", "scene_conflict")
  return key
}

async function pruneSceneRevisions(env: Env, userId: string, boardId: string) {
  const keys = await revisionKeys(env, userId, boardId)
  const expired = keys.slice(0, Math.max(0, keys.length - MAX_SCENE_REVISIONS))
  for (let offset = 0; offset < expired.length; offset += 1000) await env.BUCKET.delete(expired.slice(offset, offset + 1000))
}

async function listVideos(env: Env, boardId: string) {
  const rows = await env.DB.prepare("SELECT * FROM board_videos WHERE board_id=? ORDER BY created_at DESC, id DESC").bind(boardId).all<VideoRow>()
  return rows.results.map(toVideo)
}

async function activePublicBoard(env: Env, token: string) {
  const board = await env.DB.prepare(`SELECT b.* FROM board_shares s JOIN boards b ON b.id=s.board_id AND b.user_id=s.user_id WHERE s.token=? AND s.revoked_at IS NULL`).bind(token).first<BoardRow>()
  if (!board) throw new HttpError(404, "This share is unavailable")
  return board
}

// Multipart keeps upload memory bounded to one 5 MiB part, including requests
// without Content-Length. R2 aborts on every invalid or interrupted upload.
async function storeVideo(req: Request, env: Env, key: string, mimeType: string) {
  if (!req.body) throw new HttpError(400, "Choose a nonempty video")
  if (Number(req.headers.get("Content-Length")) > MAX_VIDEO_BYTES) throw new HttpError(413, "Videos must be 50 MB or smaller")
  const upload = await env.BUCKET.createMultipartUpload(key, { httpMetadata: { contentType: mimeType, cacheControl: "private, no-store" } })
  const reader = req.body.getReader()
  const partSize = 5 * 1024 * 1024
  let buffer = new Uint8Array(partSize)
  let filled = 0
  let size = 0
  const parts: R2UploadedPart[] = []
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > MAX_VIDEO_BYTES) throw new HttpError(413, "Videos must be 50 MB or smaller")
      let position = 0
      while (position < value.byteLength) {
        const count = Math.min(partSize - filled, value.byteLength - position)
        buffer.set(value.subarray(position, position + count), filled)
        position += count
        filled += count
        if (filled === partSize) {
          parts.push(await upload.uploadPart(parts.length + 1, buffer))
          buffer = new Uint8Array(partSize)
          filled = 0
        }
      }
    }
    if (!size) throw new HttpError(400, "Choose a nonempty video")
    if (filled) parts.push(await upload.uploadPart(parts.length + 1, buffer.subarray(0, filled)))
    await upload.complete(parts)
    return size
  } catch (error) {
    await reader.cancel().catch(() => {})
    await upload.abort()
    throw error
  }
}

function parseRange(value: string | null, size: number): { offset: number; length: number } | null {
  if (!value) return null
  const match = /^bytes=(\d*)-(\d*)$/.exec(value)
  if (!match || (!match[1] && !match[2])) throw new HttpError(416, "Invalid byte range")
  const first = Number(match[1])
  const last = Number(match[2])
  if (!Number.isSafeInteger(first) || !Number.isSafeInteger(last)) throw new HttpError(416, "Invalid byte range")
  const start = match[1] ? first : Math.max(0, size - last)
  const end = match[1] && match[2] ? Math.min(last, size - 1) : size - 1
  if (start >= size || end < start || (!match[1] && last === 0)) throw new HttpError(416, "Invalid byte range")
  return { offset: start, length: end - start + 1 }
}

async function videoContent(req: Request, env: Env, boardId: string, videoId: string) {
  const video = await env.DB.prepare("SELECT * FROM board_videos WHERE id=? AND board_id=?").bind(videoId, boardId).first<VideoRow>()
  if (!video) throw new HttpError(404, "Video not found")
  let range: ReturnType<typeof parseRange>
  try { range = parseRange(req.headers.get("Range"), video.size) }
  catch { return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${video.size}`, "Cache-Control": "no-store" } }) }
  const object = await env.BUCKET.get(video.r2_key, range ? { range } : undefined)
  if (!object) throw new HttpError(404, "Video not found")
  const headers = new Headers({
    "Content-Type": video.mime_type,
    "Content-Length": String(range?.length ?? video.size),
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, no-store",
    "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(video.name)}`,
  })
  if (range) headers.set("Content-Range", `bytes ${range.offset}-${range.offset + range.length - 1}/${video.size}`)
  if (req.method === "HEAD") await object.body.cancel()
  return new Response(req.method === "HEAD" ? null : object.body, { status: range ? 206 : 200, headers })
}

async function handleRequest(req: Request, env: Env): Promise<Response> {
  const path = new URL(req.url).pathname.replace(/\/+$/, "") || "/"
  if (path === "/") return json({ ok: true, service: "excali-cloud-api" })

  const publicMatch = /^\/public\/shares\/([^/]+)(?:\/videos\/([^/]+)\/content)?$/.exec(path)
  if (publicMatch && (req.method === "GET" || req.method === "HEAD")) {
    const board = await activePublicBoard(env, publicMatch[1])
    if (publicMatch[2]) return videoContent(req, env, board.id, publicMatch[2])
    if (req.method !== "GET") throw new HttpError(405, "Method not allowed")
    const [scene, videos] = await Promise.all([readScene(env, board), listVideos(env, board.id)])
    return json({ board: { id: board.id, name: board.name, updatedAt: board.updated_at }, scene, videos })
  }

  const userId = await getUserId(req, env)
  if (!userId) throw new HttpError(401, "Unauthorized")

  if (path === "/folders" && req.method === "GET") {
    const folders = await env.DB.prepare("SELECT * FROM board_folders WHERE user_id=? ORDER BY name COLLATE NOCASE, id").bind(userId).all<FolderRow>()
    return json({ folders: folders.results.map(toFolder) })
  }

  if (path === "/folders" && req.method === "POST") {
    const name = folderName(await readJson(req, 4096))
    const id = crypto.randomUUID()
    const now = Date.now()
    await env.DB.prepare("INSERT INTO board_folders (id,user_id,name,created_at,updated_at) VALUES (?,?,?,?,?)").bind(id, userId, name, now, now).run()
    return json({ folder: { id, name, createdAt: now, updatedAt: now } }, 201)
  }

  const folderMatch = /^\/folders\/([^/]+)$/.exec(path)
  if (folderMatch && req.method === "PUT") {
    const name = folderName(await readJson(req, 4096))
    const folder = await env.DB.prepare("UPDATE board_folders SET name=?,updated_at=? WHERE id=? AND user_id=? RETURNING *").bind(name, Date.now(), folderMatch[1], userId).first<FolderRow>()
    if (!folder) throw new HttpError(404, "Folder not found")
    return json({ folder: toFolder(folder) })
  }
  if (folderMatch && req.method === "DELETE") {
    // Cascades remove assignments only, leaving board contents and shares intact.
    const result = await env.DB.prepare("DELETE FROM board_folders WHERE id=? AND user_id=?").bind(folderMatch[1], userId).run()
    if (!result.meta.changes) throw new HttpError(404, "Folder not found")
    return json({ ok: true })
  }

  if (path === "/boards" && req.method === "GET") {
    const [boards, shares] = await Promise.all([
      env.DB.prepare(`SELECT b.*, f.id AS folder_id, f.name AS folder_name FROM boards b
        LEFT JOIN board_folder_assignments a ON a.board_id=b.id AND a.user_id=b.user_id
        LEFT JOIN board_folders f ON f.id=a.folder_id AND f.user_id=b.user_id
        WHERE b.user_id=? ORDER BY b.updated_at DESC`).bind(userId).all<BoardListRow>(),
      env.DB.prepare(`SELECT s.*, b.name AS board_name FROM board_shares s JOIN boards b ON b.id=s.board_id WHERE s.user_id=? AND s.revoked_at IS NULL`).bind(userId).all<ShareRow>(),
    ])
    const active = new Map(shares.results.map((share) => [share.board_id, toShare(share)]))
    return json({ ok: true, boards: boards.results.map((board) => ({ id: board.id, name: board.name, createdAt: board.created_at, updatedAt: board.updated_at, folderId: board.folder_id, folderName: board.folder_name, share: active.get(board.id) ?? null })) })
  }

  if (path === "/boards" && req.method === "POST") {
    const body = await readJson(req, 4096)
    const name = boardName(body)
    const folderId = requestedFolder(body)
    if (folderId) await ownFolder(env, folderId, userId)
    const boardId = crypto.randomUUID()
    const now = Date.now()
    const key = `users/${userId}/boards/${boardId}/scene.json`
    await env.BUCKET.put(key, JSON.stringify({ elements: [], appState: { viewBackgroundColor: "#ffffff" }, files: {} }), { httpMetadata: { contentType: "application/json" } })
    try {
      await env.DB.batch([
        env.DB.prepare("INSERT INTO boards (id,user_id,name,created_at,updated_at) VALUES (?,?,?,?,?)").bind(boardId, userId, name, now, now),
        env.DB.prepare("INSERT INTO board_scenes (board_id,user_id,r2_key,created_at,updated_at) VALUES (?,?,?,?,?)").bind(boardId, userId, key, now, now),
        ...(folderId ? [assignFolder(env, boardId, userId, folderId)] : []),
      ])
    } catch (error) {
      await env.BUCKET.delete(key)
      if (folderId) await ownFolder(env, folderId, userId)
      throw error
    }
    return json({ ok: true, boardId }, 201)
  }

  if (path === "/shares" && req.method === "GET") {
    const shares = await env.DB.prepare(`SELECT s.*, b.name AS board_name FROM board_shares s JOIN boards b ON b.id=s.board_id AND b.user_id=s.user_id WHERE s.user_id=? ORDER BY s.created_at DESC`).bind(userId).all<ShareRow>()
    return json({ shares: shares.results.map(toShare) })
  }

  const shareMatch = /^\/shares\/([^/]+)$/.exec(path)
  if (shareMatch && req.method === "DELETE") {
    const result = await env.DB.prepare("UPDATE board_shares SET revoked_at=COALESCE(revoked_at, ?) WHERE id=? AND user_id=?").bind(Date.now(), shareMatch[1], userId).run()
    if (!result.meta.changes) throw new HttpError(404, "Share not found")
    return json({ ok: true })
  }

  const boardMatch = /^\/boards\/([^/]+)(?:\/(scene|share|videos)(?:\/([^/]+)(?:\/(content))?)?)?$/.exec(path)
  if (!boardMatch) throw new HttpError(404, "Not found")
  const [, boardId, resource, videoId, content] = boardMatch
  const board = await ownBoard(env, boardId, userId)

  if (!resource && req.method === "PUT") {
    const body = await readJson(req, 4096)
    const hasName = Object.hasOwn(body, "name")
    const name = hasName ? boardName(body) : undefined
    const folderId = requestedFolder(body)
    if (!hasName && folderId === undefined) throw new HttpError(400, "Provide a board name or folder ID")
    if (folderId) await ownFolder(env, folderId, userId)
    const statements = [hasName
      ? env.DB.prepare("UPDATE boards SET name=?,updated_at=? WHERE id=? AND user_id=?").bind(name!, Date.now(), boardId, userId)
      : env.DB.prepare("UPDATE boards SET updated_at=? WHERE id=? AND user_id=?").bind(Date.now(), boardId, userId)]
    if (folderId) statements.push(assignFolder(env, boardId, userId, folderId))
    else if (folderId === null) statements.push(env.DB.prepare("DELETE FROM board_folder_assignments WHERE board_id=? AND user_id=?").bind(boardId, userId))
    try { await env.DB.batch(statements) }
    catch (error) {
      await ownBoard(env, boardId, userId)
      if (folderId) await ownFolder(env, folderId, userId)
      throw error
    }
    return json({ ok: true })
  }

  if (!resource && req.method === "DELETE") {
    const scene = await env.DB.prepare("SELECT r2_key FROM board_scenes WHERE board_id=?").bind(boardId).first<{ r2_key: string }>()
    const videos = await env.DB.prepare("SELECT r2_key FROM board_videos WHERE board_id=?").bind(boardId).all<{ r2_key: string }>()
    // Hide shares before cleanup so failed or slow deletions never leave public access.
    await env.DB.prepare("UPDATE board_shares SET revoked_at=COALESCE(revoked_at, ?) WHERE board_id=? AND user_id=?").bind(Date.now(), boardId, userId).run()
    const keys = [...videos.results.map((video) => video.r2_key), ...(scene ? [scene.r2_key] : []), ...await revisionKeys(env, userId, boardId)]
    for (let offset = 0; offset < keys.length; offset += 1000) await env.BUCKET.delete(keys.slice(offset, offset + 1000))
    await env.DB.batch([
      env.DB.prepare("DELETE FROM board_videos WHERE board_id=?").bind(boardId),
      env.DB.prepare("DELETE FROM board_shares WHERE board_id=?").bind(boardId),
      env.DB.prepare("DELETE FROM board_scenes WHERE board_id=?").bind(boardId),
      env.DB.prepare("DELETE FROM boards WHERE id=? AND user_id=?").bind(boardId, userId),
    ])
    return json({ ok: true })
  }

  if (resource === "scene" && !videoId && req.method === "GET") return json(await readScene(env, board))

  if (resource === "scene" && !videoId && req.method === "PUT") {
    const payload = await readJson(req)
    if (!Array.isArray(payload.elements) || !isObject(payload.appState)) throw new HttpError(400, "elements must be an array and appState an object")
    const now = Date.now()
    const key = await storeScene(env, board, payload, now)
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO board_scenes (board_id,user_id,r2_key,created_at,updated_at) VALUES (?,?,?,?,?) ON CONFLICT(board_id) DO UPDATE SET updated_at=excluded.updated_at,r2_key=excluded.r2_key`).bind(boardId, userId, key, now, now),
      env.DB.prepare("UPDATE boards SET updated_at=? WHERE id=? AND user_id=?").bind(now, boardId, userId),
    ])
    // Retention failure must not report a successfully persisted scene as failed.
    await pruneSceneRevisions(env, userId, boardId).catch(() => console.warn(JSON.stringify({ event: "scene_revision_prune_failed" })))
    return json({ ok: true })
  }

  if (resource === "share" && !videoId && req.method === "POST") {
    const token = Array.from(crypto.getRandomValues(new Uint8Array(32)), (byte) => byte.toString(16).padStart(2, "0")).join("")
    // The partial unique index makes repeated/concurrent clicks idempotent.
    await env.DB.prepare("INSERT OR IGNORE INTO board_shares (id,board_id,user_id,token,created_at,revoked_at) VALUES (?,?,?,?,?,NULL)").bind(crypto.randomUUID(), boardId, userId, token, Date.now()).run()
    const share = await env.DB.prepare("SELECT *, ? AS board_name FROM board_shares WHERE board_id=? AND user_id=? AND revoked_at IS NULL").bind(board.name, boardId, userId).first<ShareRow>()
    if (!share) throw new Error("Share creation failed")
    return json({ share: toShare(share) })
  }

  if (resource === "videos" && !videoId && req.method === "GET") return json({ videos: await listVideos(env, boardId) })

  if (resource === "videos" && !videoId && req.method === "POST") {
    const mimeType = (req.headers.get("Content-Type") ?? "").split(";")[0].trim().toLowerCase()
    if (!VIDEO_TYPES.has(mimeType)) throw new HttpError(415, "Choose an MP4, WebM, or Ogg video")
    let name = ""
    try { name = decodeURIComponent(req.headers.get("X-File-Name") ?? "").trim() } catch { throw new HttpError(400, "Invalid filename") }
    if (!name || name.length > 255 || /[\u0000-\u001f\u007f]/.test(name)) throw new HttpError(400, "Video filename must contain 1–255 characters")
    const id = crypto.randomUUID()
    const key = `users/${userId}/boards/${boardId}/videos/${id}`
    const size = await storeVideo(req, env, key, mimeType)
    const now = Date.now()
    try {
      await env.DB.batch([
        env.DB.prepare("INSERT INTO board_videos (id,board_id,user_id,name,mime_type,size,r2_key,created_at) VALUES (?,?,?,?,?,?,?,?)").bind(id, boardId, userId, name, mimeType, size, key, now),
        env.DB.prepare("UPDATE boards SET updated_at=? WHERE id=? AND user_id=?").bind(now, boardId, userId),
      ])
    } catch (error) { await env.BUCKET.delete(key); throw error }
    return json({ video: { id, boardId, name, mimeType, size, createdAt: now } }, 201)
  }

  if (resource === "videos" && videoId && content && (req.method === "GET" || req.method === "HEAD")) return videoContent(req, env, boardId, videoId)

  if (resource === "videos" && videoId && !content && req.method === "DELETE") {
    const video = await env.DB.prepare("SELECT * FROM board_videos WHERE id=? AND board_id=? AND user_id=?").bind(videoId, boardId, userId).first<VideoRow>()
    if (!video) throw new HttpError(404, "Video not found")
    await env.BUCKET.delete(video.r2_key)
    await env.DB.batch([
      env.DB.prepare("DELETE FROM board_videos WHERE id=? AND board_id=? AND user_id=?").bind(videoId, boardId, userId),
      env.DB.prepare("UPDATE boards SET updated_at=? WHERE id=? AND user_id=?").bind(Date.now(), boardId, userId),
    ])
    return json({ ok: true })
  }
  throw new HttpError(404, "Not found")
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    if (req.method === "OPTIONS") return withCors(req, new Response(null, { status: 204 }))
    try { return withCors(req, await handleRequest(req, env)) }
    catch (error) {
      if (error instanceof HttpError) return withCors(req, json({ ok: false, error: error.message, ...(error.code ? { code: error.code } : {}) }, error.status))
      // Never include scene contents, share tokens, or authentication headers in logs.
      console.error(JSON.stringify({ event: "request_failed", error: error instanceof Error ? error.name : "UnknownError" }))
      return withCors(req, json({ ok: false, error: "Internal error" }, 500))
    }
  },
} satisfies ExportedHandler<Env>
