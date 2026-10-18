import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { LayerJSON, VideoJSON } from '@videoflow/core'
import type {
  LayerTypeDescriptor,
  RuntimeLayerConstructor,
} from '@videoflow/renderer-browser'
import {
  captionTextAtSourceTime,
  installSourceCaptionTiming,
  type CaptionTimingRenderer,
} from '../src/components/editor/captions-runtime'
import { splitSelected, trimSelected } from '../src/components/editor/editing'

// Model only the public runtime methods the adapter uses. This avoids importing
// browser-only renderer dependencies in Node while exercising registration,
// inherited property evaluation, and the actual editor split/trim recipes.
class NativeCaptionRuntime {
  constructor(
    public json: LayerJSON,
    public fps: number
  ) {}
  get speed(): number {
    return this.json.settings.speed ?? 1
  }
  sourceTimeAtFrame(frame: number) {
    const source = this.json.settings.sourceStart ?? 0
    const elapsed =
      (frame / this.fps - this.json.settings.startTime) * Math.abs(this.speed)
    return this.speed < 0
      ? source + this.json.settings.sourceDuration - elapsed
      : source + elapsed
  }
  getPropertiesAtFrame(frame: number) {
    return {
      text: `native-global-${frame / this.fps}`,
      color: this.json.properties.color,
      opacity: 0.75,
    }
  }
}

class Registry implements CaptionTimingRenderer {
  descriptor: LayerTypeDescriptor = {
    runtime: NativeCaptionRuntime as unknown as RuntimeLayerConstructor,
    propertiesDefinition: { text: { default: undefined, animatable: false } },
  }
  registrations = 0
  locked = false
  getLayerType(type: string) {
    return type === 'captions' ? this.descriptor : undefined
  }
  registerLayerType(type: string, descriptor: LayerTypeDescriptor) {
    assert.equal(type, 'captions')
    if (this.locked) throw new Error('Renderer already loaded')
    this.registrations++
    this.descriptor = descriptor
  }
  caption(layer: LayerJSON) {
    const Constructor = this.descriptor
      .runtime as unknown as typeof NativeCaptionRuntime
    return new Constructor(layer, 30)
  }
}

function captionLayer(): LayerJSON {
  return {
    id: 'caption',
    type: 'captions',
    track: 0,
    settings: {
      enabled: true,
      startTime: 0,
      sourceStart: 0,
      sourceDuration: 6,
      captions: [
        { caption: 'One', startTime: 0, endTime: 2 },
        { caption: 'Two', startTime: 2, endTime: 4 },
        { caption: 'Three', startTime: 4, endTime: 6 },
      ],
    },
    properties: { color: '#ffffff' },
    animations: [],
  }
}

function project(layer: LayerJSON): VideoJSON {
  return {
    name: 'Captions',
    width: 1920,
    height: 1080,
    fps: 30,
    duration: 30,
    backgroundColor: '#000000',
    layers: [layer],
  }
}

test('source cue lookup chooses the next cue at boundaries and preserves gaps', () => {
  const cues = captionLayer().settings.captions
  assert.equal(captionTextAtSourceTime(cues, 0), 'One')
  assert.equal(captionTextAtSourceTime(cues, 2), 'Two')
  assert.equal(captionTextAtSourceTime(cues, 6), '')
  assert.equal(captionTextAtSourceTime(cues, 6, true), 'Three')
  assert.equal(captionTextAtSourceTime(cues, 4, true), 'Two')
  assert.equal(captionTextAtSourceTime(cues, 0, true), '')
  assert.equal(
    captionTextAtSourceTime([{ caption: 'Gap', startTime: 3, endTime: 4 }], 2),
    ''
  )
  assert.equal(
    captionTextAtSourceTime(
      [null, {}, { caption: 'Bad', startTime: 4, endTime: 3 }],
      3
    ),
    ''
  )
  assert.equal(captionTextAtSourceTime(cues, NaN), '')
})

test('registration is renderer-local, idempotent, and retains native styling', () => {
  const renderer = new Registry()
  const other = new Registry()
  const definitions = renderer.descriptor.propertiesDefinition
  installSourceCaptionTiming(renderer)
  renderer.locked = true
  installSourceCaptionTiming(renderer)
  assert.equal(renderer.registrations, 1)
  assert.equal(other.registrations, 0)
  assert.equal(renderer.descriptor.propertiesDefinition, definitions)
  assert.deepEqual(renderer.caption(captionLayer()).getPropertiesAtFrame(0), {
    text: 'One',
    color: '#ffffff',
    opacity: 0.75,
  })
})

test('native layer moves and undo need no cue rewrites or extra history entries', () => {
  const renderer = new Registry()
  installSourceCaptionTiming(renderer)
  const layer = captionLayer()
  const originalCues = structuredClone(layer.settings.captions)
  const runtime = renderer.caption(layer)
  layer.settings.startTime = 10
  assert.equal(runtime.getPropertiesAtFrame(11 * 30).text, 'One')
  assert.equal(runtime.getPropertiesAtFrame(13 * 30).text, 'Two')
  layer.settings.startTime = 0
  assert.equal(runtime.getPropertiesAtFrame(1 * 30).text, 'One')
  assert.deepEqual(layer.settings.captions, originalCues)
})

test('native trim and split preserve subtitle phase at 2x playback', () => {
  const renderer = new Registry()
  installSourceCaptionTiming(renderer)
  const layer = captionLayer()
  layer.settings.startTime = 10
  layer.settings.speed = 2
  const video = project(layer)
  trimSelected(video, ['caption'], 10.5, 'start')
  assert.equal(
    renderer.caption(layer).getPropertiesAtFrame(11 * 30).text,
    'Two'
  )
  splitSelected(video, ['caption'], 11.5)
  const right = video.layers[1]
  assert.equal(
    renderer.caption(right).getPropertiesAtFrame(11.5 * 30).text,
    'Two'
  )
  assert.equal(
    renderer.caption(right).getPropertiesAtFrame(12 * 30).text,
    'Three'
  )
  assert.equal(right.settings.captions.length, 3)
})

test('reverse playback queries the correct source end first', () => {
  const renderer = new Registry()
  installSourceCaptionTiming(renderer)
  const layer = captionLayer()
  layer.settings.startTime = 10
  layer.settings.sourceStart = 2
  layer.settings.sourceDuration = 4
  layer.settings.speed = -2
  const runtime = renderer.caption(layer)
  assert.equal(runtime.getPropertiesAtFrame(10 * 30).text, 'Three')
  assert.equal(runtime.getPropertiesAtFrame(11 * 30).text, 'Two')
})

test('nested local frames and active-group bridge frames show identical text', () => {
  const renderer = new Registry()
  installSourceCaptionTiming(renderer)
  const child = captionLayer()
  child.settings.startTime = 4
  child.settings.sourceStart = 1
  // A parent at global 10 with sourceStart 2 maps global 13 to child-local 5.
  const composed = renderer.caption(child).getPropertiesAtFrame(5 * 30).text
  const bridgeChild = structuredClone(child)
  bridgeChild.settings.startTime += 10 - 2
  const editing = renderer
    .caption(bridgeChild)
    .getPropertiesAtFrame(13 * 30).text
  assert.equal(composed, 'Two')
  assert.equal(editing, composed)
})

test('late registration fails explicitly and can be retried before loading', () => {
  const renderer = new Registry()
  renderer.locked = true
  assert.throws(() => installSourceCaptionTiming(renderer), /already loaded/)
  renderer.locked = false
  installSourceCaptionTiming(renderer)
  assert.equal(renderer.registrations, 1)
})
