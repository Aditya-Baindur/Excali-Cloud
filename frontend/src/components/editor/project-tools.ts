import type { CaptionEntry, LayerJSON, VideoJSON } from '@videoflow/core'

export type CaptionCue = CaptionEntry
export const MAX_PROJECT_BACKUP_BYTES = 150 * 1024 * 1024
const MAX_ASSET_BYTES = 50 * 1024 * 1024
const MAX_TOTAL_ASSET_BYTES = 100 * 1024 * 1024
const MAX_TIME = 24 * 60 * 60
const MAX_CUES = 5_000
const FORMAT = 'excalicloud-video-project'
const ASSET_PREFIX = 'excalicloud-asset:'
const BOARD_SOURCE =
  /^\/api\/workspace\/boards\/[a-zA-Z0-9_-]+\/videos\/[a-zA-Z0-9_-]+\/content$/
const MEDIA_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'image/avif',
  'image/bmp',
  'audio/mpeg',
  'audio/mp3',
  'audio/mp4',
  'audio/aac',
  'audio/wav',
  'audio/x-wav',
  'audio/ogg',
  'audio/webm',
  'audio/flac',
  'audio/x-m4a',
  'video/mp4',
  'video/webm',
  'video/ogg',
  'video/quicktime',
])
const LAYER_TYPES = new Set([
  'video',
  'audio',
  'image',
  'text',
  'captions',
  'shape',
  'group',
])
const EASINGS = new Set(['step', 'linear', 'easeIn', 'easeOut', 'easeInOut'])
const FORBIDDEN_KEYS =
  /^(?:__proto__|prototype|constructor|authorization|cookie|token|access[_-]?token|refresh[_-]?token|session[_-]?token|secret|password|api[_-]?key)$/i

function fail(message: string): never {
  throw new Error(message)
}
function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    fail(`${label} must be an object.`)
  const prototype = Object.getPrototypeOf(value)
  if (prototype !== Object.prototype && prototype !== null)
    fail(`${label} must contain plain JSON.`)
  return value as Record<string, unknown>
}
function number(value: unknown, label: string, min = 0, max = MAX_TIME) {
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    value < min ||
    value > max
  )
    fail(`${label} must be between ${min} and ${max}.`)
  return value
}
function string(value: unknown, label: string, max = 10_000) {
  if (typeof value !== 'string' || !value.trim() || value.length > max)
    fail(`${label} must contain 1–${max} characters.`)
  return value
}
function keys(
  value: Record<string, unknown>,
  allowed: string[],
  label: string
) {
  for (const key of Object.keys(value))
    if (!allowed.includes(key)) fail(`Unsupported ${label} field: ${key}.`)
}
function array(value: unknown, label: string, max: number): unknown[] {
  if (!Array.isArray(value) || value.length > max)
    fail(`${label} must be an array with at most ${max} entries.`)
  return value
}

// Copy only JSON values, reject prototype pollution and credentials before any
// object is handed to the editor. Media sources are validated separately.
function cloneJson(
  value: unknown,
  depth = 0,
  budget = { remaining: 100_000 }
): unknown {
  if (depth > 32 || --budget.remaining < 0)
    fail('The project is too complex to import.')
  if (value === null || typeof value === 'boolean') return value
  if (typeof value === 'number')
    return number(value, 'Numeric value', -1e9, 1e9)
  if (typeof value === 'string') {
    if (value.length > 100_000) fail('A project field is too large.')
    if (
      /^Bearer\s+/i.test(value) ||
      /^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(value)
    )
      fail('Project backups cannot contain authentication tokens.')
    return value
  }
  if (Array.isArray(value))
    return value.map((entry) => cloneJson(entry, depth + 1, budget))
  const object = record(value, 'Project value')
  const result: Record<string, unknown> = {}
  for (const [key, entry] of Object.entries(object)) {
    if (FORBIDDEN_KEYS.test(key))
      fail('Project backups cannot contain credentials or unsafe object keys.')
    result[key] = cloneJson(entry, depth + 1, budget)
  }
  return result
}

