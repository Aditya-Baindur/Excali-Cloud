import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { LayerJSON, VideoJSON } from '@videoflow/react-video-editor'
import {
  canDetachAudio,
  canSplit,
  closeGaps,
  detachAudio,
  duplicateSelected,
  findLayer,
  getSelected,
  rippleDelete,
  setClipSpeed,
  splitSelected,
  trimSelected,
} from '../src/components/editor/editing'

function clip(id: string, start = 0, duration = 10, track = 0): LayerJSON {
  return {
    id,
    type: 'video',
    settings: {
      enabled: true,
      source: '/clip.mp4',
      startTime: start,
      sourceStart: 0,
      sourceDuration: duration,
      mediaDuration: 100,
    },
    properties: {},
    animations: [],
    track,
  }
}

function project(...layers: LayerJSON[]): VideoJSON {
  return {
    name: 'Test',
    duration: 60,
    width: 1920,
    height: 1080,
    fps: 30,
    backgroundColor: '#000000',
    layers,
  }
}

function group(
  id: string,
  children: LayerJSON[],
  start = 0,
  duration = 10
): LayerJSON {
  return { ...clip(id, start, duration), type: 'group', children }
}

test('split a trimmed 2x clip at source time, preserving easing and external transitions', () => {
  const layer = clip('a', 5, 12)
  layer.settings.sourceStart = 20
  layer.settings.sourceEnd = 68
  layer.settings.speed = 2
  layer.animations = [
    {
      property: 'opacity',
      keyframes: [
        { time: 20, value: 0, easing: 'easeIn' },
        { time: 32, value: 1 },
      ],
    },
  ]
  layer.transitionIn = { transition: 'fade', duration: 4 }
  layer.transitionOut = { transition: 'fade', duration: 4 }
  const originalKeys = structuredClone(layer.animations)
  const video = project(layer)
  const [newId] = splitSelected(video, ['a'], 7)
  const right = findLayer(video, newId)!
  assert.equal(video.layers.length, 2)
  assert.equal(layer.settings.sourceStart, 20)
  assert.equal(layer.settings.sourceDuration, 4)
  assert.equal(right.settings.startTime, 7)
  assert.equal(right.settings.sourceStart, 24)
  assert.equal(right.settings.sourceDuration, 8)
  assert.equal(layer.settings.sourceEnd, undefined)
  assert.equal(right.settings.sourceEnd, undefined)
  assert.deepEqual(layer.animations, originalKeys)
  assert.deepEqual(right.animations, originalKeys)
  assert.notEqual(right.animations, layer.animations)
  assert.equal(layer.transitionIn?.duration, 2)
  assert.equal(layer.transitionOut, undefined)
  assert.equal(right.transitionIn, undefined)
  assert.equal(right.transitionOut?.duration, 4)
})

test('reverse split assigns high source range to left and low range to right', () => {
  const layer = clip('reverse', 3, 12)
  layer.settings.sourceStart = 20
  layer.settings.speed = -2
  const video = project(layer)
  const [id] = splitSelected(video, ['reverse'], 5)
  const right = findLayer(video, id)!
  assert.equal(layer.settings.sourceStart, 28)
  assert.equal(layer.settings.sourceDuration, 4)
  assert.equal(right.settings.sourceStart, 20)
  assert.equal(right.settings.sourceDuration, 8)
  assert.equal(right.settings.startTime, 5)
  assert.equal(right.settings.speed, -2)
})

test('nested playhead is translated through trimmed ancestor source offsets', () => {
  const innerClip = clip('clip', 4, 8)
  const inner = group('inner', [innerClip], 5, 20)
  inner.settings.sourceStart = 1
  const outer = group('outer', [inner], 10, 30)
  outer.settings.sourceStart = 2
  const video = project(outer)
  assert.equal(canSplit(video, ['clip'], 18), true)
  const [id] = splitSelected(video, ['clip'], 18)
  assert.equal(innerClip.settings.sourceDuration, 2)
  assert.equal(findLayer(video, id)?.settings.startTime, 6)
  assert.equal(findLayer(video, id)?.settings.sourceStart, 2)
})

test('split rejects endpoints, subframe pieces, groups, and non-unit-speed ancestors', () => {
  const layer = clip('a')
  const spedGroup = group('g', [clip('nested')])
  spedGroup.settings.speed = 2
  const video = project(layer, spedGroup)
  for (const time of [
    0,
    10,
    -1,
    0.001,
    9.999,
    Number.NaN,
    Number.POSITIVE_INFINITY,
  ]) {
    assert.equal(canSplit(video, ['a'], time), false)
    assert.deepEqual(splitSelected(video, ['a'], time), [])
  }
  assert.equal(canSplit(video, ['g', 'nested'], 5), false)
  assert.equal(canSplit(video, ['nested'], 5), false)
  assert.equal(canSplit(video, ['a'], 1 / 30), true)
  assert.equal(video.layers.length, 2)
})

