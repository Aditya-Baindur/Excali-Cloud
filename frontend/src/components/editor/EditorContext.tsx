'use client'

import { createContext, useContext } from 'react'

export type MediaAsset = {
  id: string
  name: string
  type: 'video' | 'audio' | 'image'
  source: string
}
export type LibraryTab =
  | 'media'
  | 'audio'
  | 'titles'
  | 'transitions'
  | 'looks'
  | 'backgrounds'
export type EditorUI = {
  boardId: string
  boardName: string
  assets: MediaAsset[]
  busy: string
  recording: boolean
  setRecording: (recording: boolean) => void
  leaveEditor: () => Promise<void>
  libraryOpen: boolean
  inspectorOpen: boolean
  libraryTab: LibraryTab
  setLibraryOpen: (open: boolean) => void
  setInspectorOpen: (open: boolean) => void
  setLibraryTab: (tab: LibraryTab) => void
  importMedia: () => void
  addAsset: (asset: MediaAsset, atPlayhead?: boolean) => Promise<void>
  recordAudio: (file: File, startTime: number) => Promise<void>
  importCaptions: () => void
  importProject: () => void
  backupProject: () => void
  exportVideo: () => void
  reportError: (error: unknown) => void
}

export const EditorContext = createContext<EditorUI | null>(null)
export function useEditorUI() {
  const value = useContext(EditorContext)
  if (!value) throw new Error('Editor controls must be inside the workspace.')
  return value
}
