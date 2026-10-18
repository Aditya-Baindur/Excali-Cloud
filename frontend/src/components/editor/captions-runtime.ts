import type { LayerTypeDescriptor } from '@videoflow/renderer-browser'

export type CaptionTimingRenderer = {
  getLayerType(type: string): LayerTypeDescriptor | undefined
  registerLayerType(type: string, descriptor: LayerTypeDescriptor): void
}

type Cue = { caption: string; startTime: number; endTime: number }
const configured = new WeakSet<CaptionTimingRenderer>()

/** Cue times follow the same absolute source-time model as animation keys. */
export function captionTextAtSourceTime(
  captions: unknown,
  sourceTime: number,
  reverse = false
): string {
  if (!Array.isArray(captions) || !Number.isFinite(sourceTime)) return ''
  const cue = captions.find((value: unknown): value is Cue => {
    if (!value || typeof value !== 'object') return false
    const cue = value as Partial<Cue>
    if (
      typeof cue.caption !== 'string' ||
      typeof cue.startTime !== 'number' ||
      typeof cue.endTime !== 'number' ||
      !Number.isFinite(cue.startTime) ||
      !Number.isFinite(cue.endTime) ||
      cue.endTime <= cue.startTime
    )
      return false
    // Half-open intervals prevent the previous cue lingering for a frame at
    // shared boundaries. Reverse playback visits the source end first.
    return reverse
      ? cue.startTime < sourceTime && sourceTime <= cue.endTime
      : cue.startTime <= sourceTime && sourceTime < cue.endTime
  })
  return cue?.caption ?? ''
}

/**
 * Correct VideoFlow 1.3.4's built-in global-time caption lookup using its public
 * per-renderer registry. Call synchronously BEFORE DomRenderer.loadVideo(), or
 * before BrowserRenderer's first render/export. No project JSON or history is
 * changed: native move/trim/split/group operations and undo remain one edit.
 *
 * Editor preview: subscribe to store.bridge while the session is still loading.
 * Preview calls setBridge(newBridge) before newBridge.setVideo(...), so install
 * synchronously on that notification: installSourceCaptionTiming(bridge.renderer).
 * Export: call immediately after constructing BrowserRenderer.
 */
export function installSourceCaptionTiming(
  renderer: CaptionTimingRenderer
): void {
  if (configured.has(renderer)) return
  const native = renderer.getLayerType('captions')
  if (!native) throw new Error('This video renderer does not support captions.')

  class SourceTimeCaptionsLayer extends native.runtime {
    override getPropertiesAtFrame(frame: number) {
      const properties = super.getPropertiesAtFrame(frame)
      properties.text = captionTextAtSourceTime(
        this.json.settings.captions,
        this.sourceTimeAtFrame(frame),
        this.speed < 0
      )
      return properties
    }
  }

  renderer.registerLayerType('captions', {
    ...native,
    runtime: SourceTimeCaptionsLayer,
  })
  configured.add(renderer)
}
