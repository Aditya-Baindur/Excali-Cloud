import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { LayerJSON, VideoJSON } from '@videoflow/core'
import {
  captionsLayerFromCues,
  exportProjectBackup,
  importProjectBackup,
  MAX_PROJECT_BACKUP_BYTES,
  parseSubtitles,
  projectBackupFileName,
  validateVideoProject,
} from '../src/components/editor/project-tools'

const boardSource = '/api/workspace/boards/board-1/videos/video-1/content'
const layer = (
  type = 'video',
  source = boardSource,
  id = 'layer-1'
): LayerJSON => ({
  id,
  type,
  settings: {
    enabled: true,
    startTime: 0,
    sourceDuration: 4,
    ...(source ? { source } : {}),
  },
  properties: {},
  animations: [],
  track: 0,
})
const project = (layers: LayerJSON[] = []): VideoJSON => ({
  name: 'My edit',
  width: 1920,
  height: 1080,
  fps: 30,
  duration: 10,
  backgroundColor: '#000000',
  layers,
})
const bundle = (video: unknown, assets: unknown[] = []) =>
  JSON.stringify({
    format: 'excalicloud-video-project',
    version: 1,
    project: video,
    assets,
  })
const release = (assets: Map<string, Blob>) => {
  for (const url of assets.keys()) URL.revokeObjectURL(url)
}

test('backup embeds referenced image/audio blobs once and restores nested sources without changing the original', async () => {
  const image = new Blob(['image bytes'], { type: 'image/png' })
  const audio = new Blob(['audio bytes'], { type: 'audio/mpeg' })
  const assets = new Map([
    ['blob:old-image', image],
    ['blob:old-audio', audio],
    ['blob:unused', new Blob(['unused'])],
  ])
  const group = layer('group', '', 'group')
  group.children = [
    layer('image', 'blob:old-image', 'image-1'),
    layer('image', 'blob:old-image', 'image-2'),
  ]
  const video = project([
    group,
    layer('audio', 'blob:old-audio', 'audio'),
    layer('video', boardSource, 'board'),
  ])
  video.tracks = [{ name: 'Timeline', enabled: true }]
  video.layers[1].properties = { volume: 0.5 }
  video.layers[1].animations = [
    {
      property: 'volume',
      keyframes: [
        { time: 0, value: 0 },
        { time: 1, value: 0.5, easing: 'linear' },
      ],
    },
  ]
  const backup = await exportProjectBackup(video, assets)
  const text = await backup.text()
  assert.equal(backup.type, 'application/json')
  assert.ok(!text.includes('blob:old'))
  assert.equal(JSON.parse(text).assets.length, 2)
  const imported = await importProjectBackup(backup)
  try {
    const restoredImage = imported.video.layers[0].children![0].settings
      .source as string
    assert.notEqual(restoredImage, 'blob:old-image')
    assert.equal(
      imported.video.layers[0].children![1].settings.source,
      restoredImage
    )
    assert.equal(
      await imported.assets.get(restoredImage)!.text(),
      'image bytes'
    )
    const restoredAudio = imported.video.layers[1].settings.source as string
    assert.equal(
      await imported.assets.get(restoredAudio)!.text(),
      'audio bytes'
    )
    assert.deepEqual(
      imported.video.layers[1].animations,
      video.layers[1].animations
    )
    assert.deepEqual(imported.video.tracks, video.tracks)
    assert.equal(imported.video.layers[2].settings.source, boardSource)
    assert.match(imported.warnings[0], /require access to their original board/)
    assert.equal(video.layers[0].children![0].settings.source, 'blob:old-image')
  } finally {
    release(imported.assets)
  }
})

