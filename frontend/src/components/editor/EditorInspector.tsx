'use client'

import { createElement, useState, type ReactNode } from 'react'
import {
  Sidebar,
  commands,
  useEditorStore,
  type LayerJSON,
} from '@videoflow/react-video-editor'
import {
  ChevronDown,
  FlipHorizontal2,
  FlipVertical2,
  RotateCw,
} from 'lucide-react'
import {
  applyStaticProperties,
  LOOK_PRESETS,
  TITLE_PRESETS,
  TRANSITION_PRESETS,
} from './presets'
import { setClipSpeed } from './editing'
import './inspector.css'

function findLayer(layers: LayerJSON[], id: string): LayerJSON | undefined {
  for (const layer of layers) {
    if (layer.id === id) return layer
    const child = layer.children && findLayer(layer.children, id)
    if (child) return child
  }
}

function numeric(value: unknown, fallback: number) {
  const number =
    typeof value === 'number' ? value : Number.parseFloat(String(value))
  return Number.isFinite(number) ? number : fallback
}

function Section({
  title,
  children,
  open = true,
}: {
  title: string
  children: ReactNode
  open?: boolean
}) {
  return (
    <details className="editor-inspector-section" open={open}>
      <summary>
        {title}
        <ChevronDown size={13} aria-hidden="true" />
      </summary>
      <div className="editor-inspector-fields">{children}</div>
    </details>
  )
}

function NumberField({
  label,
  value,
  onChange,
  min = 0,
  max,
  step = 0.1,
  suffix,
}: {
  label: string
  value: number
  onChange: (value: number) => void
  min?: number
  max?: number
  step?: number
  suffix?: string
}) {
  return (
    <label className="editor-inspector-field">
      <span>{label}</span>
      <div className="editor-inspector-number">
        <input
          key={value}
          aria-label={label}
          type="number"
          defaultValue={Number(value.toFixed(3))}
          min={min}
          max={max}
          step={step}
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.currentTarget.blur()
          }}
          onBlur={(event) => {
            const parsed = Number.parseFloat(event.currentTarget.value)
            if (!Number.isFinite(parsed)) {
              event.currentTarget.value = String(Number(value.toFixed(3)))
              return
            }
            const next = Math.max(min, Math.min(max ?? Infinity, parsed))
            event.currentTarget.value = String(Number(next.toFixed(3)))
            if (next !== value) onChange(next)
          }}
        />
        {suffix ? <span aria-hidden="true">{suffix}</span> : null}
      </div>
    </label>
  )
}

function SelectField({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: string
  options: { value: string; label: string }[]
  onChange: (value: string) => void
}) {
  return (
    <label className="editor-inspector-field">
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {!options.some((option) => option.value === value) ? (
          <option value={value}>Custom</option>
        ) : null}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  )
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string
  checked: boolean
  onChange: (value: boolean) => void
}) {
  return (
    <label className="editor-inspector-field">
      <span>{label}</span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
    </label>
  )
}

