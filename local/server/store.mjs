import { EventEmitter } from 'node:events'
import { mkdirSync, readFileSync, readdirSync, openSync, writeFileSync, fsyncSync, closeSync, renameSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { brainwritingElements, mergeElements } from '../shared/scene.mjs'

export class WorkspaceError extends Error {
  constructor(message, status = 400) { super(message); this.status = status }
}
const fail = message => { throw new WorkspaceError(message) }
export function validId(id) {
  if (typeof id !== 'string' || !/^[a-zA-Z0-9_-]{1,120}$/.test(id)) fail('Invalid ID')
  return id
}
function text(value, max, name) {
  if (typeof value !== 'string' || value.length > max) fail(`Invalid ${name}`)
  return value
}
const types = new Set(['rectangle', 'diamond', 'ellipse', 'text', 'arrow', 'line', 'freedraw', 'image', 'frame', 'magicframe', 'embeddable', 'iframe'])
function validateElements(elements) {
  if (!Array.isArray(elements) || elements.length > 10000) fail('Invalid elements')
  const ids = new Set()
  for (const e of elements) {
    if (!e || typeof e !== 'object') fail('Invalid element')
    validId(e.id)
    if (ids.has(e.id)) fail('Invalid duplicate element ID')
    ids.add(e.id)
    if (!types.has(e.type) || !['x', 'y', 'width', 'height', 'angle'].every(k => Number.isFinite(e[k]) && Math.abs(e[k]) <= 1e8) ||
      !Number.isSafeInteger(e.version) || e.version < 1 || !Number.isSafeInteger(e.versionNonce) || e.versionNonce < 0 ||
      typeof e.isDeleted !== 'boolean') fail('Invalid element geometry or version')
    if (e.type === 'text') text(e.text, 30000, 'element text')
  }
}
function validateFiles(files) {
  if (!files || Array.isArray(files) || typeof files !== 'object' || Object.keys(files).length > 200) fail('Invalid files')
  for (const [id, file] of Object.entries(files)) {
    validId(id)
    if (!file || typeof file !== 'object' || typeof file.dataURL !== 'string' ||
      !/^data:image\/(png|jpe?g|gif|webp|svg\+xml);base64,/.test(file.dataURL) || file.dataURL.length > 15_000_000) fail('Invalid image file')
  }
}

export function atomicWrite(path, contents) {
  const temp = `${path}.${randomUUID()}.tmp`
  let fd
  try {
    fd = openSync(temp, 'wx', 0o600)
    writeFileSync(fd, contents, 'utf8'); fsyncSync(fd); closeSync(fd); fd = undefined
    renameSync(temp, path)
  } catch (error) {
    if (fd !== undefined) closeSync(fd)
    try { unlinkSync(temp) } catch { /* no temporary file left */ }
    throw error
  }
}

export class BoardStore extends EventEmitter {
  constructor({ directory, write = atomicWrite }) {
    super(); this.directory = directory; this.write = write; this.boards = new Map()
    mkdirSync(directory, { recursive: true })
    for (const file of readdirSync(directory).filter(file => file.endsWith('.json'))) {
      const board = JSON.parse(readFileSync(join(directory, file), 'utf8'))
      validId(board.id); validateElements(board.elements); validateFiles(board.files)
      if (`${board.id}.json` !== file) fail(`Invalid board file: ${file}`)
      this.boards.set(board.id, board)
    }
  }
  list() {
    return [...this.boards.values()].map(({ id, name, revision, updatedAt }) => ({ id, name, revision, updatedAt }))
      .sort((a, b) => b.updatedAt - a.updatedAt)
  }
  read(id) {
    validId(id)
    const board = this.boards.get(id)
    if (!board) throw new WorkspaceError('Board not found', 404)
    return structuredClone(board)
  }
  save(board) {
    const data = JSON.stringify(board)
    if (Buffer.byteLength(data) > 25_000_000) fail('Board exceeds the 25 MB local limit; export and split this board')
    this.write(join(this.directory, `${board.id}.json`), data)
    this.boards.set(board.id, structuredClone(board))
    this.emit('change', board.id)
    return structuredClone(board)
  }
  create({ name, template = 'blank' }) {
    text(name, 160, 'board name')
    if (!name.trim()) fail('Enter a board name')
    if (!['blank', 'brainwriting'].includes(template)) fail('Invalid template')
    return this.save({
      id: randomUUID(), name: name.trim(), revision: 0, updatedAt: Date.now(),
      elements: template === 'brainwriting' ? brainwritingElements() : [], files: {}, background: '#ffffff',
      brief: '', messages: [], session: { phase: 'diverge', hmw: '', criteria: '', decision: '' },
      focus: null, votes: {},
    })
  }
  patch(id, patch) {
    const board = this.read(id)
    if (!patch || Array.isArray(patch) || typeof patch !== 'object') fail('Invalid patch')
    if (patch.expectedRevision !== undefined && patch.expectedRevision !== board.revision)
      throw new WorkspaceError('Board changed; read the latest revision before updating it', 409)
    if (patch.elements !== undefined) {
      validateElements(patch.elements)
      board.elements = mergeElements(board.elements, patch.elements)
      if (board.elements.length > 10000) fail('Board has too many elements')
    }
    if (patch.files !== undefined) { validateFiles(patch.files); board.files = { ...board.files, ...patch.files } }
    if (patch.background !== undefined) {
      if (typeof patch.background !== 'string' || !/^#[a-fA-F0-9]{6}$/.test(patch.background)) fail('Invalid background')
      board.background = patch.background
    }
    if (patch.brief !== undefined) board.brief = text(patch.brief, 30000, 'brief')
    if (patch.session !== undefined) {
      if (!patch.session || typeof patch.session !== 'object' || Array.isArray(patch.session)) fail('Invalid session')
      const s = patch.session
      if (s.phase !== undefined && !['diverge', 'converge'].includes(s.phase)) fail('Invalid phase')
      for (const k of ['hmw', 'criteria', 'decision']) if (s[k] !== undefined) text(s[k], 10000, k)
      for (const k of ['phase', 'hmw', 'criteria', 'decision']) if (s[k] !== undefined) board.session[k] = s[k]
    }
    if (patch.focus !== undefined) {
      if (!patch.focus || !Array.isArray(patch.focus.elementIds) || patch.focus.elementIds.length > 100) fail('Select up to 100 elements')
      for (const elementId of patch.focus.elementIds) {
        validId(elementId)
        if (!board.elements.some(e => e.id === elementId && !e.isDeleted)) fail('Selected element is unavailable')
      }
      board.focus = { elementIds: patch.focus.elementIds, instruction: text(patch.focus.instruction ?? '', 5000, 'focus instruction') }
    }
    if (patch.message !== undefined) {
      const m = patch.message
      if (!m || typeof m !== 'object') fail('Invalid message')
      validId(m.id); text(m.author, 80, 'author'); text(m.text, 10000, 'message')
      if (!board.messages.some(message => message.id === m.id)) {
        if (board.messages.length >= 2000) fail('Discussion is full; export and create a new board')
        board.messages.push({ id: m.id, author: m.author, text: m.text, createdAt: Date.now() })
      }
    }
    const previous = this.read(id)
    if (JSON.stringify(board) === JSON.stringify(previous)) return previous
    board.revision++; board.updatedAt = Date.now()
    return this.save(board)
  }
  import({ name, data }) {
    text(name, 160, 'board name')
    if (!name.trim() || !data || typeof data !== 'object') fail('Invalid import')
    const source = data.format === 'excali-cloud-local' && data.version === 1 ? data.board : data
    if (!source || typeof source !== 'object') fail('Invalid backup')
    validateElements(source.elements); validateFiles(source.files ?? {})
    // Copy only known fields; older backups may still carry a Crazy 8s deadline.
    const saved = source.session && typeof source.session === 'object' ? source.session : {}
    const session = { phase: saved.phase ?? 'diverge', hmw: saved.hmw ?? '', criteria: saved.criteria ?? '', decision: saved.decision ?? '' }
    if (!['diverge', 'converge'].includes(session.phase)) fail('Invalid phase')
    for (const key of ['hmw', 'criteria', 'decision']) text(session[key], 10000, key)
    const messages = source.messages ?? []
    if (!Array.isArray(messages) || messages.length > 2000) fail('Invalid discussion')
    for (const message of messages) {
      validId(message.id); text(message.author, 80, 'author'); text(message.text, 10000, 'message')
      if (!Number.isFinite(message.createdAt)) fail('Invalid message date')
    }
    const background = source.background ?? source.appState?.viewBackgroundColor ?? '#ffffff'
    if (typeof background !== 'string' || !/^#[a-fA-F0-9]{6}$/.test(background)) fail('Invalid background')
    const votes = source.votes ?? {}
    if (!votes || Array.isArray(votes) || typeof votes !== 'object') fail('Invalid votes')
    for (const [voter, ids] of Object.entries(votes)) {
      validId(voter)
      if (!Array.isArray(ids) || ids.length > 3) fail('Invalid votes')
      ids.forEach(validId)
    }
    const focus = source.focus ?? null
    if (focus !== null) {
      if (!Array.isArray(focus.elementIds) || focus.elementIds.length > 100) fail('Invalid focus')
      focus.elementIds.forEach(validId); text(focus.instruction, 5000, 'focus instruction')
    }
    return this.save({ id: randomUUID(), name: name.trim(), revision: 0, updatedAt: Date.now(),
      elements: source.elements, files: source.files ?? {}, background,
      brief: text(source.brief ?? '', 30000, 'brief'), messages, session, votes, focus })
  }
  vote(id, voterId, elementId) {
    const board = this.read(id)
    validId(elementId)
    if (board.session.phase !== 'converge') throw new WorkspaceError('Voting opens in Converge', 409)
    if (!board.elements.some(e => e.id === elementId && !e.isDeleted)) fail('Choose an existing idea')
    const votes = board.votes[voterId] ?? []
    if (votes.includes(elementId)) board.votes[voterId] = votes.filter(id => id !== elementId)
    else {
      if (votes.length >= 3) fail('You have used your three votes. Remove one before choosing another idea.')
      board.votes[voterId] = [...votes, elementId]
    }
    board.revision++; board.updatedAt = Date.now()
    return this.save(board)
  }
}