function validateCues(input: unknown): CaptionCue[] {
  return array(input, 'Captions', MAX_CUES * 2).map((item) => {
    const cue = record(item, 'Caption')
    keys(cue, ['caption', 'startTime', 'endTime'], 'caption')
    const caption = string(cue.caption, 'Caption text')
    const startTime = number(cue.startTime, 'Caption start')
    const endTime = number(cue.endTime, 'Caption end')
    if (endTime <= startTime) fail('A caption must end after it starts.')
    return { caption, startTime, endTime }
  })
}

function validateTracks(input: unknown): NonNullable<VideoJSON['tracks']> {
  return array(input, 'Tracks', 2_000).map((input) => {
    const track = record(input, 'Track')
    keys(track, ['name', 'enabled'], 'track')
    if (typeof track.enabled !== 'boolean')
      fail('Track enabled must be true or false.')
    return {
      name: string(track.name, 'Track name', 200),
      enabled: track.enabled,
    }
  })
}

type ResolveSource = (source: string, type: string) => string
function validateProject(
  input: unknown,
  resolveSource: ResolveSource
): VideoJSON {
  const project = record(input, 'Project')
  keys(
    project,
    [
      'name',
      'duration',
      'width',
      'height',
      'fps',
      'backgroundColor',
      'layers',
      'tracks',
    ],
    'project'
  )
  const ids = new Set<string>()
  let layerCount = 0
  const validateLayer = (input: unknown, depth = 0): LayerJSON => {
    if (depth > 16 || ++layerCount > 2_000)
      fail('Projects support up to 2,000 layers and 16 nested groups.')
    const layer = record(input, 'Layer')
    keys(
      layer,
      [
        'id',
        'type',
        'settings',
        'properties',
        'animations',
        'track',
        'transitionIn',
        'transitionOut',
        'effects',
        'children',
        'tracks',
      ],
      'layer'
    )
    const id = string(layer.id, 'Layer ID', 200)
    if (ids.has(id)) fail('Every layer must have a unique ID.')
    ids.add(id)
    const type = string(layer.type, 'Layer type', 30)
    if (!LAYER_TYPES.has(type)) fail(`Unsupported layer type: ${type}.`)
    const rawSettings = record(layer.settings, 'Layer settings')
    const { source, ...otherSettings } = rawSettings
    const settings = record(cloneJson(otherSettings), 'Layer settings')
    if (typeof settings.enabled !== 'boolean')
      fail('Layer enabled must be true or false.')
    number(settings.startTime, 'Layer start')
    number(settings.sourceDuration, 'Layer duration', Number.EPSILON)
    for (const key of ['sourceStart', 'sourceEnd', 'mediaDuration'])
      if (settings[key] !== undefined) number(settings[key], key)
    if (settings.speed !== undefined) {
      const speed = number(settings.speed, 'Playback speed', -100, 100)
      if (Math.abs(speed) < 0.01)
        fail('Playback speed must have a magnitude between 0.01 and 100.')
    }
    if (['video', 'audio', 'image'].includes(type))
      settings.source = resolveSource(
        string(source, 'Media source', MAX_PROJECT_BACKUP_BYTES),
        type
      )
    else if (source !== undefined)
      fail('Only image, audio, or video layers can have a media source.')
    if (type === 'captions') settings.captions = validateCues(settings.captions)
    if (
      type === 'shape' &&
      settings.shapeType !== undefined &&
      !['rectangle', 'ellipse', 'polygon', 'star'].includes(
        String(settings.shapeType)
      )
    )
      fail('Unsupported shape type.')
    const properties = record(
      cloneJson(record(layer.properties, 'Layer properties')),
      'Layer properties'
    )
    const animations = array(layer.animations, 'Animations', 100).map(
      (input) => {
        const animation = record(cloneJson(input), 'Animation')
        keys(animation, ['property', 'keyframes', 'easing'], 'animation')
        string(animation.property, 'Animated property', 100)
        if (
          animation.easing !== undefined &&
          !EASINGS.has(String(animation.easing))
        )
          fail('Unsupported animation easing.')
        let previous = -1
        for (const input of array(animation.keyframes, 'Keyframes', 10_000)) {
          const keyframe = record(input, 'Keyframe')
          keys(keyframe, ['time', 'value', 'easing'], 'keyframe')
          const time = number(keyframe.time, 'Keyframe time')
          if (time < previous || !Object.hasOwn(keyframe, 'value'))
            fail('Keyframes must have values and be sorted by time.')
          if (
            keyframe.easing !== undefined &&
            !EASINGS.has(String(keyframe.easing))
          )
            fail('Unsupported keyframe easing.')
          previous = time
        }
        return animation
      }
    )
    const result: Record<string, unknown> = {
      id,
      type,
      settings,
      properties,
      animations,
    }
    if (layer.track !== undefined) {
      const track = number(layer.track, 'Track number', 0, 1_999)
      if (!Number.isInteger(track)) fail('Track numbers must be integers.')
      result.track = track
    }
    for (const key of ['transitionIn', 'transitionOut']) {
      if (layer[key] === undefined) continue
      const transition = record(cloneJson(layer[key]), 'Transition')
      string(transition.transition, 'Transition name', 100)
      number(transition.duration, 'Transition duration')
      if (
        transition.easing !== undefined &&
        !EASINGS.has(String(transition.easing))
      )
        fail('Unsupported transition easing.')
      result[key] = transition
    }
    if (layer.effects !== undefined)
      result.effects = array(layer.effects, 'Effects', 32).map((input) => {
        const effect = record(cloneJson(input), 'Effect')
        string(effect.effect, 'Effect name', 100)
        if (effect.enabled !== undefined && typeof effect.enabled !== 'boolean')
          fail('Effect enabled must be true or false.')
        return effect
      })
    if (type === 'group') {
      result.children = array(
        layer.children ?? [],
        'Group children',
        2_000
      ).map((child) => validateLayer(child, depth + 1))
      // The editor stores track names/mute state on groups as well as the root,
      // although the core LayerJSON type does not yet describe this field.
      if (layer.tracks !== undefined)
        result.tracks = validateTracks(layer.tracks)
    } else {
      if (layer.children !== undefined)
        fail('Only groups can contain child layers.')
      if (layer.tracks !== undefined)
        fail('Only groups can contain nested tracks.')
    }
    return result as LayerJSON
  }
  const video: VideoJSON = {
    name: string(project.name, 'Project name', 240),
    width: number(project.width, 'Project width', 16, 7_680),
    height: number(project.height, 'Project height', 16, 7_680),
    fps: number(project.fps, 'Frame rate', 1, 120),
    duration: number(project.duration, 'Project duration', Number.EPSILON),
    backgroundColor: string(project.backgroundColor, 'Background color', 100),
    layers: array(project.layers, 'Layers', 2_000).map((layer) =>
      validateLayer(layer)
    ),
  }
  if (!Number.isInteger(video.width) || !Number.isInteger(video.height))
    fail('Project dimensions must be whole pixels.')
  if (project.tracks !== undefined)
    video.tracks = validateTracks(project.tracks)
  return video
}

