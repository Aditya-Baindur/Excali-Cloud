'use client'

/* eslint-disable @next/next/no-img-element -- Media thumbnails use local blob URLs. */

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { DropdownMenu } from 'radix-ui'
import {
  ArrowLeft,
  ChevronDown,
  Copy,
  Download,
  Film,
  HelpCircle,
  Layers,
  Music2,
  PanelLeft,
  PanelRight,
  Plus,
  Redo2,
  Scissors,
  Search,
  SlidersHorizontal,
  Trash2,
  Type,
  Undo2,
  Upload,
  X,
} from 'lucide-react'
import {
  commands,
  createLayerJSON,
  Preview,
  Timeline,
  useEditorStore,
  type VideoJSON,
} from '@videoflow/react-video-editor'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog'
import { useEditorUI, type LibraryTab } from './EditorContext'
import {
  canDetachAudio,
  canSplit,
  closeGaps,
  detachAudio,
  duplicateSelected,
  getSelected,
  rippleDelete,
  splitSelected,
  trimSelected,
} from './editing'
import {
  applyStaticProperties,
  LOOK_PRESETS,
  TITLE_PRESETS,
  TRANSITION_PRESETS,
} from './presets'
import EditorInspector from './EditorInspector'
import Voiceover from './Voiceover'

const LIBRARY_TABS: { id: LibraryTab; label: string }[] = [
  { id: 'media', label: 'Media' },
  { id: 'audio', label: 'Audio' },
  { id: 'titles', label: 'Titles' },
  { id: 'transitions', label: 'Transitions' },
  { id: 'looks', label: 'Looks' },
  { id: 'backgrounds', label: 'Backgrounds' },
]

function layersInScope(video: VideoJSON, path: string[]) {
  let layers = video.layers
  for (const id of path) {
    const group = layers.find(
      (layer) => layer.id === id && layer.type === 'group'
    )
    if (!group) return []
    layers = group.children ?? []
  }
  return layers
}

function clampPlayhead() {
  const state = useEditorStore.getState()
  const fps = state.video.fps || 30
  let offset = 0
  let duration = state.video.duration
  let layers = state.video.layers
  for (const id of state.activeGroupPath) {
    const group = layers.find(
      (layer) => layer.id === id && layer.type === 'group'
    )
    if (!group) break
    offset += group.settings.startTime - (group.settings.sourceStart ?? 0)
    duration = group.settings.sourceDuration
    layers = group.children ?? []
  }
  const start = Math.max(0, offset)
  const first = Math.ceil(start * fps)
  const last = Math.max(first, Math.ceil((start + duration) * fps) - 1)
  const frame = Math.max(first, Math.min(last, state.currentFrame))
  if (frame === state.currentFrame) return
  state.bridge?.stop()
  state.setPlaying(false)
  state.setCurrentFrame(frame)
  return state.bridge?.seek(frame)
}

function IconButton({
  label,
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string
  children: ReactNode
}) {
  return (
    <button
      type="button"
      className="editor-icon-button"
      title={label}
      aria-label={label}
      {...props}
    >
      {children}
    </button>
  )
}

