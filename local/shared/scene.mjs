export function wins(candidate, current) {
  return !current || candidate.version > current.version ||
    (candidate.version === current.version && candidate.versionNonce < current.versionNonce)
}

const nonce = () => Math.floor(Math.random() * 2147483647)
export function uid() {
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16))
  bytes[6] = (bytes[6] & 15) | 64; bytes[8] = (bytes[8] & 63) | 128
  const hex = [...bytes].map(value => value.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

function base(type, x, y, width, height, extra = {}) {
  return {
    id: uid(), type, x, y, width, height, angle: 0,
    strokeColor: '#343a40', backgroundColor: 'transparent', fillStyle: 'solid',
    strokeWidth: 1, strokeStyle: 'solid', roughness: 0, opacity: 100,
    groupIds: [], frameId: null, roundness: null, seed: nonce(), version: 1,
    versionNonce: nonce(), isDeleted: false, boundElements: null, updated: Date.now(),
    link: null, locked: false, index: null, ...extra,
  }
}

function wrapped(text, columns = 27) {
  return String(text).split('\n').flatMap(line => {
    const lines = []; let part = ''
    for (const word of line.split(' ')) {
      if (part && part.length + word.length + 1 > columns) { lines.push(part); part = '' }
      part += (part ? ' ' : '') + word
    }
    return [...lines, part]
  }).join('\n')
}

export function makeElements(items) {
  return items.flatMap((item, i) => {
    const x = item.x ?? (i % 3) * 310; const y = item.y ?? Math.floor(i / 3) * 210
    const text = wrapped(item.text ?? '', item.type === 'text' ? 55 : 27)
    if (item.type === 'text') {
      return [base('text', x, y, Math.max(40, ...text.split('\n').map(s => s.length * 11)), text.split('\n').length * 25, {
        text, originalText: item.text, fontSize: 20, fontFamily: 2, textAlign: 'left',
        verticalAlign: 'top', containerId: null, autoResize: true, lineHeight: 1.25,
      })]
    }
    const shape = base(['rectangle', 'ellipse', 'diamond'].includes(item.type) ? item.type : 'rectangle', x, y,
      item.width ?? 280, item.height ?? Math.max(150, text.split('\n').length * 25 + 36), {
        backgroundColor: item.type === 'note' ? '#e9e6ff' : '#f1f3f5',
        customData: { kind: item.type === 'note' ? 'idea' : 'system', ...(item.parentId ? { parentId: item.parentId } : {}) },
      })
    if (!text) return [shape]
    const label = base('text', x + 16, y + 18, shape.width - 32, text.split('\n').length * 25, {
      text, originalText: item.text, fontSize: 20, fontFamily: 2, textAlign: 'left',
      verticalAlign: 'middle', containerId: shape.id, autoResize: false, lineHeight: 1.25,
    })
    shape.boundElements = [{ id: label.id, type: 'text' }]
    return [shape, label]
  })
}

export function connectElements(from, to) {
  const x = from.x + from.width; const y = from.y + from.height / 2
  const dx = to.x - x; const dy = to.y + to.height / 2 - y
  return base('arrow', x, y, Math.abs(dx), Math.abs(dy), {
    points: [[0, 0], [dx, dy]], startBinding: { elementId: from.id, focus: 0, gap: 8 },
    endBinding: { elementId: to.id, focus: 0, gap: 8 },
    startArrowhead: null, endArrowhead: 'arrow', elbowed: false,
  })
}

export function brainwritingElements() {
  return makeElements([
    { type: 'text', text: 'Write independently', x: 0, y: -70 },
    { type: 'note', text: 'Start in Private drafts. Reveal ideas when everyone is ready.', x: 0, y: 0 },
    { type: 'text', text: 'Build on ideas', x: 620, y: -70 },
    { type: 'note', text: 'What else could work? Combine ideas and explore alternatives.', x: 620, y: 0 },
    { type: 'text', text: 'Map the system', x: 1240, y: -70 },
    { type: 'note', text: 'Connect features, people, data and tools. Keep assumptions visible.', x: 1240, y: 0 },
    { type: 'text', text: 'Questions and decisions', x: 620, y: 400 },
  ])
}

export function mergeElements(existing, incoming) {
  const map = new Map(existing.map(element => [element.id, element]))
  for (const element of incoming) if (wins(element, map.get(element.id))) map.set(element.id, element)
  return [...map.values()]
}