test('duplicate appends a selection block without collisions or shared mutable children', () => {
  const one = clip('one', 2, 3, 0)
  const two = group('two', [clip('child', 1, 2)], 6, 5)
  two.track = 1
  const video = project(one, two, clip('tail', 20, 2, 0))
  const [copyOneId, copyTwoId] = duplicateSelected(video, [
    'one',
    'two',
    'child',
  ])
  const copyOne = findLayer(video, copyOneId)!
  const copyTwo = findLayer(video, copyTwoId)!
  assert.equal(copyOne.settings.startTime, 22)
  assert.equal(copyTwo.settings.startTime, 26)
  assert.equal(copyTwo.track, 1)
  assert.notEqual(copyTwo.children![0].id, 'child')
  assert.equal(copyTwo.children![0].settings.startTime, 1)
  copyTwo.children![0].properties.volume = 0.2
  assert.equal(two.children![0].properties.volume, undefined)
  assert.equal(video.layers.length, 5)
})

test('duplicating inside a group extends ancestors to keep the new clip visible', () => {
  const inner = group('inner', [clip('a', 0, 4)], 2, 4)
  const outer = group('outer', [inner], 10, 6)
  const video = project(outer)
  const [id] = duplicateSelected(video, ['a'])
  assert.equal(findLayer(video, id)?.settings.startTime, 4)
  assert.equal(inner.settings.sourceDuration, 8)
  assert.equal(outer.settings.sourceDuration, 10)
})

test('ripple delete unions selected time across tracks instead of subtracting twice', () => {
  const video = project(
    clip('before', 0, 1),
    clip('a', 2, 2),
    clip('b', 2, 3, 1),
    clip('later', 5, 3),
    clip('later-other', 7, 3, 1)
  )
  rippleDelete(video, ['a', 'b'])
  assert.deepEqual(
    video.layers.map((layer) => layer.id),
    ['before', 'later', 'later-other']
  )
  assert.equal(findLayer(video, 'later')?.settings.startTime, 2)
  assert.equal(findLayer(video, 'later-other')?.settings.startTime, 4)
})

test('ripple delete retains occupied time on unselected tracks and preserves sync', () => {
  const overlay = clip('overlay', 3, 1, 1)
  const later = clip('later', 5, 3)
  const video = project(clip('delete', 2, 3), overlay, later)
  rippleDelete(video, ['delete'])
  assert.equal(overlay.settings.startTime, 2)
  assert.equal(overlay.settings.sourceDuration, 1)
  assert.equal(later.settings.startTime, 3)
  const background = clip('background', 0, 20, 2)
  const withAudio = project(
    clip('delete', 2, 3),
    background,
    clip('tail', 5, 3)
  )
  rippleDelete(withAudio, ['delete'])
  assert.equal(findLayer(withAudio, 'tail')?.settings.startTime, 5)
  assert.equal(background.settings.startTime, 0)
})

test('ripple delete leaves pre-existing gaps and supports selected nested clips', () => {
  const nested = group(
    'group',
    [clip('a', 2, 2), clip('b', 8, 2), clip('tail', 12, 3)],
    10,
    20
  )
  const video = project(nested)
  rippleDelete(video, ['a', 'b'])
  assert.equal(findLayer(video, 'tail')?.settings.startTime, 8)
  assert.equal(nested.settings.startTime, 10)
  assert.equal(nested.children?.length, 1)
})

test('close gaps operates on selected tracks and preserves overlapping clusters', () => {
  const video = project(
    clip('a', 2, 4),
    clip('overlap', 4, 4),
    clip('c', 10, 2),
    clip('other', 7, 2, 1)
  )
  closeGaps(video, ['a'])
  assert.equal(findLayer(video, 'a')?.settings.startTime, 0)
  assert.equal(findLayer(video, 'overlap')?.settings.startTime, 2)
  assert.equal(findLayer(video, 'c')?.settings.startTime, 6)
  assert.equal(findLayer(video, 'other')?.settings.startTime, 7)
  closeGaps(video)
  assert.equal(findLayer(video, 'other')?.settings.startTime, 0)
})

test('close gaps starts nested content at its parent trimmed source origin', () => {
  const nested = group('g', [clip('a', 5, 2), clip('b', 10, 2)])
  nested.settings.sourceStart = 2
  const video = project(nested)
  closeGaps(video, ['a'])
  assert.equal(findLayer(video, 'a')?.settings.startTime, 2)
  assert.equal(findLayer(video, 'b')?.settings.startTime, 4)
})

test('forward trims preserve source range and animation phase at accelerated speed', () => {
  const layer = clip('a', 4, 12)
  layer.settings.sourceStart = 8
  layer.settings.speed = 2
  layer.animations = [
    { property: 'volume', keyframes: [{ time: 9, value: 0.5 }] },
  ]
  const video = project(layer)
  trimSelected(video, ['a'], 5, 'start')
  assert.equal(layer.settings.startTime, 5)
  assert.equal(layer.settings.sourceStart, 10)
  assert.equal(layer.settings.sourceDuration, 10)
  trimSelected(video, ['a'], 8, 'end')
  assert.equal(layer.settings.sourceStart, 10)
  assert.equal(layer.settings.sourceDuration, 6)
  assert.equal(layer.animations[0].keyframes[0].time, 9)
})