export function EditorTitlebar({
  onSave,
}: {
  onSave?: () => void
  onExport?: () => void
  branding?: ReactNode
}) {
  const ui = useEditorUI()
  const name = useEditorStore((s) => s.video.name)
  const canUndo = useEditorStore((s) => s.undoStack.length > 0)
  const canRedo = useEditorStore((s) => s.redoStack.length > 0)
  const ids = useEditorStore((s) => s.selection.layerIds)
  const video = useEditorStore((s) => s.video)
  const frame = useEditorStore((s) => s.currentFrame)
  const activeGroupPath = useEditorStore((s) => s.activeGroupPath)
  const [help, setHelp] = useState(false)
  const selectedLayers = getSelected(video, ids)
  const selected = selectedLayers.length > 0
  const execute = async (
    label: string,
    recipe: (video: VideoJSON, ids: string[], time: number) => string[] | void
  ) => {
    const state = useEditorStore.getState()
    state.bridge?.stop()
    state.setPlaying(false)
    try {
      const result: { ids?: string[] } = {}
      await state.commit(
        (draft) => {
          const next = recipe(
            draft,
            state.selection.layerIds,
            state.currentFrame / state.video.fps
          )
          if (next) result.ids = next
        },
        { label }
      )
      const current = useEditorStore.getState()
      current.selectLayers(
        result.ids?.length
          ? result.ids
          : getSelected(current.video, current.selection.layerIds).map(
              (layer) => layer.id
            )
      )
      await clampPlayhead()
    } catch (error) {
      ui.reportError(error)
    }
  }
  const actionRef = useRef(execute)
  useEffect(() => {
    actionRef.current = execute
  })
  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement
      if (
        target.closest(
          'input, textarea, select, [contenteditable="true"], [role="dialog"], [role="menu"]'
        ) ||
        event.repeat
      )
        return
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'b') {
        event.preventDefault()
        void actionRef.current('Split clip', splitSelected)
      } else if (
        (event.metaKey || event.ctrlKey) &&
        event.key.toLowerCase() === 'd'
      ) {
        event.preventDefault()
        void actionRef.current('Duplicate clips', duplicateSelected)
      } else if (
        event.shiftKey &&
        !event.metaKey &&
        !event.ctrlKey &&
        ['Backspace', 'Delete'].includes(event.key)
      ) {
        event.preventDefault()
        event.stopImmediatePropagation()
        void actionRef.current('Ripple delete', rippleDelete)
      }
    }
    window.addEventListener('keydown', shortcut, { capture: true })
    return () =>
      window.removeEventListener('keydown', shortcut, { capture: true })
  }, [])

  useEffect(() => {
    let mounted = true
    const unsubscribe = useEditorStore.subscribe((state, previous) => {
      if (state.video === previous.video) return
      // The store publishes JSON before enqueueing its renderer update. Defer
      // seeking until that update is queued, including native drag/undo edits.
      queueMicrotask(() => {
        if (mounted) void Promise.resolve(clampPlayhead()).catch(ui.reportError)
      })
    })
    return () => {
      mounted = false
      unsubscribe()
    }
  }, [ui.reportError])

  const more = [
    {
      label: 'Trim start to playhead',
      disabled: !selected,
      run: () =>
        execute('Trim start', (draft, selection, time) =>
          trimSelected(draft, selection, time, 'start')
        ),
    },
    {
      label: 'Trim end to playhead',
      disabled: !selected,
      run: () =>
        execute('Trim end', (draft, selection, time) =>
          trimSelected(draft, selection, time, 'end')
        ),
    },
    {
      label: 'Ripple delete',
      disabled: !selected,
      run: () => execute('Ripple delete', rippleDelete),
    },
    {
      label: 'Close gaps',
      disabled: !layersInScope(video, activeGroupPath).length,
      run: () =>
        execute('Close gaps', (draft, selection) =>
          closeGaps(
            draft,
            selection.length
              ? selection
              : layersInScope(draft, activeGroupPath).map((layer) => layer.id)
          )
        ),
    },
    {
      label: 'Detach audio',
      disabled: !canDetachAudio(video, ids),
      run: () => execute('Detach audio', detachAudio),
    },
    {
      label: 'Group clips',
      disabled: selectedLayers.length < 2,
      run: async () => {
        const state = useEditorStore.getState()
        const id = await commands.groupLayersCommand(
          state.commit,
          state.selection.layerIds
        )
        if (id) state.selectLayers([id])
      },
    },
  ]
  return (
    <header className="editor-titlebar">
      <div className="editor-mainbar">
        <button
          type="button"
          className="editor-icon-button"
          aria-label="Back to board"
          title={ui.boardName}
          disabled={!!ui.busy}
          onClick={() => void ui.leaveEditor().catch(ui.reportError)}
        >
          <ArrowLeft size={16} />
        </button>
        <input
          aria-label="Project name"
          className="editor-project-name"
          value={name}
          onChange={(event) =>
            void commands
              .setProjectSettingsCommand(useEditorStore.getState().commit, {
                name: event.target.value,
              })
              .catch(ui.reportError)
          }
        />
        <span className="editor-toolbar-spacer" />
        <IconButton
          label="Undo (⌘Z)"
          disabled={!canUndo}
          onClick={() =>
            void useEditorStore.getState().undo().catch(ui.reportError)
          }
        >
          <Undo2 size={16} />
        </IconButton>
        <IconButton
          label="Redo (⌘⇧Z)"
          disabled={!canRedo}
          onClick={() =>
            void useEditorStore.getState().redo().catch(ui.reportError)
          }
        >
          <Redo2 size={16} />
        </IconButton>
        <span className="editor-toolbar-divider" />
        <IconButton
          label="Toggle media library"
          aria-pressed={ui.libraryOpen}
          onClick={() => ui.setLibraryOpen(!ui.libraryOpen)}
        >
          <PanelLeft size={16} />
        </IconButton>
        <IconButton
          label="Toggle inspector"
          aria-pressed={ui.inspectorOpen}
          onClick={() => ui.setInspectorOpen(!ui.inspectorOpen)}
        >
          <PanelRight size={16} />
        </IconButton>
        <DropdownMenu.Root>
          <DropdownMenu.Trigger
            className="editor-text-button"
            aria-label="Project options"
          >
            Project <ChevronDown size={12} />
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content
              className="editor-menu"
              sideOffset={8}
              align="end"
              onKeyDown={(event) => event.stopPropagation()}
            >
              <DropdownMenu.Item onSelect={() => onSave?.()}>
                Save draft <span>⌘S</span>
              </DropdownMenu.Item>
              <DropdownMenu.Item onSelect={ui.backupProject}>
                Download project
              </DropdownMenu.Item>
              <DropdownMenu.Item onSelect={ui.importProject}>
                Open project…
              </DropdownMenu.Item>
              <DropdownMenu.Separator />
              <DropdownMenu.Item onSelect={ui.importCaptions}>
                Import subtitles…
              </DropdownMenu.Item>
              <DropdownMenu.Item
                onSelect={() => {
                  useEditorStore.getState().clearSelection()
                  ui.setInspectorOpen(true)
                }}
              >
                Project settings
              </DropdownMenu.Item>
              <DropdownMenu.Item onSelect={() => setHelp(true)}>
                Keyboard shortcuts
              </DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
        <button
          className="editor-export-button"
          disabled={!video.layers.length || !!ui.busy}
          onClick={ui.exportVideo}
        >
          <Download size={14} /> Export
        </button>
      </div>
      <div className="editor-editbar">
        <button
          className="editor-text-button"
          disabled={!!ui.busy}
          onClick={ui.importMedia}
        >
          <Plus size={15} /> Import
        </button>
        <Voiceover />
        <span className="editor-toolbar-divider" />
        <button
          className="editor-text-button"
          disabled={!canSplit(video, ids, frame / video.fps)}
          title="Split at playhead (⌘B)"
          onClick={() => void execute('Split clip', splitSelected)}
        >
          <Scissors size={15} /> Split
        </button>
        <IconButton
          label="Duplicate clips (⌘D)"
          disabled={!selected}
          onClick={() => void execute('Duplicate clips', duplicateSelected)}
        >
          <Copy size={15} />
        </IconButton>
        <IconButton
          label="Delete selected clips"
          disabled={!selected}
          onClick={() =>
            void commands
              .removeLayersCommand(useEditorStore.getState().commit, ids)
              .then(() => useEditorStore.getState().clearSelection())
              .catch(ui.reportError)
          }
        >
          <Trash2 size={15} />
        </IconButton>
        <DropdownMenu.Root>
          <DropdownMenu.Trigger className="editor-text-button">
            Edit <ChevronDown size={12} />
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content
              className="editor-menu"
              sideOffset={7}
              onKeyDown={(event) => event.stopPropagation()}
            >
              {more.map((item) => (
                <DropdownMenu.Item
                  key={item.label}
                  disabled={item.disabled}
                  onSelect={() => void item.run().catch(ui.reportError)}
                >
                  {item.label}
                </DropdownMenu.Item>
              ))}
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
        <span className="editor-toolbar-spacer" />
        <span className="editor-short-status">
          {ui.busy || `${video.width} × ${video.height} · ${video.fps} fps`}
        </span>
        <IconButton label="Keyboard shortcuts" onClick={() => setHelp(true)}>
          <HelpCircle size={15} />
        </IconButton>
      </div>
      <Dialog open={help} onOpenChange={setHelp}>
        <DialogContent
          className="dark border-white/10 bg-neutral-950 text-white"
          onKeyDown={(event) => event.stopPropagation()}
        >
          <DialogTitle>Keyboard shortcuts</DialogTitle>
          <DialogDescription className="sr-only">
            Editing and navigation shortcuts.
          </DialogDescription>
          <dl className="editor-shortcuts">
            {[
              ['Play / pause', 'Space'],
              ['Split clip', '⌘ / Ctrl B'],
              ['Duplicate', '⌘ / Ctrl D'],
              ['Delete', 'Delete'],
              ['Ripple delete', 'Shift Delete'],
              ['Undo / redo', '⌘Z / ⌘⇧Z'],
              ['Previous / next frame', '← / →'],
              ['Jump one second', 'Shift ← / →'],
              ['Previous / next edit', '↑ / ↓'],
              ['Save draft', '⌘ / Ctrl S'],
              ['Switch board', '⌘ / Ctrl K'],
              ['Fit preview', 'Z'],
            ].map(([label, key]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{key}</dd>
              </div>
            ))}
          </dl>
        </DialogContent>
      </Dialog>
    </header>
  )
}

