import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createBoardSceneSaver } from '../src/lib/board-scene-saver'

const scene = (text: string, isDeleted = false) =>
  JSON.stringify({
    elements: [{ id: 'text', text, isDeleted }],
    files: { image: { dataURL: 'data:image/png;base64,example' } },
    appState: { viewBackgroundColor: '#ffffff', theme: 'light' },
  })

test('loading and initial hydration never write a document', async () => {
  const saver = createBoardSceneSaver()
  const writes: string[] = []
  const write = async (payload: string) => {
    writes.push(payload)
  }
  await assert.rejects(saver.flush(write), /still loading/)
  assert.equal(saver.isReady(), false)
  assert.equal(saver.capture(scene('restored')), false)
  await saver.flush(write)
  assert.deepEqual(writes, [])
  assert.equal(saver.isDirty(), false)
})

test('unmount flush preserves the captured content when the canvas is destroyed', async () => {
  const saver = createBoardSceneSaver()
  saver.capture(scene('before edit'))
  const canvas = JSON.parse(scene('unsaved edit'))
  const captured = JSON.stringify(canvas)
  saver.capture(captured)

  // Excalidraw.componentWillUnmount replaces its scene and files with empties.
  canvas.elements = []
  canvas.files = {}
  const writes: string[] = []
  await saver.flush(async (payload) => {
    writes.push(payload)
  })
  assert.deepEqual(writes, [captured])
  assert.equal(JSON.parse(writes[0]).elements[0].text, 'unsaved edit')
  assert.equal(saver.isDirty(), false)
})

test('an in-flight save drains the final snapshot once without reading a destroyed canvas', async () => {
  const saver = createBoardSceneSaver()
  saver.capture(scene('initial'))
  saver.capture(scene('first edit'))
  const writes: string[] = []
  let release!: () => void
  const firstWrite = new Promise<void>((resolve) => {
    release = resolve
  })
  const write = async (payload: string) => {
    writes.push(payload)
    if (writes.length === 1) await firstWrite
  }
  const saving = saver.flush(write)
  saver.capture(scene('final edit'))
  const unmountFlush = saver.flush(write)
  assert.equal(saver.isSaving(), true)
  release()
  await Promise.all([saving, unmountFlush])
  assert.deepEqual(writes, [scene('first edit'), scene('final edit')])
  assert.equal(saver.isSaving(), false)
  assert.equal(saver.isDirty(), false)
})

test('intentional delete-all preserves deletion tombstones', async () => {
  const saver = createBoardSceneSaver()
  saver.capture(scene('delete me'))
  assert.equal(saver.capture(scene('delete me', true)), true)
  const writes: string[] = []
  await saver.flush(async (payload) => {
    writes.push(payload)
  })
  assert.equal(writes.length, 1)
  assert.equal(JSON.parse(writes[0]).elements[0].isDeleted, true)
})

test('failed writes remain dirty and retry the most recent snapshot', async () => {
  const saver = createBoardSceneSaver()
  saver.capture(scene('initial'))
  saver.capture(scene('edit'))
  await assert.rejects(
    saver.flush(async () => {
      throw new Error('Offline')
    }),
    /Offline/
  )
  assert.equal(saver.isDirty(), true)
  assert.equal(saver.isSaving(), false)
  saver.capture(scene('latest edit'))
  const writes: string[] = []
  await saver.flush(async (payload) => {
    writes.push(payload)
  })
  assert.deepEqual(writes, [scene('latest edit')])
})

test('board switches keep independent snapshots and save queues', async () => {
  const first = createBoardSceneSaver()
  const second = createBoardSceneSaver()
  first.capture(scene('first board'))
  first.capture(scene('first board edit'))
  second.capture(scene('second board'))
  const writes: [string, string][] = []
  await Promise.all([
    first.flush(async (payload) => {
      writes.push(['first', payload])
    }),
    second.flush(async (payload) => {
      writes.push(['second', payload])
    }),
  ])
  assert.deepEqual(writes, [['first', scene('first board edit')]])
})