test('nested group track names and mute states survive a complete backup roundtrip', async () => {
  // The editor adds tracks to groups when normalizing the project, even though
  // the core LayerJSON declaration currently only lists root-level tracks.
  const inner = {
    ...layer('group', '', 'inner'),
    children: [layer('text', '', 'title')],
    tracks: [{ name: 'Titles', enabled: false }],
  }
  const outer = {
    ...layer('group', '', 'outer'),
    children: [inner],
    tracks: [{ name: 'Scene', enabled: true }],
  }
  const video = {
    ...project([outer]),
    tracks: [{ name: 'Main edit', enabled: false }],
  }
  const imported = await importProjectBackup(
    await exportProjectBackup(video, new Map())
  )
  assert.deepEqual(imported.video, video)
  assert.notEqual(imported.video.layers[0], outer)
  assert.notEqual(imported.video.layers[0].children![0], inner)

  for (const tracks of [
    {},
    [null],
    [{ name: 'Scene', enabled: 'false' }],
    [{ name: '', enabled: true }],
    [{ name: 'Scene', enabled: true, source: 'https://example.com' }],
  ]) {
    const invalidGroup = { ...outer, tracks }
    await assert.rejects(
      importProjectBackup(bundle(project([invalidGroup]))),
      /Track|track/
    )
  }
  const nongroupWithTracks = { ...layer(), tracks: outer.tracks }
  await assert.rejects(
    importProjectBackup(bundle(project([nongroupWithTracks]))),
    /Only groups can contain nested tracks/
  )
})

test('forward and reversed clips preserve signed speeds while zero and invalid magnitudes are rejected', async () => {
  for (const speed of [-100, -2, -0.01, 0.01, 1, 100]) {
    const clip = layer()
    clip.settings.speed = speed
    const imported = await importProjectBackup(
      await exportProjectBackup(project([clip]), new Map())
    )
    assert.equal(imported.video.layers[0].settings.speed, speed)
  }
  for (const speed of [0, -0, -0.001, 0.001, -101, 101]) {
    const clip = layer()
    clip.settings.speed = speed
    await assert.rejects(
      importProjectBackup(bundle(project([clip]))),
      /Playback speed/
    )
  }
  for (const speed of [
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
  ]) {
    const clip = layer()
    clip.settings.speed = speed
    assert.throws(() => validateVideoProject(project([clip])), /Numeric value/)
  }
})

test('detached audio keeps permissioned board references and reverse timing', async () => {
  const detached = layer('audio', boardSource, 'detached')
  detached.settings = {
    ...detached.settings,
    speed: -2,
    sourceStart: 1,
    sourceEnd: 2,
    mediaDuration: 7,
  }
  detached.properties = { volume: 0.5 }
  const video = project([layer(), detached])
  assert.deepEqual(validateVideoProject(video), video)
  const backup = await exportProjectBackup(video, new Map())
  const imported = await importProjectBackup(backup)
  assert.deepEqual(imported.video, video)
  assert.equal(imported.assets.size, 0)
  assert.match(imported.warnings[0], /require access to their original board/)
  assert.deepEqual(JSON.parse(await backup.text()).assets, [])
  for (const source of [
    `${boardSource}?token=secret`,
    'https://example.com/audio.mp4',
    '/api/public/shares/secret/videos/video-1/content',
  ])
    await assert.rejects(
      importProjectBackup(bundle(project([layer('audio', source)]))),
      /authenticated/
    )
})

test('video containers shared with detached audio embed once and restore one compatible source', async () => {
  for (const mimeType of [
    'video/mp4',
    'video/webm',
    'video/ogg',
    'video/quicktime',
  ]) {
    // Exercise both reference orders: the asset may first be seen as audio.
    for (const types of [
      ['video', 'audio'],
      ['audio', 'video'],
    ]) {
      const video = project(
        types.map((type) => layer(type, 'blob:container', type))
      )
      const backup = await exportProjectBackup(
        video,
        new Map([
          ['blob:container', new Blob(['container'], { type: mimeType })],
        ])
      )
      assert.equal(JSON.parse(await backup.text()).assets.length, 1)
      const imported = await importProjectBackup(backup)
      try {
        const source = imported.video.layers[0].settings.source as string
        assert.equal(imported.video.layers[1].settings.source, source)
        assert.equal(imported.assets.size, 1)
        assert.equal(imported.assets.get(source)!.type, mimeType)
        assert.equal(await imported.assets.get(source)!.text(), 'container')
      } finally {
        release(imported.assets)
      }
    }
  }
  for (const [layerType, mimeType] of [
    ['audio', 'image/png'],
    ['video', 'audio/mpeg'],
    ['image', 'video/mp4'],
  ]) {
    const clip = layer(layerType, 'blob:wrong')
    await assert.rejects(
      exportProjectBackup(
        project([clip]),
        new Map([['blob:wrong', new Blob(['a'], { type: mimeType })]])
      ),
      /layer cannot use/
    )
    await assert.rejects(
      importProjectBackup(
        bundle(project([layer(layerType, 'excalicloud-asset:asset-1')]), [
          { id: 'asset-1', mimeType, data: 'YQ==' },
        ])
      ),
      /layer cannot use/
    )
  }
})