function boardSource(source: string, type: string) {
  if (!['video', 'audio'].includes(type) || !BOARD_SOURCE.test(source))
    fail(
      'Media must be embedded in the backup or use an authenticated board video URL without tokens.'
    )
  return source
}

/** Validate a plain project containing only permissioned board media references. */
export function validateVideoProject(input: unknown): VideoJSON {
  return validateProject(input, boardSource)
}

function validateMime(type: string, layerType?: string) {
  if (!MEDIA_TYPES.has(type))
    fail(`Unsupported embedded media type: ${type || 'unknown'}.`)
  // Detaching a soundtrack keeps the original video container as its source.
  const detachedAudio = layerType === 'audio' && type.startsWith('video/')
  if (layerType && !type.startsWith(`${layerType}/`) && !detachedAudio)
    fail(`An ${layerType} layer cannot use ${type} media.`)
}
function decodeAsset(data: unknown, type: unknown) {
  const mimeType = string(type, 'Asset media type', 100).toLowerCase()
  validateMime(mimeType)
  if (
    typeof data !== 'string' ||
    !data.length ||
    data.length > Math.ceil(MAX_ASSET_BYTES / 3) * 4 ||
    data.length % 4 !== 0 ||
    !/^[A-Za-z0-9+/]*={0,2}$/.test(data)
  )
    fail('An embedded asset has invalid or oversized base64 data.')
  const binary = atob(data)
  if (!binary.length || binary.length > MAX_ASSET_BYTES)
    fail('Each embedded asset must be between 1 byte and 50 MB.')
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0))
  return new Blob([bytes], { type: mimeType })
}
async function encodeAsset(blob: Blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  const chunks: string[] = []
  for (let offset = 0; offset < bytes.length; offset += 32_768)
    chunks.push(String.fromCharCode(...bytes.subarray(offset, offset + 32_768)))
  return btoa(chunks.join(''))
}

