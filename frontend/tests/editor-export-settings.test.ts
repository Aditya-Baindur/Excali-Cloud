import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { LayerJSON, VideoJSON } from '@videoflow/core'
import { prepareExportVideo } from '../src/components/editor/export-settings'

function layer(
  type: string,
  properties: LayerJSON['properties'] = {}
): LayerJSON {
  return {
    id: type,
    type,
    settings: {
      enabled: true,
      startTime: 5,
      sourceStart: 3,
      sourceDuration: 10,
      speed: 2,
    },
    properties,
    animations: [],
  }
}

function project(...layers: LayerJSON[]): VideoJSON {
  return {
    name: '12px project',
    width: 1920,
    height: 1080,
    fps: 30,
    duration: 10,
    backgroundColor: '#000000',
    layers,
  }
}

test('720p export keeps pixel titles proportional without changing responsive units', () => {
  const video = project(
    layer('text', {
      text: 'Title at 96px',
      fontSize: '96px',
      lineHeight: 1.4,
      letterSpacing: '0.08em',
      borderRadius: '10%',
      padding: ['12px', '2em', '6px', 0.5],
      position: [0.5, 0.8],
      scale: 0.7,
      rotation: 30,
    })
  )
  const before = structuredClone(video)
  const output = prepareExportVideo(video, {
    resolution: '720',
    fps: 'project',
  })
  assert.deepEqual([output.width, output.height, output.fps], [1280, 720, 30])
  const properties = output.layers[0].properties
  assert.equal(properties.fontSize, '64px')
  assert.equal(
    Number.parseFloat(properties.fontSize) / output.width,
    96 / video.width
  )
  assert.deepEqual(properties.padding, ['8px', '2em', '4px', 0.5])
  for (const key of [
    'text',
    'lineHeight',
    'letterSpacing',
    'borderRadius',
    'position',
    'scale',
    'rotation',
  ])
    assert.deepEqual(properties[key], video.layers[0].properties[key])
  assert.deepEqual(video, before)
})

test('4K export scales pixel keyframes and nested layer lengths but preserves time', () => {
  const title = layer('text', {
    fontSize: 6,
    textShadowOffset: ['-3.5px', '2px'],
  })
  title.animations = [
    {
      property: 'fontSize',
      easing: 'easeIn',
      keyframes: [
        { time: 3, value: '48px', easing: 'easeOut' },
        { time: 8, value: 6 },
      ],
    },
    {
      property: 'boxShadowOffset',
      keyframes: [
        { time: 3, value: ['4px', '-2px'] },
        { time: 8, value: ['1em', '8px'] },
      ],
    },
    { property: 'text', keyframes: [{ time: 5, value: '12px' }] },
  ]
  title.transitionIn = {
    transition: 'slideUp',
    duration: 0.5,
    params: { distance: 0.3 },
  }
  const group = layer('group', { filterBlur: '4px', perspective: '500px' })
  group.children = [title]
  const video = project(group)
  const before = structuredClone(video)
  const output = prepareExportVideo(video, { resolution: '2160', fps: 60 })
  assert.deepEqual([output.width, output.height, output.fps], [3840, 2160, 60])
  assert.equal(output.layers[0].properties.filterBlur, '8px')
  assert.equal(output.layers[0].properties.perspective, '1000px')
  const result = output.layers[0].children![0]
  assert.equal(result.properties.fontSize, 6)
  assert.deepEqual(result.properties.textShadowOffset, ['-7px', '4px'])
  assert.deepEqual(result.animations[0], {
    property: 'fontSize',
    easing: 'easeIn',
    keyframes: [
      { time: 3, value: '96px', easing: 'easeOut' },
      { time: 8, value: 6 },
    ],
  })
  assert.deepEqual(
    result.animations[1].keyframes.map((key) => key.value),
    [
      ['8px', '-4px'],
      ['1em', '16px'],
    ]
  )
  assert.deepEqual(result.animations[2], title.animations[2])
  assert.deepEqual(result.settings, title.settings)
  assert.deepEqual(result.transitionIn, title.transitionIn)
  assert.equal(output.duration, video.duration)
  assert.deepEqual(video, before)
})

test('scaling is restricted to the actual layer schema, not arbitrary px-looking strings', () => {
  const shape = layer('shape', {
    width: 100,
    height: '50px',
    strokeWidth: 2,
    fill: '#ffffff',
  })
  const audio = layer('audio', { volume: 0.5, fontSize: '48px' })
  audio.settings.source = '/audio/12px.mp3'
  const captions = layer('captions', {
    fontSize: '48px',
    text: '20px',
    fontFamily: '12px',
  })
  captions.settings.captions = [{ caption: '32px', startTime: 6, endTime: 8 }]
  captions.animations = [
    {
      property: 'effects.blur.radius',
      keyframes: [{ time: 4, value: '10px' }],
    },
  ]
  const unknown = layer('custom', {
    fontSize: '48px',
    metadata: { size: '20px' },
  })
  const video = project(shape, audio, captions, unknown)
  const output = prepareExportVideo(video, {
    resolution: '2160',
    fps: 'project',
  })
  assert.deepEqual(output.layers[0], shape) // Shape dimensions only support em.
  assert.deepEqual(output.layers[1], audio)
  assert.deepEqual(output.layers[3], unknown)
  assert.equal(output.layers[2].properties.fontSize, '96px')
  assert.equal(output.layers[2].properties.text, '20px')
  assert.equal(output.layers[2].properties.fontFamily, '12px')
  assert.deepEqual(output.layers[2].settings, captions.settings)
  assert.deepEqual(output.layers[2].animations, captions.animations)
})

test('portrait and square exports use the shorter edge and even encoder dimensions', () => {
  const portrait = { ...project(), width: 1080, height: 1920 }
  const output = prepareExportVideo(portrait, { resolution: '2160', fps: 24 })
  assert.deepEqual([output.width, output.height, output.fps], [2160, 3840, 24])
  const square = prepareExportVideo(
    { ...project(), width: 999, height: 999 },
    { resolution: '720', fps: 'project' }
  )
  assert.deepEqual([square.width, square.height], [720, 720])
  const odd = prepareExportVideo(
    { ...project(), width: 1919, height: 1080 },
    { resolution: '720', fps: 'project' }
  )
  assert.deepEqual([odd.width, odd.height], [1280, 720])
})

test('original resolution returns an independent document and only rounds odd dimensions', () => {
  const video = {
    ...project(layer('text', { fontSize: '48px' })),
    width: 1919,
    height: 1079,
  }
  const output = prepareExportVideo(video, {
    resolution: 'original',
    fps: 'project',
  })
  assert.deepEqual([output.width, output.height], [1920, 1080])
  assert.equal(output.layers[0].properties.fontSize, '48px')
  output.layers[0].properties.fontSize = '100px'
  assert.equal(video.layers[0].properties.fontSize, '48px')
})

test('invalid dimensions and frame rates fail before rendering', () => {
  for (const width of [0, -1, NaN, Infinity])
    assert.throws(
      () =>
        prepareExportVideo(
          { ...project(), width },
          { resolution: '1080', fps: 'project' }
        ),
      /dimensions/
    )
  for (const fps of [0, -1, NaN, Infinity])
    assert.throws(
      () => prepareExportVideo(project(), { resolution: '1080', fps }),
      /frame rate/
    )
})
