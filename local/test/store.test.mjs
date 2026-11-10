import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { BoardStore } from '../server/store.mjs'
import { makeElements } from '../shared/scene.mjs'

function fixture(t, options = {}) {
  const directory = mkdtempSync(join(tmpdir(), 'excali-store-'))
  t.after(() => rmSync(directory, { recursive: true, force: true }))
  return { directory, store: new BoardStore({ directory, ...options }) }
}

test('independent patches merge and restore after restart', t => {
  const { store, directory } = fixture(t)
  const board = store.create({ name: 'Vision', template: 'blank' })
  const [a, b] = makeElements([{ type: 'text', text: 'A', x: 0, y: 0 }, { type: 'text', text: 'B', x: 400, y: 0 }])
  store.patch(board.id, { elements: [a] })
  store.patch(board.id, { elements: [b] })
  const reloaded = new BoardStore({ directory }).read(board.id)
  assert.deepEqual(new Set(reloaded.elements.map(e => e.id)), new Set([a.id, b.id]))
  assert.equal(reloaded.revision, 2)
})

test('native version/nonce conflict ordering converges and tombstones survive replay', t => {
  const { store } = fixture(t)
  const board = store.create({ name: 'Replay' })
  const [a] = makeElements([{ type: 'text', text: 'Original' }])
  store.patch(board.id, { elements: [a] })
  const winner = { ...a, version: 2, versionNonce: 10, text: 'Won' }
  store.patch(board.id, { elements: [winner] })
  store.patch(board.id, { elements: [{ ...a, version: 2, versionNonce: 20, text: 'Lost' }] })
  assert.equal(store.read(board.id).elements[0].text, 'Won')
  const removed = { ...winner, version: 3, isDeleted: true }
  store.patch(board.id, { elements: [removed] })
  const revision = store.read(board.id).revision
  store.patch(board.id, { elements: [a] })
  assert.equal(store.read(board.id).elements[0].isDeleted, true)
  assert.equal(store.read(board.id).revision, revision)
})

test('stale updates rejected and repeated discussion IDs are idempotent', t => {
  const { store } = fixture(t)
  const board = store.create({ name: 'Discussion' })
  store.patch(board.id, { message: { id: 'message-1', author: 'Team', text: 'Explore this' } })
  store.patch(board.id, { message: { id: 'message-1', author: 'Team', text: 'Explore this' } })
  assert.equal(store.read(board.id).messages.length, 1)
  assert.throws(() => store.patch(board.id, { expectedRevision: 0, brief: 'stale' }), /changed|revision/i)
  assert.equal(store.read(board.id).brief, '')
})

test('failed persistence leaves accepted memory and disk untouched', t => {
  const { store } = fixture(t)
  const board = store.create({ name: 'Safe' })
  store.write = () => { throw new Error('Disk full') }
  assert.throws(() => store.patch(board.id, { brief: 'not saved' }), /Disk full/)
  assert.equal(store.read(board.id).brief, '')
  assert.equal(store.read(board.id).revision, 0)
})

test('path traversal and invalid elements rejected without changing state', t => {
  const { store } = fixture(t)
  const board = store.create({ name: 'Validation' })
  assert.throws(() => store.read('../outside'), /Invalid/)
  assert.throws(() => store.patch(board.id, { elements: [{ id: 'bad', x: Infinity }] }), /Invalid/)
  assert.equal(store.read(board.id).revision, 0)
})

test('brainwriting template and session metadata persist', t => {
  const { store, directory } = fixture(t)
  const board = store.create({ name: 'Brainwriting', template: 'brainwriting' })
  assert.ok(board.elements.some(e => e.text?.includes('Write')))
  store.patch(board.id, { expectedRevision: 0, session: { phase: 'converge', hmw: 'How might we keep context?', criteria: 'Useful and feasible' } })
  assert.equal(new BoardStore({ directory }).read(board.id).session.phase, 'converge')
})

test('backup import preserves scene assets, session and discussion under a new board ID', t => {
  const { store } = fixture(t)
  const board = store.create({ name: 'Original', template: 'brainwriting' })
  const files = { image1: { id: 'image1', mimeType: 'image/png', dataURL: 'data:image/png;base64,aGVsbG8=', created: 1 } }
  store.patch(board.id, { files, brief: 'Our vision', session: { hmw: 'How might we help?' }, message: { id: 'm1', author: 'Team', text: 'Keep this' } })
  const imported = store.import({ name: 'Restored', data: { format: 'excali-cloud-local', version: 1, board: store.read(board.id) } })
  assert.notEqual(imported.id, board.id)
  assert.equal(imported.brief, 'Our vision')
  assert.equal(imported.messages[0].text, 'Keep this')
  assert.deepEqual(imported.files, files)
  assert.equal(imported.session.hmw, 'How might we help?')
  assert.throws(() => store.import({ name: 'Broken', data: { elements: 'bad' } }), /Invalid/)
  assert.equal(store.list().length, 2)
})