test('base64 local sources become portable assets and repeated imports get different URLs', async () => {
  const backup = await exportProjectBackup(
    project([layer('image', 'data:image/png;base64,aGVsbG8=')]),
    new Map()
  )
  const first = await importProjectBackup(backup)
  const second = await importProjectBackup(backup)
  try {
    assert.equal(first.assets.size, 1)
    assert.equal(await [...first.assets.values()][0].text(), 'hello')
    assert.notEqual(
      first.video.layers[0].settings.source,
      second.video.layers[0].settings.source
    )
    assert.deepEqual(first.warnings, [])
  } finally {
    release(first.assets)
    release(second.assets)
  }
})

test('a multi-megabyte local asset restores byte-for-byte without a network fetch', async () => {
  const bytes = new Uint8Array(2 * 1024 * 1024)
  for (let index = 0; index < bytes.length; index++) bytes[index] = index % 251
  const media = new Blob([bytes], { type: 'audio/wav' })
  const backup = await exportProjectBackup(
    project([layer('audio', 'blob:local-audio')]),
    new Map([['blob:local-audio', media]])
  )
  const imported = await importProjectBackup(backup)
  try {
    assert.deepEqual(
      new Uint8Array(await [...imported.assets.values()][0].arrayBuffer()),
      bytes
    )
  } finally {
    release(imported.assets)
  }
})

test('missing browser-local files fail export instead of creating a broken backup', async () => {
  await assert.rejects(
    exportProjectBackup(project([layer('audio', 'blob:missing')]), new Map()),
    /missing/
  )
  await assert.rejects(
    exportProjectBackup(
      project([layer('image', 'blob:wrong')]),
      new Map([['blob:wrong', new Blob(['a'], { type: 'audio/mpeg' })]])
    ),
    /image layer cannot use/
  )
})

test('project imports reject unknown versions, raw JSON, malformed JSON, and oversized input before reading it', async () => {
  await assert.rejects(importProjectBackup('{'), /valid project backup JSON/)
  await assert.rejects(
    importProjectBackup(JSON.stringify(project())),
    /Unsupported backup field/
  )
  const unsupported = JSON.parse(bundle(project()))
  unsupported.version = 2
  await assert.rejects(
    importProjectBackup(JSON.stringify(unsupported)),
    /format or version/
  )
  class OversizedBlob extends Blob {
    get size() {
      return MAX_PROJECT_BACKUP_BYTES + 1
    }
    async text(): Promise<string> {
      throw new Error('Should not be read')
    }
  }
  await assert.rejects(importProjectBackup(new OversizedBlob()), /150 MB/)
})

test('only exact permissioned board media paths are accepted as nonembedded sources', async () => {
  const unsafe = [
    'https://evil.example/video.mp4',
    '//evil.example/video.mp4',
    'javascript:alert(1)',
    'file:///video.mp4',
    'blob:untrusted',
    '/api/workspace/boards/a/videos/b/content?token=secret',
    '/api/workspace/boards/a/videos/b/content#secret',
    '/api/workspace/boards/../videos/b/content',
    '/api/workspace/boards/%2Fother/videos/b/content',
    '/api/public/shares/secret/videos/b/content',
  ]
  for (const source of unsafe)
    await assert.rejects(
      importProjectBackup(bundle(project([layer('video', source)]))),
      /embedded|authenticated/
    )
  await assert.rejects(
    importProjectBackup(bundle(project([layer('image', boardSource)]))),
    /authenticated/
  )
  const imported = await importProjectBackup(bundle(project([layer()])))
  assert.equal(imported.video.layers[0].settings.source, boardSource)
})

