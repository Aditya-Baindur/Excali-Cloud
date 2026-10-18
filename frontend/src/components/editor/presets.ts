import type {
  LayerJSON,
  LayerTransitionJSON,
  TextLayerProperties,
  VisualLayerProperties,
} from '@videoflow/core'

// Animated values take precedence in both renderers. A static edit replaces
// only the animations for properties it explicitly writes.
export function applyStaticProperties(layer: LayerJSON, properties: object) {
  const replaced = new Set(Object.keys(properties))
  layer.animations = layer.animations.filter(
    (animation) => !replaced.has(animation.property)
  )
  Object.assign(layer.properties, properties)
}

export type TitlePreset = {
  id: string
  label: string
  properties: TextLayerProperties
  transitionIn?: LayerTransitionJSON
}

const titleBase: TextLayerProperties = {
  fontFamily: 'Arial',
  fontWeight: 600,
  fontStyle: 'normal',
  color: '#ffffff',
  textAlign: 'center',
  position: [0.5, 0.5],
  anchor: [0.5, 0.5],
  textShadow: false,
  textStroke: false,
  backgroundColor: 'transparent',
  padding: 0,
  letterSpacing: 0,
}

export const TITLE_PRESETS: TitlePreset[] = [
  {
    id: 'centered',
    label: 'Centered',
    properties: { ...titleBase, text: 'Title', fontSize: 6 },
    transitionIn: { transition: 'fade', duration: 0.4 },
  },
  {
    id: 'lower-third',
    label: 'Lower third',
    properties: {
      ...titleBase,
      text: 'Name or caption',
      fontSize: 3.4,
      textAlign: 'left',
      position: [0.08, 0.82],
      anchor: [0, 0.5],
      textShadow: true,
      textShadowBlur: 0.15,
      textShadowOffset: [0, 0.06],
    },
    transitionIn: { transition: 'slideUp', duration: 0.4 },
  },
  {
    id: 'bold',
    label: 'Bold',
    properties: {
      ...titleBase,
      text: 'TITLE',
      fontSize: 9,
      fontWeight: 800,
      letterSpacing: -0.035,
    },
    transitionIn: { transition: 'zoom', duration: 0.35 },
  },
  {
    id: 'caption',
    label: 'Caption',
    properties: {
      ...titleBase,
      text: 'Caption',
      fontSize: 3,
      position: [0.5, 0.86],
      backgroundColor: '#000000cc',
      padding: [0.25, 0.5, 0.25, 0.5],
      borderRadius: 0.12,
    },
    transitionIn: { transition: 'fade', duration: 0.2 },
  },
  {
    id: 'serif',
    label: 'Serif',
    properties: {
      ...titleBase,
      text: 'Title',
      fontFamily: 'Georgia',
      fontSize: 7,
      fontWeight: 400,
      fontStyle: 'italic',
    },
    transitionIn: { transition: 'fade', duration: 0.6 },
  },
]

type LookProperties = Pick<
  VisualLayerProperties,
  | 'filterBrightness'
  | 'filterContrast'
  | 'filterSaturate'
  | 'filterGrayscale'
  | 'filterSepia'
  | 'filterHueRotate'
>
export type LookPreset = {
  id: string
  label: string
  properties: LookProperties
}
const original: LookProperties = {
  filterBrightness: 1,
  filterContrast: 1,
  filterSaturate: 1,
  filterGrayscale: 0,
  filterSepia: 0,
  filterHueRotate: 0,
}
export const LOOK_PRESETS: LookPreset[] = [
  { id: 'original', label: 'Original', properties: { ...original } },
  {
    id: 'vivid',
    label: 'Vivid',
    properties: { ...original, filterContrast: 1.12, filterSaturate: 1.3 },
  },
  {
    id: 'cinema',
    label: 'Cinema',
    properties: {
      ...original,
      filterBrightness: 0.94,
      filterContrast: 1.18,
      filterSaturate: 0.75,
    },
  },
  {
    id: 'warm',
    label: 'Warm',
    properties: {
      ...original,
      filterBrightness: 1.04,
      filterSepia: 0.25,
      filterSaturate: 1.1,
    },
  },
  {
    id: 'faded',
    label: 'Faded',
    properties: {
      ...original,
      filterBrightness: 1.08,
      filterContrast: 0.8,
      filterSaturate: 0.75,
    },
  },
  {
    id: 'mono',
    label: 'Mono',
    properties: { ...original, filterGrayscale: 1, filterContrast: 1.1 },
  },
]

export type TransitionPreset = { id: string; label: string; textOnly?: boolean }
// IDs are built-in renderer transition names. Empty ID means remove the transition.
export const TRANSITION_PRESETS: TransitionPreset[] = [
  { id: '', label: 'None' },
  { id: 'fade', label: 'Fade' },
  { id: 'slideUp', label: 'Slide up' },
  { id: 'slideDown', label: 'Slide down' },
  { id: 'slideLeft', label: 'Slide left' },
  { id: 'slideRight', label: 'Slide right' },
  { id: 'zoom', label: 'Zoom' },
  { id: 'blurResolve', label: 'Blur' },
  { id: 'noiseDissolve', label: 'Dissolve' },
  { id: 'typewriter', label: 'Typewriter', textOnly: true },
]
