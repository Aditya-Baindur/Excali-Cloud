import {
  AudioLayer,
  CaptionsLayer,
  GroupLayer,
  ImageLayer,
  ShapeLayer,
  TextLayer,
  VideoLayer,
  type LayerJSON,
  type VideoJSON,
} from '@videoflow/core'

export type ExportResolution = 'original' | '720' | '1080' | '2160'
export type ExportSettings = {
  resolution: ExportResolution
  fps: number | 'project'
}

// Read unit support from the renderer's core definitions. Text, source URLs,
// effect metadata and unitless properties must never be treated as CSS lengths.
const pixelProperties = new Map(
  [
    TextLayer,
    CaptionsLayer,
    VideoLayer,
    ImageLayer,
    ShapeLayer,
    GroupLayer,
    AudioLayer,
  ].map((layer) => [
    layer.type,
    new Set(
      Object.entries(layer.propertiesDefinition)
        .filter(([, definition]) => definition.units?.includes('px'))
        .map(([property]) => property)
    ),
  ])
)

function scalePixelLength(value: unknown, scale: number): unknown {
  if (Array.isArray(value))
    return value.map((entry) => scalePixelLength(entry, scale))
  if (typeof value !== 'string') return value
  const match = /^(-?(?:\d+(?:\.\d*)?|\.\d+))px$/.exec(value)
  if (!match) return value
  const scaled = Number(match[1]) * scale
  if (!Number.isFinite(scaled))
    throw new Error('An export length is too large.')
  return `${Number(scaled.toFixed(8))}px`
}

function scaleLayer(layer: LayerJSON, scale: number) {
  const properties = pixelProperties.get(layer.type)
  for (const property of properties ?? []) {
    if (Object.hasOwn(layer.properties, property))
      layer.properties[property] = scalePixelLength(
        layer.properties[property],
        scale
      )
  }
  for (const animation of layer.animations) {
    if (!properties?.has(animation.property)) continue
    for (const keyframe of animation.keyframes)
      keyframe.value = scalePixelLength(keyframe.value, scale)
  }
  layer.children?.forEach((child) => scaleLayer(child, scale))
}

/** Prepare an independent export document without changing its timeline or source media. */
export function prepareExportVideo(
  video: VideoJSON,
  settings: ExportSettings
): VideoJSON {
  if (
    ![video.width, video.height].every(
      (value) => Number.isFinite(value) && value > 0
    )
  )
    throw new Error('Project dimensions must be positive numbers.')
  if (!['original', '720', '1080', '2160'].includes(settings.resolution))
    throw new Error('Choose an export resolution.')
  const fps = settings.fps === 'project' ? video.fps : settings.fps
  if (!Number.isFinite(fps) || fps <= 0)
    throw new Error('Export frame rate must be positive.')

  const scale =
    settings.resolution === 'original'
      ? 1
      : Number(settings.resolution) / Math.min(video.width, video.height)
  const even = (value: number) => Math.max(2, Math.round(value / 2) * 2)
  const width = even(video.width * scale)
  const height = even(video.height * scale)
  if (![width, height].every(Number.isSafeInteger))
    throw new Error('Export dimensions are too large.')
  const output = structuredClone(video)
  output.width = width
  output.height = height
  output.fps = fps
  if (scale !== 1) output.layers.forEach((layer) => scaleLayer(layer, scale))
  return output
}