function EditorLibrary() {
  const ui = useEditorUI()
  const [search, setSearch] = useState('')
  const ids = useEditorStore((s) => s.selection.layerIds)
  const video = useEditorStore((s) => s.video)
  const selected = useMemo(() => getSelected(video, ids), [video, ids])
  const visual = selected.filter(
    (layer) => !['audio', 'group'].includes(layer.type)
  )
  const [transitionEdge, setTransitionEdge] = useState<'in' | 'out'>('in')
  const [transitionDuration, setTransitionDuration] = useState(0.5)
  const tab = ui.libraryTab
  const media = ui.assets.filter(
    (asset) =>
      (tab === 'audio' ? asset.type === 'audio' : asset.type !== 'audio') &&
      asset.name.toLowerCase().includes(search.toLowerCase())
  )

  async function addTitle(index: number) {
    const preset = TITLE_PRESETS[index]
    useEditorStore.getState().exitToRoot()
    const state = useEditorStore.getState()
    const layer = createLayerJSON({
      type: 'text',
      startTime: state.currentFrame / state.video.fps,
      sourceDuration: 4,
      properties: preset.properties,
    })
    layer.transitionIn = preset.transitionIn
    layer.track =
      Math.max(-1, ...state.video.layers.map((l) => l.track ?? 0)) + 1
    await state.commit(
      (draft) => {
        draft.layers.push(layer)
      },
      { label: `Add ${preset.label.toLowerCase()} title` }
    )
    state.selectLayers([layer.id])
    ui.setInspectorOpen(true)
  }
  async function addBackground(color: string) {
    useEditorStore.getState().exitToRoot()
    const state = useEditorStore.getState()
    const short = Math.min(state.video.width, state.video.height)
    const id = await commands.addLayerCommand(
      state.commit,
      {
        type: 'shape',
        startTime: state.currentFrame / state.video.fps,
        sourceDuration: 5,
        properties: {
          fill: color,
          width: (state.video.width / short) * 100,
          height: (state.video.height / short) * 100,
        },
        extraSettings: { shapeType: 'rectangle' },
      },
      0,
      0,
      []
    )
    state.selectLayers([id])
  }
  return (
    <section className="editor-library" aria-label="Media and effects library">
      <div
        className="editor-library-tabs"
        role="tablist"
        aria-label="Library sections"
      >
        {LIBRARY_TABS.map(({ id, label }) => (
          <button
            key={id}
            role="tab"
            aria-selected={tab === id}
            onClick={() => ui.setLibraryTab(id)}
          >
            {label}
          </button>
        ))}
      </div>
      <div
        className="editor-library-body"
        role="tabpanel"
        aria-label={LIBRARY_TABS.find((item) => item.id === tab)?.label}
      >
        {tab === 'media' || tab === 'audio' ? (
          <>
            <label className="editor-search">
              <Search size={14} />
              <input
                aria-label="Search media"
                placeholder="Search media"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </label>
            <div className="editor-library-imports">
              <button
                className="editor-text-button"
                disabled={!!ui.busy}
                onClick={ui.importMedia}
              >
                <Upload size={14} /> Import media
              </button>
            </div>
            {!media.length ? (
              <div className="editor-empty">
                <span>
                  {tab === 'audio' ? <Music2 size={24} /> : <Film size={24} />}
                </span>
                <p>
                  {search
                    ? 'No matching media'
                    : tab === 'audio'
                      ? 'Import music or record a voiceover'
                      : 'Drop clips or photos here'}
                </p>
              </div>
            ) : null}
            <div className="editor-media-grid">
              {media.map((asset) => (
                <article key={asset.id} className="editor-media-card">
                  <button
                    className="editor-media-thumb"
                    title={`Add ${asset.name} to timeline`}
                    aria-label={`Add ${asset.name} to timeline`}
                    disabled={!!ui.busy}
                    onClick={() =>
                      void ui.addAsset(asset).catch(ui.reportError)
                    }
                  >
                    {asset.type === 'video' ? (
                      <video
                        src={asset.source}
                        muted
                        playsInline
                        preload="metadata"
                        aria-hidden="true"
                      />
                    ) : asset.type === 'image' ? (
                      <img src={asset.source} alt="" />
                    ) : (
                      <Music2 size={26} />
                    )}
                    <span className="editor-media-add">
                      <Plus size={15} />
                    </span>
                  </button>
                  <p title={asset.name}>{asset.name}</p>
                  <button
                    className="editor-media-at-playhead"
                    disabled={!!ui.busy}
                    onClick={() =>
                      void ui.addAsset(asset, true).catch(ui.reportError)
                    }
                  >
                    Add at playhead
                  </button>
                </article>
              ))}
            </div>
            {tab === 'audio' ? (
              <button
                className="editor-text-button editor-wide-button"
                onClick={ui.importCaptions}
              >
                <Type size={14} /> Import subtitles
              </button>
            ) : null}
          </>
        ) : null}
        {tab === 'titles' ? (
          <>
            <div className="editor-preset-grid">
              {TITLE_PRESETS.map((preset, index) => (
                <button
                  key={preset.id}
                  className={`editor-preset editor-title-${preset.id}`}
                  onClick={() => void addTitle(index).catch(ui.reportError)}
                >
                  <span>Aa</span>
                  <small>{preset.label}</small>
                </button>
              ))}
            </div>
            <button
              className="editor-text-button editor-wide-button"
              onClick={ui.importCaptions}
            >
              <Type size={14} /> Import SRT / VTT
            </button>
          </>
        ) : null}
        {tab === 'transitions' ? (
          <>
            <div className="editor-transition-options">
              <select
                aria-label="Transition edge"
                value={transitionEdge}
                onChange={(e) =>
                  setTransitionEdge(e.target.value as 'in' | 'out')
                }
              >
                <option value="in">Clip start</option>
                <option value="out">Clip end</option>
              </select>
              <label>
                <input
                  type="number"
                  aria-label="Transition duration"
                  min={0.1}
                  max={5}
                  step={0.1}
                  value={transitionDuration}
                  onChange={(e) =>
                    setTransitionDuration(Math.max(0.1, Number(e.target.value)))
                  }
                />
                s
              </label>
            </div>
            {!visual.length ? (
              <p className="editor-hint">Select a clip to add a transition.</p>
            ) : null}
            <div className="editor-preset-grid">
              {TRANSITION_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  className="editor-preset"
                  disabled={
                    !visual.length ||
                    (!!preset.textOnly &&
                      !visual.every((layer) =>
                        ['text', 'captions'].includes(layer.type)
                      ))
                  }
                  onClick={() =>
                    void useEditorStore
                      .getState()
                      .commit(
                        (draft) => {
                          const edge =
                            transitionEdge === 'in'
                              ? 'transitionIn'
                              : 'transitionOut'
                          for (const layer of getSelected(draft, ids)) {
                            if (['audio', 'group'].includes(layer.type))
                              continue
                            if (
                              preset.textOnly &&
                              !['text', 'captions'].includes(layer.type)
                            )
                              continue
                            if (!preset.id) {
                              delete layer[edge]
                              continue
                            }
                            const speed = Math.abs(layer.settings.speed ?? 1)
                            const duration =
                              layer.settings.sourceDuration / speed
                            if (!Number.isFinite(duration) || duration <= 0)
                              continue
                            layer[edge] = {
                              transition: preset.id,
                              duration: Math.min(
                                transitionDuration,
                                duration / 2
                              ),
                            }
                          }
                        },
                        {
                          label: preset.id
                            ? `Apply ${preset.label} transition`
                            : 'Remove transition',
                        }
                      )
                      .catch(ui.reportError)
                  }
                >
                  <span className={`editor-transition-swatch ${preset.id}`}>
                    <i />
                    <i />
                  </span>
                  <small>{preset.label}</small>
                </button>
              ))}
            </div>
          </>
        ) : null}
        {tab === 'looks' ? (
          <>
            {!visual.length ? (
              <p className="editor-hint">Select a clip to apply a look.</p>
            ) : null}
            <div className="editor-preset-grid">
              {LOOK_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  className="editor-preset"
                  disabled={!visual.length}
                  onClick={() =>
                    void useEditorStore
                      .getState()
                      .commit(
                        (draft) => {
                          for (const layer of getSelected(draft, ids)) {
                            if (!['audio', 'group'].includes(layer.type))
                              applyStaticProperties(layer, preset.properties)
                          }
                        },
                        { label: `Apply ${preset.label} look` }
                      )
                      .catch(ui.reportError)
                  }
                >
                  <span className={`editor-look-swatch ${preset.id}`}>
                    <i />
                  </span>
                  <small>{preset.label}</small>
                </button>
              ))}
            </div>
          </>
        ) : null}
        {tab === 'backgrounds' ? (
          <div className="editor-preset-grid">
            {[
              ['Black', '#000000'],
              ['White', '#ffffff'],
              ['Slate', '#1e293b'],
              ['Midnight', '#172554'],
              ['Warm', '#78350f'],
              ['Plum', '#581c87'],
              ['Forest', '#14532d'],
              ['Rose', '#881337'],
            ].map(([name, color]) => (
              <button
                key={name}
                className="editor-preset"
                onClick={() => void addBackground(color).catch(ui.reportError)}
              >
                <span
                  className="editor-background-swatch"
                  style={{ background: color }}
                />
                <small>{name}</small>
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </section>
  )
}

export function EditorPreview() {
  const ui = useEditorUI()
  const empty = useEditorStore((s) => s.video.layers.length === 0)
  return (
    <div
      className={`editor-preview-workspace ${ui.libraryOpen ? 'has-library' : ''}`}
    >
      {ui.libraryOpen ? <EditorLibrary /> : null}
      <div className="editor-viewer">
        <Preview />
        {empty ? (
          <div className="editor-preview-empty">
            <Film size={32} />
            <p>Start your movie</p>
            <button disabled={!!ui.busy} onClick={ui.importMedia}>
              Import media
            </button>
            <small>or drag files onto the timeline</small>
          </div>
        ) : null}
      </div>
    </div>
  )
}

export function EditorSidebar() {
  const ui = useEditorUI()
  return ui.inspectorOpen ? (
    <aside className="editor-inspector-panel" aria-label="Clip inspector">
      <div className="editor-panel-heading">
        <SlidersHorizontal size={14} />
        <span>Inspector</span>
        <IconButton
          label="Close inspector"
          onClick={() => ui.setInspectorOpen(false)}
        >
          <X size={14} />
        </IconButton>
      </div>
      <EditorInspector onError={ui.reportError} />
    </aside>
  ) : null
}

export function EditorTimeline() {
  const duration = useEditorStore((s) => s.video.duration)
  const scale = useEditorStore((s) => s.viewport.timelineScale)
  const currentFrame = useEditorStore((s) => s.currentFrame)
  const fps = useEditorStore((s) => s.video.fps)
  const setViewport = useEditorStore((s) => s.setViewport)
  return (
    <section className="editor-timeline" aria-label="Movie timeline">
      <div className="editor-timeline-toolbar">
        <Layers size={14} />
        <span>Timeline</span>
        <span className="editor-toolbar-spacer" />
        <span className="editor-timecode">
          {(currentFrame / fps).toFixed(2)} / {duration.toFixed(2)} s
        </span>
        <button
          className="editor-text-button"
          title="Fit timeline"
          onClick={() =>
            setViewport({
              timelineScale: Math.max(
                20,
                Math.min(
                  2000,
                  (window.innerWidth - 250) / Math.max(duration * 1.2, 1)
                )
              ),
              timelineScroll: 0,
            })
          }
        >
          Fit
        </button>
        <input
          type="range"
          aria-label="Timeline zoom"
          min={20}
          max={500}
          step={5}
          value={Math.min(500, scale)}
          onChange={(e) =>
            setViewport({ timelineScale: Number(e.target.value) })
          }
        />
      </div>
      <Timeline />
    </section>
  )
}

export const EDITOR_PANELS = {
  Titlebar: EditorTitlebar,
  Preview: EditorPreview,
  Sidebar: EditorSidebar,
  Timeline: EditorTimeline,
}