test('imports reject credentials and prototype pollution nested inside project properties', async () => {
  for (const properties of [
    { authorization: 'Bearer private' },
    { nested: { sessionToken: 'secret' } },
    { value: 'Bearer private' },
    JSON.parse('{"__proto__":{"polluted":true}}'),
  ]) {
    const item = layer('text', '')
    item.properties = properties
    await assert.rejects(
      importProjectBackup(bundle(project([item]))),
      /credentials|tokens|unsafe/
    )
  }
  assert.equal(Object.prototype.hasOwnProperty('polluted'), false)
})

test('layer shape, IDs, nesting, project dimensions, timings, tracks, and keyframes are validated', async () => {
  const invalid: VideoJSON[] = [
    { ...project(), width: 0 },
    { ...project(), fps: 0 },
    { ...project(), duration: -1 },
    project([layer('html', '')]),
    project([layer(), layer()]),
  ]
  const timing = layer()
  timing.settings.sourceDuration = -2
  invalid.push(project([timing]))
  const track = layer()
  track.track = 0.5
  invalid.push(project([track]))
  const nested = layer()
  nested.children = []
  invalid.push(project([nested]))
  const animation = layer()
  animation.animations = [
    {
      property: 'opacity',
      keyframes: [
        { time: 2, value: 0 },
        { time: 1, value: 1 },
      ],
    },
  ]
  invalid.push(project([animation]))
  for (const input of invalid)
    await assert.rejects(importProjectBackup(bundle(input)))
  assert.throws(
    () => validateVideoProject({ ...project(), fps: Number.NaN }),
    /Frame rate/
  )
})

test('asset imports reject bad base64, duplicate/missing/unused assets, unsupported MIME, and media-kind mismatches', async () => {
  const video = project([layer('image', 'excalicloud-asset:asset-1')])
  const asset = { id: 'asset-1', mimeType: 'image/png', data: 'aGVsbG8=' }
  await assert.rejects(
    importProjectBackup(bundle(video)),
    /missing embedded asset/
  )
  await assert.rejects(
    importProjectBackup(bundle(video, [asset, asset])),
    /unique/
  )
  await assert.rejects(
    importProjectBackup(bundle(project(), [asset])),
    /unreferenced/
  )
  await assert.rejects(
    importProjectBackup(bundle(video, [{ ...asset, data: '***=' }])),
    /base64/
  )
  await assert.rejects(
    importProjectBackup(bundle(video, [{ ...asset, data: '' }])),
    /base64/
  )
  await assert.rejects(
    importProjectBackup(
      bundle(video, [{ ...asset, mimeType: 'image/svg+xml' }])
    ),
    /Unsupported embedded/
  )
  await assert.rejects(
    importProjectBackup(bundle(video, [{ ...asset, mimeType: 'audio/mpeg' }])),
    /image layer cannot use/
  )
})

test('SRT parser preserves millisecond timing, multiline captions and Unicode while removing styling', () => {
  const cues = parseSubtitles(
    '\uFEFF1\r\n00:00:01,250 --> 00:00:03,750\r\n<i>Hello &amp; welcome</i>\r\n世界\r\n\r\n2\r\n01:02:03,004 --> 01:02:05,000\r\nNext &#x1F642;'
  )
  assert.deepEqual(cues, [
    { caption: 'Hello & welcome\n世界', startTime: 1.25, endTime: 3.75 },
    { caption: 'Next 🙂', startTime: 3723.004, endTime: 3725 },
  ])
})

test('WebVTT supports cue IDs/settings and ignores NOTE, STYLE and REGION blocks', () => {
  const cues = parseSubtitles(
    'WEBVTT\nKind: captions\n\nNOTE\nignore this\n\nSTYLE\n::cue { color: red; }\n\nREGION\nid:bottom\n\nsecond\n00:05.100 --> 00:06.200 align:start line:90%\n<v Speaker>Later\n\nfirst\n00:01.000 --> 00:02.000\nEarlier'
  )
  assert.deepEqual(cues, [
    { caption: 'Earlier', startTime: 1, endTime: 2 },
    { caption: 'Later', startTime: 5.1, endTime: 6.2 },
  ])
})