/**
 * Embed local images/audio/video from the supplied asset registry. No network
 * requests are made. Board video URLs retain their normal account permissions.
 */
export async function exportProjectBackup(
  video: VideoJSON,
  assets: Map<string, Blob>
): Promise<Blob> {
  const embedded = new Map<string, { id: string; blob: Blob }>()
  let total = 0
  const project = validateProject(video, (source, layerType) => {
    if (BOARD_SOURCE.test(source)) return boardSource(source, layerType)
    const existing = embedded.get(source)
    if (existing) {
      validateMime(existing.blob.type, layerType)
      return ASSET_PREFIX + existing.id
    }
    let blob = assets.get(source)
    if (!blob && source.startsWith('data:')) {
      const match = /^data:([^;,]+);base64,([\s\S]*)$/.exec(source)
      if (!match) fail('Local media data URLs must use base64 encoding.')
      blob = decodeAsset(match[2], match[1])
    }
    if (!blob || (!source.startsWith('blob:') && !source.startsWith('data:')))
      fail(
        'A local media file is missing. Reimport it before saving a project backup.'
      )
    validateMime(blob.type, layerType)
    if (!blob.size || blob.size > MAX_ASSET_BYTES)
      fail('Each local asset must be between 1 byte and 50 MB.')
    total += blob.size
    if (total > MAX_TOTAL_ASSET_BYTES)
      fail('Project backups support up to 100 MB of embedded media.')
    const id = `asset-${embedded.size + 1}`
    embedded.set(source, { id, blob })
    return ASSET_PREFIX + id
  })
  const encoded = []
  for (const { id, blob } of embedded.values())
    encoded.push({ id, mimeType: blob.type, data: await encodeAsset(blob) })
  const backup = new Blob(
    [JSON.stringify({ format: FORMAT, version: 1, project, assets: encoded })],
    { type: 'application/json' }
  )
  if (backup.size > MAX_PROJECT_BACKUP_BYTES)
    fail('This project backup is larger than 150 MB.')
  return backup
}

export type ImportedProject = {
  video: VideoJSON
  assets: Map<string, Blob>
  warnings: string[]
}

