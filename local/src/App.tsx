import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Excalidraw, MainMenu, Footer, CaptureUpdateAction, restoreElements, serializeAsJSON, reconcileElements, viewportCoordsToSceneCoords } from '@excalidraw/excalidraw'
import type { AppState, ExcalidrawImperativeAPI, ExcalidrawProps } from '@excalidraw/excalidraw/types'
import '@excalidraw/excalidraw/index.css'
import { makeElements, uid } from '../shared/scene.mjs'
import { LiveBoard, request, type Board } from './collaboration'

function download(name: string, data: string, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([data], { type }))
  const a = document.createElement('a'); a.href = url; a.download = name; a.click()
  setTimeout(() => URL.revokeObjectURL(url), 10000)
}
function safeGet(key: string) { try { return localStorage.getItem(key) } catch { return null } }
function safeSet(key: string, value: string) { try { localStorage.setItem(key, value) } catch { /* session remains usable without browser storage */ } }
const DraftBoard = React.createContext('')

export default function App() {
  const [session, setSession] = useState<any>(null)
  const [boards, setBoards] = useState<{ id: string; name: string }[]>([])
  const [boardId, setBoardId] = useState(new URLSearchParams(location.search).get('board') ?? '')
  const [error, setError] = useState('')
  const [navOpen, setNavOpen] = useState(false)
  const [name, setName] = useState('')
  const [template, setTemplate] = useState('brainwriting')
  const [busy, setBusy] = useState(false)
  const upload = useRef<HTMLInputElement>(null)
  const beforeOpen = useRef<() => Promise<void>>(async () => {})

  const refresh = useCallback(async () => {
    const current = await request('/session')
    setSession(current)
    if (current.role === 'owner') setBoards((await request('/boards')).boards)
    else { setBoardId(current.boardId); setBoards([]) }
  }, [])
  useEffect(() => {
    ;(async () => {
      try {
        const key = new URLSearchParams(location.hash.slice(1)).get('key')
        if (key) {
          await request('/session', { key, ...(boardId ? { boardId } : {}) })
          history.replaceState(null, '', location.pathname + location.search)
        }
        await refresh()
      } catch (error) { setError((error as Error).message) }
    })()
  }, [])
  async function create() {
    if (!name.trim() || busy) return
    setBusy(true)
    try {
      const board = await request<Board>('/boards', { name, template })
      await refresh(); await open(board.id); setName('')
    } catch (error) { setError((error as Error).message) }
    finally { setBusy(false) }
  }
  async function open(id: string) {
    try {
      await beforeOpen.current()
      setBoardId(id); setNavOpen(false)
      history.replaceState(null, '', `?board=${encodeURIComponent(id)}`)
    } catch (error) { setError((error as Error).message) }
  }
  async function importBoard(file: File) {
    try {
      if (file.size > 25_000_000) throw new Error('Choose a file smaller than 25 MB')
      const data = JSON.parse(await file.text())
      const imported = await request<Board>('/import', { name: file.name.replace(/\.(json|excalidraw)$/i, ''), data })
      await refresh(); await open(imported.id)
    } catch (error) { setError((error as Error).message) }
  }
  return <div className="workspace">
    <header className="app-header">
      <button className="wordmark" onClick={() => setNavOpen(!navOpen)} aria-label="Toggle boards"><span className="logo" aria-hidden="true">◈</span> Night Crew <span className="subtle">workspace</span></button>
      <span className="local-label">Files stay on this computer</span>
    </header>
    {error && <div className="error-banner" role="alert">{error}<button onClick={() => setError('')} aria-label="Dismiss error">×</button></div>}
    <div className="workspace-body">
      <nav className={`board-nav ${navOpen ? 'open' : ''}`} aria-label="Saved boards">
        <div className="nav-title"><h2>Boards</h2><button className="mobile-close" onClick={() => setNavOpen(false)}>Close</button></div>
        {!session ? <p>Connecting to your workspace…</p> : session.role === 'guest' ? <p>You’re here by invitation. This session can access only the shared board.</p> : <>
          <div className="board-list">{boards.map(board => <button key={board.id} className={board.id === boardId ? 'active' : ''} onClick={() => open(board.id)}>{board.name}</button>)}</div>
          <form className="new-board" onSubmit={event => { event.preventDefault(); void create() }}>
            <label htmlFor="board-name">New board</label><input id="board-name" value={name} onChange={e => setName(e.target.value)} placeholder="What are we thinking about?" maxLength={160} required />
            <select aria-label="Board template" value={template} onChange={e => setTemplate(e.target.value)}><option value="brainwriting">Brainwriting</option><option value="blank">Blank canvas</option></select>
            <button className="primary" disabled={busy || !name.trim()}>Create board</button>
          </form>
          <button className="text-button" onClick={() => upload.current?.click()}>Import a board or backup</button>
          <input ref={upload} type="file" accept=".json,.excalidraw" hidden onChange={e => { const file = e.target.files?.[0]; if (file) void importBoard(file); e.target.value = '' }} />
        </>}
        <p className="nav-foot">Shared sessions run while this app is on. Export a copy to keep it in your shared folder or GitHub.</p>
      </nav>
      {session && boardId ? <BoardWorkspace key={boardId} boardId={boardId} viewer={session} beforeOpen={beforeOpen} /> : <main className="empty-workspace">
        <span className="empty-mark" aria-hidden="true">◈</span><h1>Give the vision room to grow.</h1><p>Write your own ideas. Build on each other’s thinking. Turn the possibilities into a system.</p>
        <button className="primary" onClick={() => { setNavOpen(true); document.getElementById('board-name')?.focus() }}>Create your first board</button>
      </main>}
    </div>
  </div>
}

