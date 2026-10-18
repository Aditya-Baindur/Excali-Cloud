import type { LayerJSON, VideoJSON } from '@videoflow/react-video-editor'

// These recipes mutate only the supplied draft. Invoke them inside store.commit
// so VideoFlow records a single undo step and normalizes tracks/project duration.
// VideoFlow 1.3.5 keyframes are absolute source times, not clip-local times.
type Selection = readonly string[]
type Span = { start: number; end: number }
type LayerRef = {
  layer: LayerJSON
  host: LayerJSON[]
  ancestors: LayerJSON[]
  offset: number
  supportsGlobalTime: boolean
}

const EPSILON = 1e-7
const audioProperties = new Set(['volume', 'pan', 'pitch', 'mute'])

function speedOf(layer: LayerJSON): number {
  const speed: unknown = layer.settings.speed ?? 1
  return typeof speed === 'number' && Number.isFinite(speed) ? speed : 0
}

function bounds(layer: LayerJSON): Span {
  const start = layer.settings.startTime
  const speed = Math.abs(speedOf(layer))
  return {
    start,
    end: start + (speed ? layer.settings.sourceDuration / speed : 0),
  }
}

function validSpan(layer: LayerJSON): boolean {
  const { start, end } = bounds(layer)
  return Number.isFinite(start) && Number.isFinite(end) && end > start
}

function selectedRefs(video: VideoJSON, ids: Selection): LayerRef[] {
  const wanted = new Set(ids)
  const found: LayerRef[] = []
  function visit(
    host: LayerJSON[],
    ancestors: LayerJSON[],
    offset: number,
    safe: boolean
  ) {
    for (const layer of host) {
      if (wanted.has(layer.id)) {
        found.push({ layer, host, ancestors, offset, supportsGlobalTime: safe })
        // Selecting a group and one of its children must not edit the child twice.
        continue
      }
      if (layer.type === 'group' && layer.children) {
        visit(
          layer.children,
          [...ancestors, layer],
          offset + layer.settings.startTime - (layer.settings.sourceStart ?? 0),
          safe && speedOf(layer) === 1
        )
      }
    }
  }
  visit(video.layers, [], 0, true)
  return found
}

export function findLayer(video: VideoJSON, id: string): LayerJSON | undefined {
  return selectedRefs(video, [id])[0]?.layer
}

export function getSelected(video: VideoJSON, ids: Selection): LayerJSON[] {
  return selectedRefs(video, ids).map(({ layer }) => layer)
}

function cloneLayer(layer: LayerJSON): LayerJSON {
  // structuredClone cannot clone Immer draft proxies; LayerJSON is JSON data.
  const clone = JSON.parse(JSON.stringify(layer)) as LayerJSON
  function renewIds(node: LayerJSON) {
    node.id = crypto.randomUUID()
    node.children?.forEach(renewIds)
  }
  renewIds(clone)
  return clone
}

function frameDuration(video: VideoJSON): number {
  return 1 / (Number.isFinite(video.fps) && video.fps > 0 ? video.fps : 30)
}

function canCut(ref: LayerRef, time: number, minimum: number): boolean {
  if (
    !ref.supportsGlobalTime ||
    ref.layer.type === 'group' ||
    !validSpan(ref.layer)
  )
    return false
  const { start, end } = bounds(ref.layer)
  const local = time - ref.offset
  return local - start >= minimum - EPSILON && end - local >= minimum - EPSILON
}

export function canSplit(
  video: VideoJSON,
  ids: Selection,
  playheadSeconds: number
): boolean {
  return (
    Number.isFinite(playheadSeconds) &&
    selectedRefs(video, ids).some((ref) =>
      canCut(ref, playheadSeconds, frameDuration(video))
    )
  )
}

function clampTransitions(layer: LayerJSON) {
  const span = bounds(layer)
  const duration = span.end - span.start
  if (layer.transitionIn)
    layer.transitionIn.duration = Math.min(
      layer.transitionIn.duration,
      duration
    )
  if (layer.transitionOut)
    layer.transitionOut.duration = Math.min(
      layer.transitionOut.duration,
      duration
    )
}

/** Split at a global playhead; return the new right-hand clip IDs. Groups are skipped. */
export function splitSelected(
  video: VideoJSON,
  ids: Selection,
  playheadSeconds: number
): string[] {
  if (!Number.isFinite(playheadSeconds)) return []
  const created: string[] = []
  for (const ref of selectedRefs(video, ids)) {
    if (!canCut(ref, playheadSeconds, frameDuration(video))) continue
    const { layer, host, offset } = ref
    const cut = playheadSeconds - offset
    const sourceStart = layer.settings.sourceStart ?? 0
    const sourceDuration = layer.settings.sourceDuration
    const speed = speedOf(layer)
    const leftDuration = (cut - layer.settings.startTime) * Math.abs(speed)
    const right = cloneLayer(layer)
    layer.settings.sourceDuration = leftDuration
    right.settings.startTime = cut
    right.settings.sourceDuration = sourceDuration - leftDuration
    if (speed > 0) {
      right.settings.sourceStart = sourceStart + leftDuration
    } else {
      layer.settings.sourceStart = sourceStart + sourceDuration - leftDuration
      right.settings.sourceStart = sourceStart
    }
    delete layer.settings.sourceEnd
    delete right.settings.sourceEnd
    // A cut must not introduce a fade at the new internal boundary.
    delete layer.transitionOut
    delete right.transitionIn
    clampTransitions(layer)
    clampTransitions(right)
    host.splice(host.indexOf(layer) + 1, 0, right)
    created.push(right.id)
  }
  return created
}

