import { mergeElements } from '../shared/scene.mjs'

export type Element = Record<string, any> & { id: string; version: number; versionNonce: number }
export type Board = {
  id: string; name: string; revision: number; elements: Element[]; files: Record<string, any>; background: string;
  brief: string; messages: { id: string; author: string; text: string; createdAt: number }[];
  session: { phase: 'diverge' | 'converge'; hmw: string; criteria: string; decision: string };
  focus: { elementIds: string[]; instruction: string } | null; votes: Record<string, string[]>;
}

export async function request<T = any>(path: string, data?: unknown): Promise<T> {
  const response = await fetch(`/api${path}`, { method: data === undefined ? 'GET' : 'POST',
    headers: { 'content-type': 'application/json' }, ...(data === undefined ? {} : { body: JSON.stringify(data) }),
    signal: AbortSignal.timeout(15000),
  })
  const result = await response.json()
  if (!response.ok) throw Object.assign(new Error(result.error || 'The workspace is unavailable'), { status: response.status })
  return result as T
}

/** Pending edits remain separate from remote snapshots until the server saves them. */
export class LiveBoard {
  board: Board | null = null
  pending = new Map<string, Element>()
  files: Record<string, any> = {}
  background: string | undefined
  socket: WebSocket | null = null
  stopped = false
  timer: ReturnType<typeof setTimeout> | undefined
  reconnect: ReturnType<typeof setTimeout> | undefined
  saving = false
  savingTask: Promise<void> | null = null
  constructor(public id: string, public receive: (board: Board) => void, public status: (message: string) => void) {}
  open() {
    if (this.stopped) return
    this.status('Connecting…')
    this.socket = new WebSocket(`${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/live/${this.id}`)
    this.socket.onmessage = event => {
      try {
        const value = JSON.parse(event.data)
        if (value.type !== 'board') return
        this.accept(value.board)
        if (this.pending.size || Object.keys(this.files).length || this.background) void this.flush()
        else this.status('Saved locally · live')
      } catch (error) { console.error('Board update failed', error); this.status('Could not read the board update. Reconnect to retry.') }
    }
    this.socket.onclose = () => {
      if (this.stopped) return
      this.status(this.pending.size ? 'Disconnected · edits waiting to save' : 'Disconnected · reconnecting')
      this.reconnect = setTimeout(() => this.open(), 1500)
    }
    this.socket.onerror = () => this.socket?.close()
  }
  accept(board: Board) {
    if (this.board && board.revision < this.board.revision) return
    // The server sends each image once, so keep files from earlier updates.
    board = { ...board, files: { ...this.board?.files, ...board.files } }
    this.board = board
    this.receive({ ...board, elements: mergeElements(board.elements, [...this.pending.values()]), files: { ...board.files, ...this.files }, background: this.background ?? board.background })
  }
  capture(elements: readonly any[], files: Record<string, any>, background: string) {
    if (!this.board) return
    const known = new Map(this.board.elements.map(e => [e.id, e]))
    for (const element of elements) {
      const previous = this.pending.get(element.id) ?? known.get(element.id)
      if (!previous || element.version !== previous.version || element.versionNonce !== previous.versionNonce) this.pending.set(element.id, structuredClone(element))
    }
    for (const [id, file] of Object.entries(files)) if (this.board.files[id]?.dataURL !== file.dataURL) this.files[id] = file
    if (background !== this.board.background) this.background = background
    if (this.pending.size || Object.keys(this.files).length || this.background) {
      this.status('Saving…')
      clearTimeout(this.timer); this.timer = setTimeout(() => void this.flush(), 300)
    }
  }
  flush(): Promise<void> {
    if (this.savingTask) return this.savingTask.then(() => this.flush())
    this.savingTask = this.send().finally(() => { this.savingTask = null })
    return this.savingTask
  }
  async send() {
    if (this.stopped || !this.board) return
    if (!this.pending.size && !Object.keys(this.files).length && !this.background) return
    this.saving = true
    const elements = [...this.pending.values()]; const files = { ...this.files }; const background = this.background
    try {
      const saved = await request<Board>(`/boards/${this.id}/patch`, { elements, files, ...(background ? { background } : {}) })
      for (const element of elements) if (this.pending.get(element.id) === element) this.pending.delete(element.id)
      for (const [id, file] of Object.entries(files)) if (this.files[id] === file) delete this.files[id]
      if (this.background === background) this.background = undefined
      this.accept(saved)
      this.status(this.pending.size ? 'Saving…' : 'Saved locally · live')
    } catch (error) { this.status(`${(error as Error).message} · edits still waiting to save`) }
    finally { this.saving = false }
    if (this.dirty() && this.socket?.readyState === WebSocket.OPEN) {
      clearTimeout(this.timer); this.timer = setTimeout(() => void this.flush(), 1500)
    }
  }
  dirty() { return this.pending.size > 0 || Object.keys(this.files).length > 0 || this.background !== undefined || this.saving }
  close() { this.stopped = true; clearTimeout(this.timer); clearTimeout(this.reconnect); this.socket?.close() }
}
