import { convertToExcalidrawElements, newElementWith } from '@excalidraw/excalidraw'

/** Use native font measurement and wrapping; keep a manual size as the minimum. */
export function fitSticky(elements: readonly any[], labelId: string, minimum: { width: number; height: number }) {
  const label = elements.find(element => element.id === labelId && !element.isDeleted)
  const note = elements.find(element => element.id === label?.containerId && !element.isDeleted)
  if (!label || note?.customData?.kind !== 'idea') return null
  const measure = (width: number) => convertToExcalidrawElements([{
    type: 'rectangle', id: note.id, x: note.x, y: note.y, width, height: minimum.height,
    label: { text: label.originalText ?? label.text, fontSize: label.fontSize,
      fontFamily: label.fontFamily, textAlign: label.textAlign, verticalAlign: label.verticalAlign },
  }], { regenerateIds: false })
  let low = minimum.width
  let high = low
  let measured = measure(high)
  const tooTall = (scene: typeof measured, width: number) => scene[0].height > Math.max(minimum.height, width * 1.1)
  while (tooTall(measured, high) && high < 100000) { high *= 1.25; measured = measure(high) }
  // Small width increments avoid a sudden jump to the exponential search bound.
  while (high - low > 8) {
    const middle = (low + high) / 2
    if (tooTall(measure(middle), middle)) low = middle
    else high = middle
  }
  measured = measure(Math.ceil(high))
  const shape = measured.find(element => element.id === note.id)!
  const text = measured.find(element => element.type === 'text')! as any
  const geometry = { width: shape.width, height: shape.height }
  const typography = { text: text.text, width: text.width, height: text.height, x: text.x, y: text.y }
  if (Object.entries(geometry).every(([key, value]) => Math.abs(note[key] - value) < 0.5) &&
    Object.entries(typography).every(([key, value]) => label[key] === value)) return null
  return elements.map(element => element.id === note.id ? newElementWith(element, geometry) :
    element.id === label.id ? newElementWith(element, typography) : element)
}

export function fitNewStickies(elements: readonly any[]) {
  let fitted = [...elements]
  for (const label of elements.filter(element => element.type === 'text' && element.containerId)) {
    const note = fitted.find(element => element.id === label.containerId)
    if (note?.customData?.kind === 'idea') fitted = fitSticky(fitted, label.id, { width: note.width, height: note.height }) ?? fitted
  }
  return fitted
}
