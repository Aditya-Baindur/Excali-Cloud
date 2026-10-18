import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'
import { draftKey, restoreDraft } from '../src/components/editor/drafts'
import {
  emptyProject,
  exportFileName,
  MAX_VIDEO_BYTES,
  uploadBoardVideo,
  videoUrl,
} from '../src/components/editor/media'

const originalFetch = globalThis.fetch
const originalBase = process.env.NEXT_PUBLIC_API_BASE

afterEach(() => {
  globalThis.fetch = originalFetch
  if (originalBase === undefined) delete process.env.NEXT_PUBLIC_API_BASE
  else process.env.NEXT_PUBLIC_API_BASE = originalBase
})

test('editor uploads use the board API with authentication and the original binary body', async () => {
  process.env.NEXT_PUBLIC_API_BASE = 'https://worker.example/'
  const file = new File(['test media'], 'My clip.mp4')
  const controller = new AbortController()
  const video = { id: 'new-video', boardId: 'board-1', name: file.name }
  globalThis.fetch = async (url, init) => {
    assert.equal(url, 'https://worker.example/boards/board-1/videos')
    assert.equal(init?.method, 'POST')
    assert.equal(init?.body, file)
    assert.equal(init?.signal, controller.signal)
    const headers = new Headers(init.headers)
    assert.equal(headers.get('Authorization'), 'Bearer session-token')
    assert.equal(headers.get('Content-Type'), 'video/mp4')
    assert.equal(headers.get('X-File-Name'), 'My%20clip.mp4')
    return Response.json({ video })
  }
  assert.deepEqual(
    await uploadBoardVideo('board-1', file, 'session-token', controller.signal),
    video
  )
})

test('unsupported, empty, and oversized uploads fail before any network request', async () => {
  let requests = 0
  globalThis.fetch = async () => {
    requests++
    throw new Error('Unexpected request')
  }
  await assert.rejects(
    uploadBoardVideo(
      'board',
      new File(['mov'], 'clip.mov', { type: 'video/quicktime' }),
      'token'
    ),
    /MP4, WebM, or Ogg/
  )
  await assert.rejects(
    uploadBoardVideo('board', new File([], 'clip.mp4'), 'token'),
    /50 MB/
  )
  const largeFile = new File(
    [new Uint8Array(MAX_VIDEO_BYTES + 1)],
    'large.mp4',
    { type: 'video/mp4' }
  )
  await assert.rejects(
    uploadBoardVideo('board', largeFile, 'token'),
    /Download larger exports/
  )
  assert.equal(requests, 0)
})

test('failed saves preserve the API error for a retryable export', async () => {
  process.env.NEXT_PUBLIC_API_BASE = 'https://worker.example'
  globalThis.fetch = async () =>
    Response.json({ error: 'Upload temporarily unavailable' }, { status: 503 })
  await assert.rejects(
    uploadBoardVideo('board', new File(['mp4'], 'export.mp4'), 'token'),
    /Upload temporarily unavailable/
  )
})

test('media reads stay on the authenticated same-origin proxy', () => {
  assert.equal(
    videoUrl('board-1', 'video-2'),
    '/api/workspace/boards/board-1/videos/video-2/content'
  )
  assert.equal(
    videoUrl('../other', 'a?b'),
    '/api/workspace/boards/..%2Fother/videos/a%3Fb/content'
  )
})

test('draft identities separate users, boards, source videos, and new projects', () => {
  const keys = [
    draftKey('user-a', 'board-a'),
    draftKey('user-b', 'board-a'),
    draftKey('user-a', 'board-b'),
    draftKey('user-a', 'board-a', 'video-a'),
    draftKey('user-a', 'board-a', 'video-b'),
  ]
  assert.equal(new Set(keys).size, keys.length)
  assert.notEqual(draftKey('a:b', 'c'), draftKey('a', 'b:c'))
})

test('restoring a draft renews nested local asset URLs without changing shared videos', async () => {
  const file = new Blob(['image bytes'], { type: 'image/png' })
  const sharedSource = videoUrl('board', 'video')
  const project = emptyProject('Nested project')
  const settings = { enabled: true, startTime: 0, sourceDuration: 3 }
  project.layers = [
    {
      id: 'group',
      type: 'group',
      settings,
      properties: {},
      animations: [],
      children: [
        {
          id: 'image',
          type: 'image',
          settings: { ...settings, source: 'blob:old-session' },
          properties: {},
          animations: [],
        },
      ],
    },
    {
      id: 'video',
      type: 'video',
      settings: { ...settings, source: sharedSource },
      properties: {},
      animations: [],
    },
  ]
  const assets = new Map<string, Blob>()
  const restored = restoreDraft(
    { video: project, assets: [['blob:old-session', file]] },
    assets
  )
  const restoredSource = restored.layers[0].children![0].settings
    .source as string
  try {
    assert.notEqual(restoredSource, 'blob:old-session')
    assert.equal(
      await (await originalFetch(restoredSource)).text(),
      'image bytes'
    )
    assert.equal(assets.get(restoredSource), file)
    assert.equal(restored.layers[1].settings.source, sharedSource)
    assert.equal(
      project.layers[0].children![0].settings.source,
      'blob:old-session'
    )
  } finally {
    URL.revokeObjectURL(restoredSource)
  }
})

test('export filenames meet the video API name restrictions', () => {
  assert.equal(exportFileName('My / video\u0000'), 'My _ video_.mp4')
  assert.equal(exportFileName('   '), 'Edited video.mp4')
  assert.ok(exportFileName('x'.repeat(500)).length <= 255)
})