function byHost(refs: LayerRef[]): Map<LayerJSON[], LayerRef[]> {
  const result = new Map<LayerJSON[], LayerRef[]>()
  for (const ref of refs) {
    const siblings = result.get(ref.host) ?? []
    siblings.push(ref)
    result.set(ref.host, siblings)
  }
  return result
}

function hostEnd(host: LayerJSON[]): number {
  return host.reduce(
    (end, layer) => (validSpan(layer) ? Math.max(end, bounds(layer).end) : end),
    0
  )
}

function extendAncestors(ref: LayerRef, end: number) {
  for (let index = ref.ancestors.length - 1; index >= 0; index--) {
    const group = ref.ancestors[index]
    const required = end - (group.settings.sourceStart ?? 0)
    if (required <= group.settings.sourceDuration) break
    group.settings.sourceDuration = required
    delete group.settings.sourceEnd
    end = bounds(group).end
  }
}

/** Append a copy of each selected block after its sibling timeline; preserve tracks/gaps. */
export function duplicateSelected(video: VideoJSON, ids: Selection): string[] {
  const created: string[] = []
  for (const [host, refs] of byHost(selectedRefs(video, ids))) {
    const valid = refs.filter(({ layer }) => validSpan(layer))
    if (!valid.length) continue
    const first = Math.min(
      ...valid.map(({ layer }) => layer.settings.startTime)
    )
    const shift = hostEnd(host) - first
    for (const ref of valid) {
      const duplicate = cloneLayer(ref.layer)
      duplicate.settings.startTime += shift
      host.push(duplicate)
      created.push(duplicate.id)
    }
    extendAncestors(valid[0], hostEnd(host))
  }
  return created
}

function mergeSpans(spans: Span[]): Span[] {
  const result: Span[] = []
  for (const span of spans
    .filter(({ start, end }) => Number.isFinite(start) && end > start)
    .sort((a, b) => a.start - b.start)) {
    const last = result[result.length - 1]
    if (last && span.start <= last.end + EPSILON)
      last.end = Math.max(last.end, span.end)
    else result.push({ ...span })
  }
  return result
}

function subtractSpans(spans: Span[], occupied: Span[]): Span[] {
  return spans.flatMap(({ start, end }) => {
    const free: Span[] = []
    let cursor = start
    for (const other of occupied) {
      if (other.end <= cursor || other.start >= end) continue
      if (other.start > cursor) free.push({ start: cursor, end: other.start })
      cursor = Math.max(cursor, other.end)
      if (cursor >= end) break
    }
    if (cursor < end) free.push({ start: cursor, end })
    return free
  })
}

/**
 * Remove selected clips, closing only their newly vacant time across all sibling
 * tracks. Unselected overlapping clips/audio are never cut or desynchronized.
 * Gaps that already existed are retained.
 */
export function rippleDelete(video: VideoJSON, ids: Selection): void {
  for (const [host, refs] of byHost(selectedRefs(video, ids))) {
    const removed = new Set(refs.map(({ layer }) => layer.id))
    const removedSpans = mergeSpans(refs.map(({ layer }) => bounds(layer)))
    for (let index = host.length - 1; index >= 0; index--) {
      if (removed.has(host[index].id)) host.splice(index, 1)
    }
    const gaps = subtractSpans(removedSpans, mergeSpans(host.map(bounds)))
    for (const layer of host) {
      const start = layer.settings.startTime
      layer.settings.startTime = Math.max(
        0,
        start -
          gaps.reduce(
            (total, gap) =>
              total + Math.max(0, Math.min(start, gap.end) - gap.start),
            0
          )
      )
    }
  }
}

/** Compact each selected track (or all root tracks), preserving overlapping clusters. */
export function closeGaps(video: VideoJSON, ids?: Selection): void {
  const hosts = ids
    ? byHost(selectedRefs(video, ids))
    : new Map([
        [
          video.layers,
          video.layers.map(
            (layer): LayerRef => ({
              layer,
              host: video.layers,
              ancestors: [],
              offset: 0,
              supportsGlobalTime: true,
            })
          ),
        ],
      ])
  for (const [host, refs] of hosts) {
    const tracks = new Set(refs.map(({ layer }) => layer.track ?? 0))
    for (const track of tracks) {
      const clips = host
        .filter((layer) => (layer.track ?? 0) === track && validSpan(layer))
        .sort((a, b) => a.settings.startTime - b.settings.startTime)
      let originalEnd = refs[0]?.ancestors.at(-1)?.settings.sourceStart ?? 0
      let removed = 0
      for (const layer of clips) {
        const { start, end } = bounds(layer)
        if (start > originalEnd) removed += start - originalEnd
        layer.settings.startTime = Math.max(0, start - removed)
        originalEnd = Math.max(originalEnd, end)
      }
    }
  }
}