test('subtitle parser rejects malformed, empty, reversed, zero-length, and out-of-range cues', () => {
  for (const subtitle of [
    '',
    'WEBVTT',
    '1\nnot timing\nText',
    '1\n00:00:02,000 --> 00:00:01,000\nBad',
    '1\n00:00:01,000 --> 00:00:01,000\nBad',
    '1\n00:60:00,000 --> 01:01:00,000\nBad',
    '1\n00:00:01,000 --> 00:00:02,000\n<i></i>',
    '1\n25:00:00,000 --> 25:00:01,000\nBad',
  ])
    assert.throws(() => parseSubtitles(subtitle))
})

test('native captions include all overlapping text, the full timeline range, and editable styling', () => {
  const captions = captionsLayerFromCues(
    [
      { caption: 'One', startTime: 1, endTime: 4 },
      { caption: 'Two', startTime: 3, endTime: 6 },
    ],
    { id: 'captions', track: 2, fontSize: 3.5 }
  )
  assert.equal(captions.type, 'captions')
  assert.equal(captions.track, 2)
  assert.equal(captions.settings.sourceDuration, 6)
  assert.equal(captions.settings.startTime, 0)
  assert.equal(captions.properties.fontSize, 3.5)
  assert.deepEqual(captions.settings.captions, [
    { caption: 'One', startTime: 1, endTime: 3 },
    { caption: 'One\nTwo', startTime: 3, endTime: 4 },
    { caption: 'Two', startTime: 4, endTime: 6 },
  ])
  assert.deepEqual(
    validateVideoProject(project([captions])).layers[0],
    captions
  )
  assert.throws(() => captionsLayerFromCues([]), /caption cues/)
  assert.throws(
    () => captionsLayerFromCues([{ caption: 'x', startTime: -1, endTime: 2 }]),
    /Caption start/
  )
})

test('caption backup sources use the native captions array and reject media URLs or malformed cues', async () => {
  const captions = captionsLayerFromCues(
    parseSubtitles('1\n00:00:01,000 --> 00:00:02,500\nHello'),
    { id: 'captions' }
  )
  const imported = await importProjectBackup(
    await exportProjectBackup(project([captions]), new Map())
  )
  assert.deepEqual(imported.video.layers[0], captions)
  assert.equal(imported.assets.size, 0)
  assert.equal(
    Object.hasOwn(imported.video.layers[0].settings, 'source'),
    false
  )

  for (const source of [boardSource, 'data:text/vtt;base64,V0VCVlRU', []]) {
    await assert.rejects(
      importProjectBackup(
        bundle(
          project([
            {
              ...captions,
              settings: { ...captions.settings, source },
            },
          ])
        )
      ),
      /Only image, audio, or video layers can have a media source/
    )
  }
  for (const cues of [
    'https://example.com/captions.vtt',
    { caption: 'Hello', startTime: 1, endTime: 2 },
    [null],
    [{ text: 'Hello', start: 1, end: 2 }],
    [{ caption: 'Hello', startTime: '1', endTime: 2 }],
    [{ caption: 'Hello', startTime: -1, endTime: 2 }],
    [{ caption: 'Hello', startTime: 2, endTime: 2 }],
    [{ caption: 'Hello', startTime: 2, endTime: 1 }],
    [{ caption: '', startTime: 1, endTime: 2 }],
    [{ caption: 'Hello', startTime: 1, endTime: 2, source: boardSource }],
  ]) {
    await assert.rejects(
      importProjectBackup(
        bundle(
          project([
            {
              ...captions,
              settings: { ...captions.settings, captions: cues },
            },
          ])
        )
      ),
      /Caption|caption/
    )
  }
})

test('backup filenames are safe and remain distinguishable from rendered exports', () => {
  assert.equal(
    projectBackupFileName('My / edit\u0000'),
    'My _ edit_.excalicloud.json'
  )
  assert.equal(projectBackupFileName('  '), 'Video project.excalicloud.json')
  assert.ok(projectBackupFileName('x'.repeat(400)).length < 240)
})