/** Import a versioned backup. The caller owns and must eventually revoke URLs. */
export async function importProjectBackup(
  input: string | Blob
): Promise<ImportedProject> {
  if (
    (typeof input === 'string' ? input.length : input.size) >
    MAX_PROJECT_BACKUP_BYTES
  )
    fail('This project backup is larger than 150 MB.')
  let parsed: unknown
  try {
    parsed = JSON.parse(typeof input === 'string' ? input : await input.text())
  } catch {
    fail('Choose a valid project backup JSON file.')
  }
  const bundle = record(parsed, 'Project backup')
  keys(bundle, ['format', 'version', 'project', 'assets'], 'backup')
  if (bundle.format !== FORMAT || bundle.version !== 1)
    fail(
      'Unsupported project backup format or version. Import an Excalicloud version 1 backup.'
    )
  const blobs = new Map<string, Blob>()
  let total = 0
  for (const input of array(bundle.assets, 'Embedded assets', 2_000)) {
    const asset = record(input, 'Embedded asset')
    keys(asset, ['id', 'mimeType', 'data'], 'asset')
    const id = string(asset.id, 'Asset ID', 100)
    if (!/^asset-[1-9]\d*$/.test(id) || blobs.has(id))
      fail('Embedded asset IDs must be unique asset numbers.')
    const blob = decodeAsset(asset.data, asset.mimeType)
    total += blob.size
    if (total > MAX_TOTAL_ASSET_BYTES)
      fail('Project backups support up to 100 MB of embedded media.')
    blobs.set(id, blob)
  }
  const references = new Set<string>()
  let permissioned = false
  const project = validateProject(bundle.project, (source, type) => {
    if (source.startsWith(ASSET_PREFIX)) {
      const id = source.slice(ASSET_PREFIX.length)
      const blob = blobs.get(id)
      if (!blob) fail('The project references a missing embedded asset.')
      validateMime(blob.type, type)
      references.add(id)
      return source
    }
    permissioned = true
    return boardSource(source, type)
  })
  if (references.size !== blobs.size)
    fail('The backup contains unreferenced media assets.')
  const assets = new Map<string, Blob>()
  const urls = new Map<string, string>()
  try {
    for (const [id, blob] of blobs) {
      const url = URL.createObjectURL(blob)
      assets.set(url, blob)
      urls.set(ASSET_PREFIX + id, url)
    }
    const restore = (layers: LayerJSON[]) => {
      for (const layer of layers) {
        if (
          typeof layer.settings.source === 'string' &&
          urls.has(layer.settings.source)
        )
          layer.settings.source = urls.get(layer.settings.source)
        if (layer.children) restore(layer.children)
      }
    }
    restore(project.layers)
    return {
      video: project,
      assets,
      warnings: permissioned
        ? [
            'Board video clips require access to their original board. Local images and audio are included in this backup.',
          ]
        : [],
    }
  } catch (error) {
    for (const url of assets.keys()) URL.revokeObjectURL(url)
    throw error
  }
}

export function projectBackupFileName(name: string) {
  return `${(name.replace(/[<>:"/\\|?*\u0000-\u001f\u007f]/g, '_').trim() || 'Video project').slice(0, 200)}.excalicloud.json`
}

function timestamp(value: string) {
  const match = /^(?:(\d{2,}):)?(\d{2}):(\d{2})[.,](\d{3})$/.exec(value)
  if (!match || Number(match[2]) > 59 || Number(match[3]) > 59)
    fail(`Invalid subtitle timestamp: ${value}.`)
  return number(
    Number(match[1] ?? 0) * 3600 +
      Number(match[2]) * 60 +
      Number(match[3]) +
      Number(match[4]) / 1000,
    'Subtitle timestamp'
  )
}
function plainCaption(value: string) {
  const entities: Record<string, string> = {
    amp: '&',
    lt: '<',
    gt: '>',
    quot: '"',
    apos: "'",
    nbsp: ' ',
  }
  return value
    .replace(/<[^>]*>/g, '')
    .replace(
      /&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi,
      (entity, code: string) => {
        if (!code.startsWith('#')) return entities[code.toLowerCase()] ?? entity
        const point =
          code[1].toLowerCase() === 'x'
            ? parseInt(code.slice(2), 16)
            : Number(code.slice(1))
        return point > 0 &&
          point <= 0x10ffff &&
          !(point >= 0xd800 && point <= 0xdfff)
          ? String.fromCodePoint(point)
          : '\uFFFD'
      }
    )
    .trim()
}