test('reverse trims discard the correct end of the source interval', () => {
  const layer = clip('a', 4, 12)
  layer.settings.sourceStart = 8
  layer.settings.speed = -2
  const video = project(layer)
  trimSelected(video, ['a'], 5, 'start')
  assert.equal(layer.settings.sourceStart, 8)
  assert.equal(layer.settings.sourceDuration, 10)
  trimSelected(video, ['a'], 8, 'end')
  assert.equal(layer.settings.sourceStart, 12)
  assert.equal(layer.settings.sourceDuration, 6)
})

test('trim cannot extend a clip or leave a subframe clip', () => {
  const video = project(clip('a', 3, 2))
  const before = structuredClone(video)
  for (const edge of ['start', 'end'] as const) {
    for (const time of [0, 3, 5, 8, Number.NaN])
      trimSelected(video, ['a'], time, edge)
  }
  trimSelected(video, ['a'], 4.999, 'start')
  trimSelected(video, ['a'], 3.001, 'end')
  assert.deepEqual(video, before)
})

test('detach preserves trimmed audio offset, reverse speed, gain, pan and their keyframes', () => {
  const videoClip = clip('a', 7, 6, 2)
  videoClip.settings.sourceStart = 20
  videoClip.settings.speed = -2
  videoClip.properties = {
    volume: 0.4,
    pan: -0.5,
    pitch: 1.2,
    opacity: 0.5,
    mute: false,
  }
  videoClip.animations = [
    {
      property: 'volume',
      keyframes: [
        { time: 20, value: 0 },
        { time: 26, value: 1 },
      ],
    },
    { property: 'opacity', keyframes: [{ time: 20, value: 0 }] },
  ]
  const video = project(videoClip, clip('other', 0, 4, 4))
  assert.equal(canDetachAudio(video, ['a']), true)
  const [id] = detachAudio(video, ['a'])
  const audio = findLayer(video, id)!
  assert.equal(audio.type, 'audio')
  assert.equal(audio.track, 5)
  assert.deepEqual(audio.settings, videoClip.settings)
  assert.deepEqual(audio.properties, {
    volume: 0.4,
    pan: -0.5,
    pitch: 1.2,
    mute: false,
  })
  assert.deepEqual(audio.animations, [videoClip.animations[0]])
  assert.equal(videoClip.properties.mute, true)
  assert.equal(canDetachAudio(video, ['a']), false)
  assert.deepEqual(detachAudio(video, ['a']), [])
  audio.settings.sourceStart = 0
  audio.animations[0].keyframes[0].value = 100
  assert.equal(videoClip.settings.sourceStart, 20)
  assert.equal(videoClip.animations[0].keyframes[0].value, 0)
})

test('speed changes ripple same-track clips by each duration delta while retaining gaps', () => {
  const a = clip('a', 1, 8)
  a.settings.sourceStart = 10
  a.animations = [{ property: 'volume', keyframes: [{ time: 10, value: 0.3 }] }]
  const b = clip('b', 12, 4)
  const tail = clip('tail', 18, 2)
  const other = clip('other', 12, 8, 1)
  const video = project(a, b, tail, other)
  setClipSpeed(video, ['a', 'b'], 2)
  assert.equal(a.settings.startTime, 1)
  assert.equal(a.settings.sourceStart, 10)
  assert.equal(a.settings.sourceDuration, 8)
  assert.equal(a.animations[0].keyframes[0].time, 10)
  assert.equal(b.settings.startTime, 8)
  assert.equal(tail.settings.startTime, 12)
  assert.equal(other.settings.startTime, 12)
  setClipSpeed(video, ['a'], 0.5)
  assert.equal(b.settings.startTime, 20)
  assert.equal(tail.settings.startTime, 24)
})

test('invalid speeds and unsupported layer types are no-ops', () => {
  const video = project(clip('a'), { ...clip('title'), type: 'text' })
  const before = structuredClone(video)
  for (const speed of [0, Number.NaN, Infinity, Number.MIN_VALUE, 10000])
    setClipSpeed(video, ['a'], speed)
  setClipSpeed(video, ['title'], 2)
  assert.deepEqual(video, before)
})

test('selection lookup ignores stale IDs and avoids selecting descendants twice', () => {
  const video = project(group('g', [clip('child')]))
  assert.equal(findLayer(video, 'child')?.id, 'child')
  assert.equal(findLayer(video, 'missing'), undefined)
  assert.deepEqual(
    getSelected(video, ['missing', 'g', 'child', 'g']).map((layer) => layer.id),
    ['g']
  )
  assert.deepEqual(duplicateSelected(video, ['missing']), [])
  assert.deepEqual(splitSelected(video, ['missing'], 5), [])
})