function BoardWorkspace({ boardId, viewer, beforeOpen }: { boardId: string; viewer: any; beforeOpen: React.MutableRefObject<() => Promise<void>> }) {
  const [board, setBoard] = useState<Board | null>(null)
  const latest = useRef<Board | null>(null)
  const [status, setStatus] = useState('Connecting…')
  const [error, setError] = useState('')
  const [panel, setPanel] = useState('session')
  const [panelOpen, setPanelOpen] = useState(true)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [stickyOpen, setStickyOpen] = useState(false)
  const stickyPosition = useRef<{ x: number; y: number } | null>(null)
  const contextPosition = useRef<{ x: number; y: number } | null>(null)
  const [contextMenu, setContextMenu] = useState<AppState['contextMenu']>(null)
  const canvasRoot = useRef<HTMLDivElement>(null)
  const [api, setApi] = useState<ExcalidrawImperativeAPI | null>(null)
  const apiRef = useRef<ExcalidrawImperativeAPI | null>(null)
  const liveRef = useRef<LiveBoard | null>(null)
  const applying = useRef(false)
  const fit = useRef(false)
  const lastZoom = useRef<number | null>(null)
  const [note, setNote] = useState('')
  const [message, setMessage] = useState('')
  const [author, setAuthor] = useState(safeGet('night-crew-name') ?? 'Teammate')
  const [aiRequest, setAiRequest] = useState('')
  const [shareLink, setShareLink] = useState('')
  const [now, setNow] = useState(Date.now())
  const [drafts, setDrafts] = useState<string[]>(() => {
    try { return JSON.parse(safeGet(`drafts:${boardId}`) ?? '["","",""]') } catch { return ['', '', ''] }
  })

  function renderBoard(next: Board) {
    latest.current = next; setBoard(next)
    const canvas = apiRef.current
    if (!canvas) return
    applying.current = true
    try {
      const local = canvas.getSceneElementsIncludingDeleted()
      const restored = restoreElements(next.elements as any, local, { refreshDimensions: true })
      const reconciled = reconcileElements(local, restored as any, canvas.getAppState())
      canvas.addFiles(Object.values(next.files))
      canvas.updateScene({ elements: reconciled, appState: { viewBackgroundColor: next.background }, captureUpdate: CaptureUpdateAction.NEVER })
      if (!fit.current) {
        if (reconciled.some(e => !e.isDeleted)) canvas.scrollToContent(reconciled, { fitToViewport: true, maxZoom: 0.8 })
        fit.current = true
      }
    } finally { applying.current = false }
  }
  useEffect(() => {
    const connection = new LiveBoard(boardId, renderBoard, setStatus)
    liveRef.current = connection; connection.open()
    beforeOpen.current = async () => {
      await connection.flush()
      if (connection.dirty()) throw new Error('Wait for your canvas edits to finish saving before switching boards')
      if (document.querySelector('.editable-text[data-dirty="true"]')) throw new Error('Save or discard your text edit before switching boards')
    }
    const warning = (event: BeforeUnloadEvent) => { if (connection.dirty() || document.querySelector('.editable-text[data-dirty="true"]')) { event.preventDefault(); event.returnValue = '' } }
    window.addEventListener('beforeunload', warning)
    const clock = setInterval(() => setNow(Date.now()), 1000)
    return () => { beforeOpen.current = async () => {}; connection.close(); clearInterval(clock); window.removeEventListener('beforeunload', warning) }
  }, [boardId])
  useEffect(() => { apiRef.current = api; if (api && latest.current) renderBoard(latest.current) }, [api])
  useEffect(() => safeSet(`drafts:${boardId}`, JSON.stringify(drafts)), [drafts, boardId])

  const onChange: NonNullable<ExcalidrawProps['onChange']> = useCallback((elements, state, files) => {
    const ids = Object.keys(state.selectedElementIds).sort()
    setSelectedIds(previous => previous.join(',') === ids.join(',') ? previous : ids)
    setContextMenu(previous => previous === state.contextMenu ? previous : state.contextMenu)
    if (lastZoom.current !== state.zoom.value) {
      lastZoom.current = state.zoom.value
      // Size newly typed text in screen pixels; existing elements keep their scene size.
      queueMicrotask(() => apiRef.current?.updateScene({ appState: { currentItemFontSize: 20 / state.zoom.value }, captureUpdate: CaptureUpdateAction.NEVER }))
    }
    if (!applying.current && !state.isLoading) liveRef.current?.capture(elements, files, state.viewBackgroundColor)
  }, [])

  async function action(fn: () => Promise<unknown>) {
    try { setError(''); await fn() } catch (error) { setError((error as Error).message) }
  }
  async function patch(data: Record<string, unknown>, guarded = true) {
    await liveRef.current?.flush()
    if (liveRef.current?.dirty()) throw new Error('Wait until canvas edits are saved before changing the session')
    const current = latest.current!
    let next: Board
    try {
      next = await request<Board>(`/boards/${boardId}/patch`, { ...(guarded ? { expectedRevision: current.revision } : {}), ...data })
    } catch (error) {
      if (!guarded || (error as any).status !== 409) throw error
      const fresh = await request<Board>(`/boards/${boardId}`)
      liveRef.current?.accept(fresh)
      const fieldsUnchanged = Object.entries(data).every(([key, value]) => key === 'session'
        ? Object.keys(value as object).every(field => (fresh.session as any)[field] === (current.session as any)[field])
        : key === 'focus' || JSON.stringify((fresh as any)[key]) === JSON.stringify((current as any)[key]))
      if (!fieldsUnchanged) throw new Error('A teammate changed this field. Review their update before saving yours.')
      next = await request<Board>(`/boards/${boardId}/patch`, { expectedRevision: fresh.revision, ...data })
    }
    liveRef.current?.accept(next)
    return next
  }
  function addNotes(texts: string[]) {
    const current = latest.current!
    const zoom = apiRef.current?.getAppState().zoom.value ?? 1
    const y = Math.max(0, ...current.elements.filter(e => !e.isDeleted).map(e => e.y + e.height)) + 90 / zoom
    return patch({ elements: makeElements(texts.map((text, i) => ({ type: 'note', text, x: i * 310 / zoom, y, width: 280 / zoom, height: 200 / zoom, fontSize: 20 / zoom }))) }, false)
  }
  function addSticky(text: string) {
    const canvas = apiRef.current
    if (!canvas) throw new Error('Wait for the canvas to finish opening')
    const state = canvas.getAppState()
    const center = stickyPosition.current ?? viewportCoordsToSceneCoords({ clientX: state.offsetLeft + state.width / 2, clientY: state.offsetTop + state.height / 2 }, state)
    const scale = 1 / state.zoom.value
    const elements = restoreElements(makeElements([{ type: 'note', text, x: center.x - 120 * scale, y: center.y - 120 * scale, width: 240 * scale, height: 240 * scale, fontSize: 20 * scale }]) as any, null)
    canvas.setActiveTool({ type: 'selection' })
    canvas.updateScene({ elements: [...canvas.getSceneElementsIncludingDeleted(), ...elements],
      appState: { selectedElementIds: { [elements[0].id]: true } }, captureUpdate: CaptureUpdateAction.IMMEDIATELY })
    setStickyOpen(false)
  }
  function changeZoom(factor: number) {
    const canvas = apiRef.current
    if (!canvas) return
    const state = canvas.getAppState()
    const center = viewportCoordsToSceneCoords({ clientX: state.offsetLeft + state.width / 2, clientY: state.offsetTop + state.height / 2 }, state)
    const value = Math.max(0.1, Math.min(30, state.zoom.value * factor)) as typeof state.zoom.value
    canvas.updateScene({ appState: { zoom: { value }, scrollX: state.width / (2 * value) - center.x, scrollY: state.height / (2 * value) - center.y }, captureUpdate: CaptureUpdateAction.NEVER })
  }
  async function divergeSelection(ids = selectedIds) {
    if (!ids.length) throw new Error('Select an idea or a section on the canvas first')
    const next = await patch({ session: { phase: 'diverge' }, focus: { elementIds: ids, instruction: 'Diverge thinking: expand these ideas into distinct alternatives and connected systems. Preserve the originals. Do not rank or choose.' } })
    const prompt = `Use the night-crew MCP server. Read board ${boardId}. Its focus.elementIds contains my selection. We are in divergent mode. Expand these selected ideas into several distinct possibilities; ask one question if the vision is unclear. Add connected notes and architecture beside the originals. Do not rank, pick a winner, or delete originals. Post your reasoning with post_message. Current revision: ${next.revision}.`
    setAiRequest(prompt); setPanel('ai'); setPanelOpen(true)
    try { await navigator.clipboard.writeText(prompt); setStatus('Selection saved · AI request copied') }
    catch { setStatus('Selection saved · copy the request from AI partner') }
  }
  async function copyInvite() {
    const { token } = await request(`/boards/${boardId}/invite`, {})
    const url = `${location.origin}/?board=${boardId}#key=${token}`
    setShareLink(url)
    try { await navigator.clipboard.writeText(url) } catch { /* visible input is the clipboard fallback */ }
  }
  async function exportScene() {
    await liveRef.current?.flush()
    const canvas = apiRef.current
    if (!canvas) return
    const current = latest.current!
    download(`${current.name.replace(/[^a-zA-Z0-9 _-]/g, '') || 'board'}.excalidraw`, serializeAsJSON(canvas.getSceneElementsIncludingDeleted(), canvas.getAppState(), canvas.getFiles(), 'local'))
  }
  const chosen = board?.elements.filter(e => selectedIds.includes(e.id) && !e.isDeleted) ?? []
  const remaining = board?.session.deadline ? Math.max(0, Math.ceil((board.session.deadline - now) / 1000)) : null
  const totalVotes = (id: string) => Object.values(board?.votes ?? {}).filter(votes => votes.includes(id)).length

  return <DraftBoard.Provider value={boardId}><main className="board-workspace">
    <div className="board-toolbar">
      <div className="board-heading"><h1>{board?.name ?? 'Opening board…'}</h1><span className="save-status" role="status">{status}</span></div>
      <div className="board-actions">
        <button className="diverge-button" disabled={!selectedIds.length} onClick={() => void action(divergeSelection)} title="Select an idea, then explore alternatives with AI">✧ Diverge thinking{selectedIds.length ? ` (${selectedIds.length})` : ''}</button>
        <button onClick={() => void action(exportScene)}>Export</button>
        {viewer.role === 'owner' && <button onClick={() => void action(copyInvite)}>Share</button>}
        <button aria-expanded={panelOpen} onClick={() => setPanelOpen(!panelOpen)}>{panelOpen ? 'Hide panel' : 'Open panel'}</button>
      </div>
    </div>
    {error && <div className="error-banner" role="alert">{error}<button onClick={() => setError('')}>Dismiss</button></div>}
    {shareLink && <div className="share-banner"><label>Board invite<input aria-label="Board invitation link" readOnly value={shareLink} onFocus={e => e.target.select()} /></label><p>Use your computer’s private network address in place of localhost when sharing. Run in LAN mode first. This link grants editing access to this board.</p><button onClick={() => setShareLink('')}>Close</button></div>}
    <div className="board-body">
      <div className="canvas" data-testid="canvas" ref={canvasRoot} onContextMenuCapture={event => {
        if (event.target instanceof HTMLCanvasElement && api) contextPosition.current = viewportCoordsToSceneCoords({ clientX: event.clientX, clientY: event.clientY }, api.getAppState())
      }}>
        <Excalidraw excalidrawAPI={setApi} onChange={onChange} theme="light" name={board?.name} isCollaborating={true}>
          <MainMenu><MainMenu.DefaultItems.Export /><MainMenu.DefaultItems.SaveAsImage /><MainMenu.DefaultItems.SearchMenu /><MainMenu.DefaultItems.Help /><MainMenu.DefaultItems.ChangeCanvasBackground /></MainMenu>
          <Footer><div className="canvas-zoom" role="group" aria-label="Canvas zoom"><button aria-label="Zoom out" onClick={() => changeZoom(0.8)} disabled={!api}>−</button><button aria-label="Zoom in" onClick={() => changeZoom(1.25)} disabled={!api}>+</button></div></Footer>
        </Excalidraw>
        {!board && <div className="canvas-loading">Opening your saved board…</div>}
        {api && <DrawingStickyTool root={canvasRoot} onAdd={() => { stickyPosition.current = null; setStickyOpen(true) }} />}
        <div className="canvas-zoom mobile-zoom" role="group" aria-label="Canvas zoom"><button aria-label="Zoom out" onClick={() => changeZoom(0.8)} disabled={!api}>−</button><button aria-label="Zoom in" onClick={() => changeZoom(1.25)} disabled={!api}>+</button></div>
        {api && <CanvasContextActions menu={contextMenu} root={canvasRoot} enabled={selectedIds.length > 0} onAddSticky={() => {
          stickyPosition.current = contextPosition.current
          api.updateScene({ appState: { contextMenu: null }, captureUpdate: CaptureUpdateAction.NEVER })
          setStickyOpen(true)
        }} onDiverge={() => {
          const ids = Object.keys(api.getAppState().selectedElementIds)
          api.updateScene({ appState: { contextMenu: null }, captureUpdate: CaptureUpdateAction.NEVER })
          void action(() => divergeSelection(ids))
        }} />}
      </div>
      {panelOpen && board && <aside className="thinking-panel" aria-label="Thinking tools">
        <div className="panel-tabs" role="tablist">{[['session', 'Session'], ['drafts', 'Private drafts'], ['ai', 'AI partner']].map(([id, label]) => <button key={id} role="tab" aria-selected={panel === id} onClick={() => setPanel(id)}>{label}</button>)}</div>
        <div className="panel-content" role="tabpanel">
          {panel === 'session' && <>
            <div className="phase-control" aria-label="Thinking phase">{(['diverge', 'converge'] as const).map(phase => <button key={phase} className={board.session.phase === phase ? 'chosen' : ''} onClick={() => void action(() => patch({ session: { phase } }))}>{phase === 'diverge' ? 'Diverge' : 'Converge'}</button>)}</div>
            <p className="phase-help">{board.session.phase === 'diverge' ? 'Explore possibilities. Write privately first, then reveal and build on ideas. Save judgment for later.' : 'Compare ideas against your criteria. Each person has three votes. Record what you choose and what needs testing.'}</p>
            {board.session.phase === 'diverge' ? <>
              <div className="timer-row"><strong>Crazy 8s</strong><span>{remaining === null ? '8 ideas in 8 minutes' : `${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, '0')}`}</span><button onClick={() => void action(() => patch({ session: { deadline: remaining === null ? Date.now() + 480000 : null } }))}>{remaining === null ? 'Start timer' : 'Clear'}</button></div>
              <button className="text-button" onClick={() => { setDrafts(d => [...d, ...Array(Math.max(0, 8 - d.length)).fill('')]); setPanel('drafts') }}>Open eight private idea slots</button>
              <label htmlFor="add-note">Add a shared idea</label><textarea id="add-note" value={note} onChange={e => setNote(e.target.value)} placeholder="An idea worth exploring…" maxLength={10000} />
              <button disabled={!note.trim()} onClick={() => void action(async () => { await addNotes([note.trim()]); setNote('') })}>Add idea to canvas</button>
            </> : <>
              <div className="vote-box"><h3>Vote on selected ideas</h3><p>Select a shape on the canvas, then add or remove your vote.</p>{chosen.filter(e => e.type !== 'text').map(element => <button key={element.id} className={board.votes[viewer.voterId]?.includes(element.id) ? 'voted' : ''} onClick={() => void action(async () => { const next = await request<Board>(`/boards/${boardId}/vote`, { elementId: element.id }); liveRef.current?.accept(next) })}>{board.elements.find(e => e.containerId === element.id)?.text?.slice(0, 35) ?? element.type} · {totalVotes(element.id)} votes</button>)}{!chosen.length && <span className="subtle">No idea selected yet.</span>}</div>
              <EditableText label="Decision and next test" value={board.session.decision} placeholder="What did we choose? How will we test it?" save={value => patch({ session: { decision: value } })} />
            </>}
            <button className="text-button" onClick={() => download(`${board.name}-backup.json`, JSON.stringify({ format: 'excali-cloud-local', version: 1, board }, null, 2))}>Download full backup with discussion</button>
          </>}
          {panel === 'drafts' && <>
            <h2>Think on your own first.</h2><p>These drafts stay in this browser. Your teammates and the AI cannot see them until you reveal them.</p>
            {drafts.map((value, index) => <label className="draft" key={index}>Idea {index + 1}<textarea aria-label={`Private idea ${index + 1}`} value={value} onChange={e => setDrafts(items => items.map((item, i) => i === index ? e.target.value : item))} maxLength={10000} /></label>)}
            <div className="button-row"><button onClick={() => setDrafts(items => [...items, ''])} disabled={drafts.length >= 20}>Another slot</button><button className="primary" disabled={!drafts.some(d => d.trim())} onClick={() => void action(async () => { await addNotes(drafts.filter(d => d.trim())); setDrafts(items => items.map(() => '')); setPanel('session') })}>Reveal my ideas</button></div>
            <p className="subtle">Reveal when the team is ready. This doesn’t reveal anybody else’s drafts.</p>
          </>}
          {panel === 'ai' && <>
            <h2>A thinking partner on your board.</h2><p>Connect your AI chat through MCP, then ask it to read this board. It can add notes, connect ideas and map the architecture.</p>
            <details><summary>Connect your AI</summary><p>Run <code>node local/server/mcp.mjs</code> as a stdio MCP server from this repository. The local README has the full configuration. Keep the workspace running.</p><p>No model runs inside this page. Your existing AI chat does the thinking.</p></details>
            <button className="primary" disabled={!selectedIds.length} onClick={() => void action(divergeSelection)}>✧ Diverge thinking</button><p className="subtle">Select an idea or section on the canvas first.</p>
            <label htmlFor="ai-request">Request for your AI chat</label><textarea id="ai-request" className="ai-request" value={aiRequest || `Use the night-crew MCP server. Read board ${boardId} and its current phase. Help us develop our vision, ask about missing context, and build on the canvas. Preserve the original ideas.`} onChange={e => setAiRequest(e.target.value)} />
            <button onClick={() => void action(async () => { await navigator.clipboard.writeText(aiRequest || `Use the night-crew MCP server. Read board ${boardId} and help us brainstorm according to its current session phase.`); setStatus('AI request copied') })}>Copy request</button>
            <h3>Shared discussion</h3><div className="discussion" aria-live="polite">{board.messages.length === 0 ? <p className="subtle">Questions and real AI replies can stay with the board.</p> : board.messages.map(m => <article key={m.id}><strong>{m.author}</strong><p>{m.text}</p></article>)}</div>
            <label htmlFor="participant-name">Your name<input id="participant-name" value={author} onChange={e => { setAuthor(e.target.value); safeSet('night-crew-name', e.target.value) }} maxLength={80} /></label>
            <textarea aria-label="Discussion message" value={message} onChange={e => setMessage(e.target.value)} placeholder="Ask a question or capture a thought…" maxLength={10000} />
            <button disabled={!message.trim()} onClick={() => void action(async () => { await patch({ message: { id: uid(), author: author || 'Teammate', text: message.trim() } }, false); setMessage('') })}>Post to discussion</button>
          </>}
        </div>
      </aside>}
    </div>
    {stickyOpen && <StickyComposer onClose={() => setStickyOpen(false)} onAdd={addSticky} />}
  </main></DraftBoard.Provider>
}

