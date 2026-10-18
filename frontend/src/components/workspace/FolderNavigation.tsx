'use client'

import { DropdownMenu } from 'radix-ui'
import {
  Folder as FolderIcon,
  FolderOpen,
  Layers3,
  Loader2,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react'
import type { Board, Folder } from '@/lib/types'
import { cn } from '@/lib/utils'
import type { FolderScope } from './board-folders'

export function FolderNavigation({
  boards,
  folders,
  scope,
  boardsLoading,
  loading,
  error,
  onSelect,
  onCreate,
  onRename,
  onDelete,
  onRetry,
}: {
  boards: Board[]
  folders: Folder[]
  scope: FolderScope
  boardsLoading: boolean
  loading: boolean
  error: string
  onSelect: (scope: FolderScope) => void
  onCreate: () => void
  onRename: (folder: Folder) => void
  onDelete: (folder: Folder) => void
  onRetry: () => void
}) {
  const counts = new Map<string | null, number>()
  for (const board of boards) {
    const id = board.folderId || null
    counts.set(id, (counts.get(id) ?? 0) + 1)
  }
  const entries = [
    {
      scope: 'all' as const,
      name: 'All boards',
      count: boards.length,
      folder: null,
    },
    {
      scope: 'unfiled' as const,
      name: 'Unfiled',
      count: counts.get(null) ?? 0,
      folder: null,
    },
    ...folders
      .toSorted((a, b) => a.name.localeCompare(b.name))
      .map((folder) => ({
        scope: `folder:${folder.id}` as const,
        name: folder.name,
        count: counts.get(folder.id) ?? 0,
        folder,
      })),
  ]
  return (
    <div className="mb-6 rounded-xl border border-white/10 bg-white/[0.02] p-2">
      <nav
        aria-label="Board folders"
        className="flex flex-wrap items-center gap-1"
      >
        {entries.map((entry) => {
          const selected = scope === entry.scope
          const Icon =
            entry.scope === 'all'
              ? Layers3
              : entry.scope === 'unfiled'
                ? FolderOpen
                : FolderIcon
          return (
            <div
              key={entry.scope}
              className={cn(
                'flex max-w-full min-w-0 items-center rounded-lg',
                selected && 'bg-white/[0.06] ring-1 ring-white/10'
              )}
            >
              <button
                type="button"
                aria-pressed={selected}
                onClick={() => onSelect(entry.scope)}
                title={entry.name}
                className={cn(
                  'flex min-w-0 items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors outline-none hover:bg-white/[0.04] focus-visible:ring-2 focus-visible:ring-violet-500',
                  selected ? 'text-white' : 'text-neutral-400 hover:text-white'
                )}
              >
                <Icon
                  className={cn(
                    'size-3.5 shrink-0',
                    selected && 'text-violet-300'
                  )}
                  aria-hidden="true"
                />
                <span className="max-w-44 truncate">{entry.name}</span>
                <span className="text-xs text-neutral-500 tabular-nums">
                  {boardsLoading ? '–' : entry.count}
                </span>
              </button>
              {entry.folder ? (
                <DropdownMenu.Root>
                  <DropdownMenu.Trigger
                    aria-label={`Manage folder ${entry.name}`}
                    className="mr-1 rounded-md p-1.5 text-neutral-500 outline-none hover:bg-white/[0.06] hover:text-white focus-visible:ring-2 focus-visible:ring-violet-500"
                  >
                    <MoreHorizontal className="size-3.5" aria-hidden="true" />
                  </DropdownMenu.Trigger>
                  <DropdownMenu.Portal>
                    <DropdownMenu.Content
                      className="dark z-50 min-w-40 rounded-lg border border-white/10 bg-neutral-950 p-1 text-sm text-neutral-200 shadow-xl"
                      sideOffset={6}
                      onKeyDown={(event) => event.stopPropagation()}
                    >
                      <DropdownMenu.Item
                        onSelect={() => onRename(entry.folder!)}
                        className="flex cursor-default items-center gap-2 rounded-md px-3 py-2 outline-none focus:bg-white/[0.06]"
                      >
                        <Pencil className="size-3.5" aria-hidden="true" />{' '}
                        Rename folder
                      </DropdownMenu.Item>
                      <DropdownMenu.Item
                        disabled={boardsLoading}
                        onSelect={() => onDelete(entry.folder!)}
                        className="flex cursor-default items-center gap-2 rounded-md px-3 py-2 text-red-300 outline-none focus:bg-red-500/10 data-[disabled]:opacity-40"
                      >
                        <Trash2 className="size-3.5" aria-hidden="true" />{' '}
                        Delete folder
                      </DropdownMenu.Item>
                    </DropdownMenu.Content>
                  </DropdownMenu.Portal>
                </DropdownMenu.Root>
              ) : null}
            </div>
          )
        })}
        {loading ? (
          <span
            role="status"
            className="flex items-center gap-2 px-3 text-xs text-neutral-500"
          >
            <Loader2
              className="size-3.5 animate-spin motion-reduce:animate-none"
              aria-hidden="true"
            />{' '}
            Loading folders…
          </span>
        ) : null}
        <button
          type="button"
          onClick={onCreate}
          disabled={loading || !!error}
          className="ml-auto flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-xs text-neutral-400 outline-none hover:bg-white/[0.04] hover:text-white focus-visible:ring-2 focus-visible:ring-violet-500 disabled:opacity-40"
        >
          <Plus className="size-3.5" aria-hidden="true" /> New folder
        </button>
      </nav>
      {error ? (
        <div
          role="alert"
          className="flex items-center justify-between gap-3 px-3 py-2 text-xs text-red-300"
        >
          <span>{error}</span>
          <button
            type="button"
            onClick={onRetry}
            className="shrink-0 rounded-sm underline underline-offset-4 outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
          >
            Retry folders
          </button>
        </div>
      ) : null}
    </div>
  )
}