function ColorField({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (value: string) => void
}) {
  return (
    <label className="editor-inspector-field">
      <span>{label}</span>
      <input
        aria-label={label}
        type="color"
        value={/^#[\da-f]{6}$/i.test(value) ? value : '#ffffff'}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  )
}

function SliderField({
  label,
  value,
  onChange,
  max = 2,
  min = 0,
  step = 0.01,
  percent = true,
}: {
  label: string
  value: number
  onChange: (value: number) => void
  max?: number
  min?: number
  step?: number
  percent?: boolean
}) {
  return (
    <div className="editor-inspector-slider">
      <label>
        <span>{label}</span>
        <output>
          {percent ? `${Math.round(value * 100)}%` : value.toFixed(2)}
        </output>
        <input
          aria-label={label}
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(event) => onChange(Number(event.target.value))}
        />
      </label>
    </div>
  )
}

function readAudioFades(layer: LayerJSON) {
  const keys = [
    ...(layer.animations.find((animation) => animation.property === 'volume')
      ?.keyframes ?? []),
  ].sort((a, b) => a.time - b.time)
  const sourceStart = layer.settings.sourceStart ?? 0
  const sourceEnd = sourceStart + layer.settings.sourceDuration
  const speed = Math.max(0.01, Math.abs(numeric(layer.settings.speed, 1)))
  const first = keys[0]
  const last = keys.at(-1)
  const fades = {
    in:
      keys.length > 1 &&
      first.value === 0 &&
      Math.abs(first.time - sourceStart) < 0.001
        ? Math.max(0, (keys[1].time - sourceStart) / speed)
        : 0,
    out:
      keys.length > 1 &&
      last?.value === 0 &&
      Math.abs(last.time - sourceEnd) < 0.001
        ? Math.max(0, (sourceEnd - keys[keys.length - 2].time) / speed)
        : 0,
  }
  return numeric(layer.settings.speed, 1) < 0
    ? { in: fades.out, out: fades.in }
    : fades
}

export default function EditorInspector({
  onError,
}: { onError?: (message: string) => void } = {}) {
  const commit = useEditorStore((state) => state.commit)
  const count = useEditorStore((state) => state.selection.layerIds.length)
  const layer = useEditorStore((state) =>
    state.selection.layerIds.length === 1
      ? findLayer(state.video.layers, state.selection.layerIds[0])
      : undefined
  )
  const width = useEditorStore((state) => state.video.width)
  const height = useEditorStore((state) => state.video.height)
  const fps = useEditorStore((state) => state.video.fps)
  const backgroundColor = useEditorStore((state) => state.video.backgroundColor)
  const projectName = useEditorStore((state) => state.video.name)
  const [error, setError] = useState('')

  function run(operation: Promise<unknown>) {
    setError('')
    void operation.catch((cause: unknown) => {
      const message =
        cause instanceof Error ? cause.message : 'Could not apply this change.'
      setError(message)
      onError?.(message)
    })
  }

  function editLayer(
    label: string,
    recipe: (draft: LayerJSON) => void,
    mergeKey?: string
  ) {
    if (!layer) return
    const id = layer.id
    run(
      commit(
        (video) => {
          const draft = findLayer(video.layers, id)
          if (draft) recipe(draft)
        },
        {
          label,
          mergeKey: mergeKey ? `inspector:${id}:${mergeKey}` : undefined,
        }
      )
    )
  }

  function property(name: string, value: unknown) {
    editLayer(
      `Set ${name}`,
      (draft) => applyStaticProperties(draft, { [name]: value }),
      `property:${name}`
    )
  }

  function project(
    patch: Parameters<typeof commands.setProjectSettingsCommand>[1]
  ) {
    run(commands.setProjectSettingsCommand(commit, patch))
  }

  function resizeProject(ratio: number, edge = Math.max(width, height)) {
    const even = (value: number) => Math.max(16, Math.round(value / 2) * 2)
    project(
      ratio >= 1
        ? { width: even(edge), height: even(edge / ratio) }
        : { width: even(edge * ratio), height: even(edge) }
    )
  }

  const speed = layer
    ? Math.max(0.01, Math.abs(numeric(layer.settings.speed, 1)))
    : 1
  const reversed = !!layer && numeric(layer.settings.speed, 1) < 0
  const duration = layer ? layer.settings.sourceDuration / speed : 0
  const sourceStart = layer?.settings.sourceStart ?? 0
  const mediaDuration = layer
    ? numeric(layer.settings.mediaDuration, Infinity)
    : Infinity
  const hasAudio = layer?.type === 'audio' || layer?.type === 'video'
  const isMedia = layer?.type === 'video' || layer?.type === 'image'
  const isText = layer?.type === 'text' || layer?.type === 'captions'
  const visual = !!layer && layer.type !== 'audio'
  const fades = layer ? readAudioFades(layer) : { in: 0, out: 0 }
  const volume = layer ? numeric(layer.properties.volume, 1) : 1
  const position: number[] = Array.isArray(layer?.properties.position)
    ? layer.properties.position
    : [0.5, 0.5]
  const scale: number[] = Array.isArray(layer?.properties.scale)
    ? layer.properties.scale
    : [numeric(layer?.properties.scale, 1), numeric(layer?.properties.scale, 1)]
  const rotation = Array.isArray(layer?.properties.rotation)
    ? numeric(layer.properties.rotation[0], 0)
    : numeric(layer?.properties.rotation, 0)
  const frame = 1 / fps
  const roundFrame = (seconds: number) => Math.round(seconds * fps) / fps

  function changeSpeed(value: number) {
    if (!layer) return
    const id = layer.id
    run(
      commit((video) => setClipSpeed(video, [id], value), {
        label: 'Change clip speed',
        mergeKey: `inspector:${id}:speed`,
      })
    )
  }

  function changeVolume(value: number) {
    editLayer(
      'Change volume',
      (draft) => {
        const previous = numeric(draft.properties.volume, 1)
        const animation = draft.animations.find(
          (item) => item.property === 'volume'
        )
        draft.properties.volume = value
        if (value === 0) {
          // Keep the fade envelope while silent so raising volume restores it.
          applyStaticProperties(draft, { mute: true })
          return
        }
        if (previous === 0) applyStaticProperties(draft, { mute: false })
        const reference =
          previous ||
          Math.max(
            0,
            ...(animation?.keyframes.map((key) => numeric(key.value, 0)) ?? [])
          ) ||
          1
        if (animation)
          for (const key of animation.keyframes) {
            key.value = (numeric(key.value, reference) * value) / reference
          }
      },
      'volume'
    )
  }

  function changeFade(edge: 'in' | 'out', seconds: number) {
    const fadeIn = Math.min(duration / 2, edge === 'in' ? seconds : fades.in)
    const fadeOut = Math.min(duration / 2, edge === 'out' ? seconds : fades.out)
    editLayer(
      'Change audio fade',
      (draft) => {
        draft.animations = draft.animations.filter(
          (animation) => animation.property !== 'volume'
        )
        if (!fadeIn && !fadeOut) return
        const start = draft.settings.sourceStart ?? 0
        const end = start + draft.settings.sourceDuration
        const volume = numeric(draft.properties.volume, 1)
        if (volume === 0) applyStaticProperties(draft, { mute: true })
        const gain = volume || 1
        const sourceFadeIn = reversed ? fadeOut : fadeIn
        const sourceFadeOut = reversed ? fadeIn : fadeOut
        const keys = [{ time: start, value: sourceFadeIn ? 0 : gain }]
        if (sourceFadeIn)
          keys.push({ time: start + sourceFadeIn * speed, value: gain })
        if (sourceFadeOut)
          keys.push({ time: end - sourceFadeOut * speed, value: gain })
        keys.push({ time: end, value: sourceFadeOut ? 0 : gain })
        draft.animations.push({
          property: 'volume',
          easing: 'linear',
          keyframes: [
            ...new Map(keys.map((key) => [key.time, key])).values(),
          ].sort((a, b) => a.time - b.time),
        })
      },
      `fade:${edge}`
    )
  }

  const ratio = width / height
  const ratios = [
    { value: '1.7777777777777777', label: 'Widescreen 16:9' },
    { value: '0.5625', label: 'Portrait 9:16' },
    { value: '1', label: 'Square 1:1' },
    { value: '1.3333333333333333', label: 'Classic 4:3' },
    { value: '0.8', label: 'Portrait 4:5' },
  ]
  const ratioValue =
    ratios.find((option) => Math.abs(Number(option.value) - ratio) < 0.003)
      ?.value ?? String(ratio)
  const currentLook =
    LOOK_PRESETS.find((preset) =>
      Object.entries(preset.properties).every(
        ([key, value]) =>
          !layer?.animations.some((animation) => animation.property === key) &&
          numeric(
            layer?.properties[key],
            key === 'filterBrightness' ||
              key === 'filterContrast' ||
              key === 'filterSaturate'
              ? 1
              : 0
          ) === value
      )
    )?.id ?? 'custom'

  return (
    <aside
      className="editor-inspector"
      aria-label="Editing inspector"
      onKeyDown={(event) => {
        if (event.key !== 'Escape') event.stopPropagation()
      }}
    >
      <div className="editor-inspector-heading">
        <h2>
          {count > 1
            ? `${count} clips`
            : layer
              ? layer.type === 'text'
                ? 'Title'
                : layer.type.charAt(0).toUpperCase() + layer.type.slice(1)
              : 'Project'}
        </h2>
      </div>
      {error ? (
        <p role="alert" className="editor-inspector-error">
          {error}
        </p>
      ) : null}
      {!count ? (
        <Section title="Project">
          <label className="editor-inspector-field editor-inspector-field-stack">
            <span>Name</span>
            <input
              key={projectName}
              aria-label="Project name"
              defaultValue={projectName}
              maxLength={200}
              onBlur={(event) => {
                const name = event.target.value.trim()
                if (name && name !== projectName) project({ name })
                else event.target.value = projectName
              }}
            />
          </label>
          <SelectField
            label="Aspect ratio"
            value={ratioValue}
            options={ratios}
            onChange={(value) => resizeProject(Number(value))}
          />
          <SelectField
            label="Resolution"
            value={String(Math.max(width, height))}
            options={[
              { value: '1280', label: 'HD · 1280' },
              { value: '1920', label: 'Full HD · 1920' },
              { value: '3840', label: '4K · 3840' },
            ]}
            onChange={(value) => resizeProject(ratio, Number(value))}
          />
          <div className="editor-inspector-pair">
            <NumberField
              label="Width"
              value={width}
              min={16}
              max={7680}
              step={2}
              onChange={(value) =>
                project({ width: Math.round(value / 2) * 2 })
              }
            />
            <NumberField
              label="Height"
              value={height}
              min={16}
              max={7680}
              step={2}
              onChange={(value) =>
                project({ height: Math.round(value / 2) * 2 })
              }
            />
          </div>
          <SelectField
            label="Frame rate"
            value={String(fps)}
            options={[24, 25, 30, 50, 60].map((value) => ({
              value: String(value),
              label: `${value} fps`,
            }))}
            onChange={(value) => project({ fps: Number(value) })}
          />
          <ColorField
            label="Background"
            value={backgroundColor}
            onChange={(value) => project({ backgroundColor: value })}
          />
        </Section>
      ) : null}
      {layer ? (
        <>
          <Section title="Timing">
            <NumberField
              label="Start"
              value={layer.settings.startTime}
              step={frame}
              suffix="s"
              onChange={(value) =>
                editLayer(
                  'Move clip',
                  (draft) => {
                    draft.settings.startTime = roundFrame(value)
                  },
                  'start'
                )
              }
            />
            {layer.type !== 'group' ? (
              <NumberField
                label="Duration"
                value={duration}
                min={frame}
                max={
                  Number.isFinite(mediaDuration)
                    ? Math.max(frame, (mediaDuration - sourceStart) / speed)
                    : undefined
                }
                step={frame}
                suffix="s"
                onChange={(value) =>
                  editLayer(
                    'Change clip duration',
                    (draft) => {
                      draft.settings.sourceDuration = Math.min(
                        mediaDuration - (draft.settings.sourceStart ?? 0),
                        Math.max(frame * speed, roundFrame(value) * speed)
                      )
                      delete draft.settings.sourceEnd
                    },
                    'duration'
                  )
                }
              />
            ) : null}
            {hasAudio ? (
              <>
                <NumberField
                  label="Source in"
                  value={sourceStart}
                  max={Math.max(
                    0,
                    sourceStart + layer.settings.sourceDuration - frame * speed
                  )}
                  step={frame}
                  suffix="s"
                  onChange={(value) =>
                    editLayer(
                      'Trim source in',
                      (draft) => {
                        const end =
                          (draft.settings.sourceStart ?? 0) +
                          draft.settings.sourceDuration
                        draft.settings.sourceStart = Math.min(
                          roundFrame(value),
                          Math.max(0, end - frame * speed)
                        )
                        draft.settings.sourceDuration =
                          end - draft.settings.sourceStart
                        delete draft.settings.sourceEnd
                      },
                      'source-in'
                    )
                  }
                />
                <NumberField
                  label="Source out"
                  value={sourceStart + layer.settings.sourceDuration}
                  min={sourceStart + frame * speed}
                  max={
                    Number.isFinite(mediaDuration) ? mediaDuration : undefined
                  }
                  step={frame}
                  suffix="s"
                  onChange={(value) =>
                    editLayer(
                      'Trim source out',
                      (draft) => {
                        draft.settings.sourceDuration = Math.min(
                          mediaDuration - (draft.settings.sourceStart ?? 0),
                          Math.max(
                            frame * speed,
                            roundFrame(value) -
                              (draft.settings.sourceStart ?? 0)
                          )
                        )
                        delete draft.settings.sourceEnd
                      },
                      'source-out'
                    )
                  }
                />
                <SelectField
                  label="Speed"
                  value={String(speed)}
                  options={[0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 4].map(
                    (value) => ({ value: String(value), label: `${value}×` })
                  )}
                  onChange={(value) =>
                    changeSpeed(Number(value) * (reversed ? -1 : 1))
                  }
                />
                <Toggle
                  label="Reverse"
                  checked={reversed}
                  onChange={(value) => changeSpeed(speed * (value ? -1 : 1))}
                />
              </>
            ) : null}
          </Section>
          {layer.type === 'text' ? (
            <Section title="Title">
              <label className="editor-inspector-field editor-inspector-field-stack">
                <span>Text</span>
                <textarea
                  key={layer.id}
                  aria-label="Title text"
                  value={String(layer.properties.text ?? '')}
                  rows={3}
                  onChange={(event) => property('text', event.target.value)}
                />
              </label>
              <SelectField
                label="Style"
                value="custom"
                options={[
                  { value: 'custom', label: 'Choose style…' },
                  ...TITLE_PRESETS.map((preset) => ({
                    value: preset.id,
                    label: preset.label,
                  })),
                ]}
                onChange={(id) => {
                  const preset = TITLE_PRESETS.find((item) => item.id === id)
                  if (preset)
                    editLayer('Style title', (draft) => {
                      applyStaticProperties(
                        draft,
                        Object.fromEntries(
                          Object.entries(preset.properties).filter(
                            ([key]) => key !== 'text'
                          )
                        )
                      )
                    })
                }}
              />
              <SelectField
                label="Font"
                value={String(layer.properties.fontFamily ?? 'Noto Sans')}
                options={['Arial', 'Georgia', 'Verdana', 'Courier New'].map(
                  (value) => ({ value, label: value })
                )}
                onChange={(value) => property('fontFamily', value)}
              />
              <NumberField
                label="Font size"
                value={
                  typeof layer.properties.fontSize === 'string' &&
                  layer.properties.fontSize.endsWith('px')
                    ? numeric(layer.properties.fontSize, 72)
                    : (numeric(layer.properties.fontSize, 4) * width) / 100
                }
                min={8}
                max={Math.max(width, height)}
                step={1}
                suffix="px"
                onChange={(value) =>
                  property('fontSize', (value * 100) / width)
                }
              />
              <ColorField
                label="Text color"
                value={String(layer.properties.color ?? '#ffffff')}
                onChange={(value) => property('color', value)}
              />
              <SelectField
                label="Alignment"
                value={String(layer.properties.textAlign ?? 'center')}
                options={['left', 'center', 'right'].map((value) => ({
                  value,
                  label: value.charAt(0).toUpperCase() + value.slice(1),
                }))}
                onChange={(value) => property('textAlign', value)}
              />
              <Toggle
                label="Bold"
                checked={numeric(layer.properties.fontWeight, 600) >= 700}
                onChange={(value) => property('fontWeight', value ? 700 : 400)}
              />
              <Toggle
                label="Italic"
                checked={layer.properties.fontStyle === 'italic'}
                onChange={(value) =>
                  property('fontStyle', value ? 'italic' : 'normal')
                }
              />
              <Toggle
                label="Shadow"
                checked={!!layer.properties.textShadow}
                onChange={(value) =>
                  editLayer('Change title shadow', (draft) => {
                    applyStaticProperties(draft, {
                      textShadow: value,
                      ...(value
                        ? {
                            textShadowBlur: 0.15,
                            textShadowOffset: [0, 0.08],
                            textShadowColor: '#000000',
                          }
                        : {}),
                    })
                  })
                }
              />
            </Section>
          ) : null}
          {visual ? (
            <Section title="Transform">
              {isMedia ? (
                <SelectField
                  label="Framing"
                  value={String(
                    layer.properties.fit ??
                      (layer.type === 'video' ? 'cover' : 'contain')
                  )}
                  options={[
                    { value: 'contain', label: 'Fit' },
                    { value: 'cover', label: 'Fill' },
                  ]}
                  onChange={(value) => property('fit', value)}
                />
              ) : null}
              <div className="editor-inspector-pair">
                <NumberField
                  label="X"
                  value={numeric(position[0], 0.5) * 100}
                  min={-100}
                  max={200}
                  step={1}
                  suffix="%"
                  onChange={(value) =>
                    property('position', [
                      value / 100,
                      position[1],
                      ...position.slice(2),
                    ])
                  }
                />
                <NumberField
                  label="Y"
                  value={numeric(position[1], 0.5) * 100}
                  min={-100}
                  max={200}
                  step={1}
                  suffix="%"
                  onChange={(value) =>
                    property('position', [
                      position[0],
                      value / 100,
                      ...position.slice(2),
                    ])
                  }
                />
              </div>
              <NumberField
                label="Scale"
                value={Math.abs(scale[0]) * 100}
                min={1}
                max={500}
                step={1}
                suffix="%"
                onChange={(value) =>
                  property('scale', [
                    (Math.sign(scale[0] || 1) * value) / 100,
                    (Math.sign(scale[1] || 1) * value) / 100,
                    ...scale.slice(2),
                  ])
                }
              />
              <NumberField
                label="Rotation"
                value={rotation}
                min={-360}
                max={360}
                step={1}
                suffix="°"
                onChange={(value) =>
                  property(
                    'rotation',
                    Array.isArray(layer.properties.rotation)
                      ? [value, ...layer.properties.rotation.slice(1)]
                      : value
                  )
                }
              />
              <div className="editor-inspector-buttons">
                <button
                  title="Rotate 90 degrees"
                  aria-label="Rotate 90 degrees"
                  onClick={() =>
                    property(
                      'rotation',
                      Array.isArray(layer.properties.rotation)
                        ? [
                            (rotation + 90) % 360,
                            ...layer.properties.rotation.slice(1),
                          ]
                        : (rotation + 90) % 360
                    )
                  }
                >
                  <RotateCw size={15} />
                  90°
                </button>
                <button
                  title="Flip horizontally"
                  aria-label="Flip horizontally"
                  onClick={() =>
                    property('scale', [-scale[0], scale[1], ...scale.slice(2)])
                  }
                >
                  <FlipHorizontal2 size={15} />
                </button>
                <button
                  title="Flip vertically"
                  aria-label="Flip vertically"
                  onClick={() =>
                    property('scale', [scale[0], -scale[1], ...scale.slice(2)])
                  }
                >
                  <FlipVertical2 size={15} />
                </button>
              </div>
              {isMedia ? (
                <div className="editor-inspector-buttons">
                  <button
                    onClick={() =>
                      editLayer('Picture in picture', (draft) => {
                        applyStaticProperties(draft, {
                          scale: 0.28,
                          position: [0.8, 0.79],
                          anchor: [0.5, 0.5],
                          fit: 'contain',
                        })
                      })
                    }
                  >
                    Picture in picture
                  </button>
                  <button
                    onClick={() =>
                      editLayer('Full frame', (draft) => {
                        applyStaticProperties(draft, {
                          scale: 1,
                          position: [0.5, 0.5],
                          anchor: [0.5, 0.5],
                          rotation: 0,
                        })
                      })
                    }
                  >
                    Full frame
                  </button>
                </div>
              ) : null}
              <SliderField
                label="Opacity"
                value={numeric(layer.properties.opacity, 1)}
                max={1}
                onChange={(value) => property('opacity', value)}
              />
            </Section>
          ) : null}
          {hasAudio ? (
            <Section title="Audio">
              <Toggle
                label="Mute"
                checked={!!layer.properties.mute}
                onChange={(value) => {
                  if (!value && volume === 0) changeVolume(1)
                  else property('mute', value)
                }}
              />
              <SliderField
                label="Volume"
                value={volume}
                onChange={changeVolume}
              />
              <NumberField
                label="Fade in"
                value={fades.in}
                max={duration / 2}
                step={0.1}
                suffix="s"
                onChange={(value) => changeFade('in', value)}
              />
              <NumberField
                label="Fade out"
                value={fades.out}
                max={duration / 2}
                step={0.1}
                suffix="s"
                onChange={(value) => changeFade('out', value)}
              />
            </Section>
          ) : null}
          {visual ? (
            <Section title="Color">
              <SelectField
                label="Look"
                value={currentLook}
                options={LOOK_PRESETS.map((preset) => ({
                  value: preset.id,
                  label: preset.label,
                }))}
                onChange={(id) => {
                  const preset = LOOK_PRESETS.find((item) => item.id === id)
                  if (preset)
                    editLayer('Apply look', (draft) => {
                      applyStaticProperties(draft, preset.properties)
                    })
                }}
              />
              <SliderField
                label="Brightness"
                value={numeric(layer.properties.filterBrightness, 1)}
                onChange={(value) => property('filterBrightness', value)}
              />
              <SliderField
                label="Contrast"
                value={numeric(layer.properties.filterContrast, 1)}
                onChange={(value) => property('filterContrast', value)}
              />
              <SliderField
                label="Saturation"
                value={numeric(layer.properties.filterSaturate, 1)}
                max={3}
                onChange={(value) => property('filterSaturate', value)}
              />
            </Section>
          ) : null}
          <Section title="Transitions">
            {(['in', 'out'] as const).map((edge) => {
              const transition =
                edge === 'in' ? layer.transitionIn : layer.transitionOut
              const options = TRANSITION_PRESETS.filter((preset) =>
                layer.type === 'audio'
                  ? !preset.id || preset.id === 'fade'
                  : !preset.textOnly || isText
              )
              return (
                <div className="editor-inspector-transition" key={edge}>
                  <SelectField
                    label={edge === 'in' ? 'In' : 'Out'}
                    value={transition?.transition ?? ''}
                    options={options.map((preset) => ({
                      value: preset.id,
                      label: preset.label,
                    }))}
                    onChange={(value) =>
                      run(
                        commands.setTransitionCommand(
                          commit,
                          layer.id,
                          edge,
                          value
                            ? {
                                transition: value,
                                duration: Math.min(
                                  duration / 2,
                                  transition?.duration ?? 0.4
                                ),
                              }
                            : null
                        )
                      )
                    }
                  />
                  {transition ? (
                    <NumberField
                      label={`${edge === 'in' ? 'In' : 'Out'} duration`}
                      value={transition.duration}
                      min={Math.min(frame, duration / 2)}
                      max={duration / 2}
                      step={frame}
                      suffix="s"
                      onChange={(value) =>
                        run(
                          commands.setTransitionDurationCommand(
                            commit,
                            layer.id,
                            edge,
                            value
                          )
                        )
                      }
                    />
                  ) : null}
                </div>
              )
            })}
          </Section>
        </>
      ) : null}
      <Section title="Advanced" open={count > 1}>
        {createElement(
          'vf-editor',
          { 'data-theme': 'dark', className: 'editor-inspector-advanced' },
          <Sidebar />
        )}
      </Section>
    </aside>
  )
}