/** Parse SRT or WebVTT into plain-text native caption entries, in seconds. */
export function parseSubtitles(text: string): CaptionCue[] {
  if (text.length > 2 * 1024 * 1024)
    fail('Subtitle files must be 2 MB or smaller.')
  const blocks = text
    .replace(/^\uFEFF/, '')
    .replace(/\r\n?/g, '\n')
    .trim()
    .split(/\n[\t ]*\n+/)
  const vtt = /^WEBVTT(?:[\t ].*)?(?:\n|$)/.test(blocks[0] ?? '')
  if (vtt) blocks.shift()
  const cues: CaptionCue[] = []
  for (const block of blocks) {
    if (
      !block.trim() ||
      (vtt &&
        /^(?:NOTE(?:[\t ]|\n|$)|STYLE(?:\n|$)|REGION(?:\n|$))/.test(block))
    )
      continue
    const lines = block.split('\n')
    const timingIndex = lines[0]?.includes('-->') ? 0 : 1
    const timing = /^(\S+)\s+-->\s+(\S+)(?:\s+.*)?$/.exec(
      lines[timingIndex] ?? ''
    )
    if (!timing)
      fail(
        `Subtitle cue ${cues.length + 1} has invalid timing. Use an SRT or WebVTT file.`
      )
    const startTime = timestamp(timing[1])
    const endTime = timestamp(timing[2])
    const caption = plainCaption(lines.slice(timingIndex + 1).join('\n'))
    if (!caption) fail(`Subtitle cue ${cues.length + 1} has no caption text.`)
    cues.push({ caption, startTime, endTime })
    if (cues.length > MAX_CUES) fail('Subtitle files support up to 5,000 cues.')
  }
  if (!cues.length) fail('No subtitle cues were found.')
  return validateCues(cues).sort(
    (a, b) => a.startTime - b.startTime || a.endTime - b.endTime
  )
}

/** Combine overlapping cue text because VideoFlow renders the first active cue. */
function mergeOverlaps(cues: CaptionCue[]): CaptionCue[] {
  const events = cues
    .flatMap((cue, index) => [
      { time: cue.startTime, index, start: true },
      { time: cue.endTime, index, start: false },
    ])
    .sort((a, b) => a.time - b.time)
  const active = new Set<number>()
  const merged: CaptionCue[] = []
  let index = 0
  while (index < events.length) {
    const startTime = events[index].time
    while (index < events.length && events[index].time === startTime) {
      const event = events[index++]
      if (event.start) active.add(event.index)
      else active.delete(event.index)
    }
    const endTime = events[index]?.time
    if (endTime === undefined || !active.size || endTime <= startTime) continue
    const caption = [...active].map((index) => cues[index].caption).join('\n')
    if (caption.length > 10_000) fail('Too much overlapping caption text.')
    const previous = merged.at(-1)
    if (previous?.caption === caption && previous.endTime === startTime)
      previous.endTime = endTime
    else merged.push({ caption, startTime, endTime })
  }
  return merged
}

export function captionsLayerFromCues(
  cues: CaptionCue[],
  options: { track?: number; fontSize?: number; id?: string } = {}
): LayerJSON {
  const validated = validateCues(cues)
  if (!validated.length || validated.length > MAX_CUES)
    fail('Choose between 1 and 5,000 caption cues.')
  const track = number(options.track ?? 0, 'Caption track', 0, 1_999)
  if (!Number.isInteger(track)) fail('Caption track must be an integer.')
  return {
    id: options.id ?? crypto.randomUUID(),
    type: 'captions',
    track,
    settings: {
      enabled: true,
      startTime: 0,
      sourceStart: 0,
      sourceDuration: Math.max(...validated.map((cue) => cue.endTime)),
      captions: mergeOverlaps(validated),
      maxCharsPerLine: 48,
      maxLines: 3,
    },
    properties: {
      fontSize: number(options.fontSize ?? 3.2, 'Caption font size', 0.1, 100),
      fontFamily: 'Arial',
      color: '#ffffff',
      textAlign: 'center',
      position: [0.5, 0.88],
      textShadow: true,
      textShadowColor: '#000000',
      textShadowBlur: 0.15,
    },
    animations: [],
  }
}