function StickyComposer({ onClose, onAdd }: { onClose: () => void; onAdd: (text: string) => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [text, setText] = useState('')
  useEffect(() => { dialog.current?.showModal() }, [])
  return <dialog ref={dialog} className="sticky-composer" aria-labelledby="sticky-title" onCancel={onClose}>
    <form onSubmit={event => { event.preventDefault(); if (text.trim()) onAdd(text.trim()) }}>
      <h2 id="sticky-title">New sticky note</h2>
      <label>Sticky note text<textarea autoFocus value={text} onChange={event => setText(event.target.value)} maxLength={10000} placeholder="One idea to build on…" /></label>
      <div className="button-row"><button type="button" onClick={onClose}>Cancel</button><button className="primary" disabled={!text.trim()}>Add sticky note</button></div>
    </form>
  </dialog>
}

function DrawingStickyTool({ root, onAdd }: { root: React.RefObject<HTMLDivElement | null>; onAdd: () => void }) {
  const [host, setHost] = useState<HTMLElement | null>(null)
  useEffect(() => {
    const container = root.current
    if (!container) return
    // The pinned editor has no custom-shape-toolbar slot; follow toolbar remounts.
    const findToolbar = () => setHost(container.querySelector<HTMLElement>('.App-toolbar > .Stack'))
    findToolbar()
    const observer = new MutationObserver(findToolbar)
    observer.observe(container, { childList: true, subtree: true })
    return () => observer.disconnect()
  }, [root])
  return host ? createPortal(<button className="sticky-tool" aria-label="Sticky note" title="Sticky note" onClick={onAdd}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M5 3h14a2 2 0 0 1 2 2v10l-6 6H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z"/><path d="M15 21v-4a2 2 0 0 1 2-2h4M7 8h10M7 12h6"/></svg></button>, host) : null
}

function CanvasContextActions({ menu, root, enabled, onAddSticky, onDiverge }: { menu: AppState['contextMenu']; root: React.RefObject<HTMLDivElement | null>; enabled: boolean; onAddSticky: () => void; onDiverge: () => void }) {
  const [host, setHost] = useState<HTMLElement | null>(null)
  // Excalidraw 0.18.1 has no custom-menu prop. Keep its hit testing and commands;
  // portal only our rows into its menu. Recheck this selector when upgrading it.
  useLayoutEffect(() => { setHost(menu ? root.current?.querySelector<HTMLElement>('.context-menu') ?? null : null) }, [menu, root])
  useLayoutEffect(() => {
    if (!host) return
    const popover = host.closest<HTMLElement>('.popover')
    if (!popover) return
    const viewport = root.current?.getBoundingClientRect()
    if (!viewport) return
    popover.style.maxHeight = `${viewport.height - 16}px`
    popover.style.overflowY = 'auto'
    const bounds = popover.getBoundingClientRect()
    const dx = Math.min(0, viewport.right - 8 - bounds.right) + Math.max(0, viewport.left + 8 - bounds.left)
    const dy = Math.min(0, viewport.bottom - 8 - bounds.bottom) + Math.max(0, viewport.top + 8 - bounds.top)
    popover.style.left = `${parseFloat(popover.style.left || '0') + dx}px`
    popover.style.top = `${parseFloat(popover.style.top || '0') + dy}px`
  }, [host, enabled])
  return menu && host ? createPortal(<><li className="diverge-context-row"><button type="button" className="context-menu-item" onClick={onAddSticky}><span className="context-menu-item__label">Add sticky note</span></button></li>{enabled && <li><button type="button" aria-label="Diverge thinking" className="context-menu-item" onClick={onDiverge}><span className="context-menu-item__label">✧ Diverge thinking</span></button></li>}</>, host) : null
}

function EditableText({ label, value, placeholder, save }: { label: string; value: string; placeholder: string; save: (value: string) => Promise<unknown> }) {
  const boardId = React.useContext(DraftBoard)
  const storageKey = `field-draft:${boardId}:${label}`
  const [savedDraft] = useState(() => { try { return JSON.parse(safeGet(storageKey) ?? 'null') } catch { return null } })
  const [draft, setDraft] = useState(savedDraft?.draft ?? value)
  const [dirty, setDirty] = useState(!!savedDraft)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const original = useRef(savedDraft?.original ?? value)
  useEffect(() => {
    if (dirty) safeSet(storageKey, JSON.stringify({ draft, original: original.current }))
    else { try { localStorage.removeItem(storageKey) } catch { /* storage unavailable */ } }
  }, [draft, dirty, storageKey])
  useEffect(() => { if (!dirty) setDraft(value) }, [value, dirty])
  return <div className="editable-text" data-dirty={dirty}><label>{label}<textarea value={draft} onChange={e => { if (!dirty) original.current = value; setDraft(e.target.value); setDirty(true) }} placeholder={placeholder} maxLength={10000} /></label>
    {dirty && <div className="button-row"><button disabled={busy} onClick={async () => { setBusy(true); try { if (value !== original.current) throw new Error('A teammate changed this field. Copy your draft, discard it to read their update, then combine your ideas.'); await save(draft); setDirty(false); setError('') } catch (e) { setError((e as Error).message) } finally { setBusy(false) } }}>Save</button><button onClick={() => { setDraft(value); setDirty(false); setError('') }}>Discard my edit</button></div>}
    {error && <p role="alert" className="inline-error">{error}</p>}
  </div>
}