/** Trim inward to the global playhead; never extend clips or discard animation keys. */
export function trimSelected(
  video: VideoJSON,
  ids: Selection,
  time: number,
  edge: 'start' | 'end'
): void {
  if (!Number.isFinite(time)) return
  for (const ref of selectedRefs(video, ids)) {
    if (
      !ref.supportsGlobalTime ||
      ref.layer.type === 'group' ||
      !validSpan(ref.layer)
    )
      continue
    const { layer, offset } = ref
    const cut = time - offset
    const { start, end } = bounds(layer)
    const retained = edge === 'start' ? end - cut : cut - start
    if (
      cut <= start + EPSILON ||
      cut >= end - EPSILON ||
      retained < frameDuration(video) - EPSILON
    )
      continue
    const speed = speedOf(layer)
    const sourceRemoved =
      (edge === 'start' ? cut - start : end - cut) * Math.abs(speed)
    if ((edge === 'start' && speed > 0) || (edge === 'end' && speed < 0)) {
      layer.settings.sourceStart =
        (layer.settings.sourceStart ?? 0) + sourceRemoved
    }
    layer.settings.sourceDuration -= sourceRemoved
    if (edge === 'start') layer.settings.startTime = cut
    delete layer.settings.sourceEnd
    clampTransitions(layer)
  }
}

export function canDetachAudio(video: VideoJSON, ids: Selection): boolean {
  return getSelected(video, ids).some(
    (layer) =>
      layer.type === 'video' &&
      typeof layer.settings.source === 'string' &&
      layer.properties.mute !== true
  )
}

/** Extract each video's audio on a new track and mute its original audio. */
export function detachAudio(video: VideoJSON, ids: Selection): string[] {
  const created: string[] = []
  for (const [host, refs] of byHost(selectedRefs(video, ids))) {
    let track =
      host.reduce((max, layer) => Math.max(max, layer.track ?? 0), -1) + 1
    for (const { layer } of refs) {
      if (
        layer.type !== 'video' ||
        typeof layer.settings.source !== 'string' ||
        layer.properties.mute === true
      )
        continue
      const audio = cloneLayer(layer)
      audio.type = 'audio'
      audio.track = track++
      audio.properties = Object.fromEntries(
        Object.entries(audio.properties).filter(([key]) =>
          audioProperties.has(key)
        )
      )
      audio.animations = audio.animations.filter(({ property }) =>
        audioProperties.has(property)
      )
      delete audio.children
      delete audio.effects
      delete audio.transitionIn
      delete audio.transitionOut
      layer.properties.mute = true
      host.push(audio)
      created.push(audio.id)
    }
  }
  return created
}

/** Change media speed while preserving source time; ripple later clips on the same track. */
export function setClipSpeed(
  video: VideoJSON,
  ids: Selection,
  speed: number
): void {
  if (!Number.isFinite(speed) || speed === 0) return
  for (const [host, refs] of byHost(selectedRefs(video, ids))) {
    const selected = new Set(
      refs
        .filter(
          ({ layer }) =>
            (layer.type === 'video' || layer.type === 'audio') &&
            validSpan(layer) &&
            Number.isFinite(layer.settings.sourceDuration / Math.abs(speed)) &&
            layer.settings.sourceDuration / Math.abs(speed) >=
              frameDuration(video) - EPSILON
        )
        .map(({ layer }) => layer.id)
    )
    if (!selected.size) continue
    const tracks = new Set(
      refs
        .filter(({ layer }) => selected.has(layer.id))
        .map(({ layer }) => layer.track ?? 0)
    )
    for (const track of tracks) {
      const clips = host
        .filter((layer) => (layer.track ?? 0) === track)
        .sort((a, b) => a.settings.startTime - b.settings.startTime)
      const adjustments: { after: number; delta: number }[] = []
      for (const layer of clips) {
        const { start, end } = bounds(layer)
        const shift = adjustments.reduce(
          (total, change) =>
            total + (start >= change.after - EPSILON ? change.delta : 0),
          0
        )
        layer.settings.startTime = Math.max(0, start + shift)
        if (!selected.has(layer.id)) continue
        layer.settings.speed = speed
        const nextDuration = layer.settings.sourceDuration / Math.abs(speed)
        adjustments.push({ after: end, delta: nextDuration - (end - start) })
        clampTransitions(layer)
      }
    }
    if (refs.length) extendAncestors(refs[0], hostEnd(host))
  }
}
