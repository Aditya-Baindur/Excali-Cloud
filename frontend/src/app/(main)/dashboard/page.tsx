'use client'

import { useEffect, useRef, useState } from 'react'
import { useAuth } from '@clerk/nextjs'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  FilePenLine,
  Folder as FolderIcon,
  FolderInput,
  LayoutGrid,
  Link2,
  List,
  Loader2,
  LockKeyhole,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react'

import { apiFetch } from '@/lib/api'
import type { Board, Folder, Share } from '@/lib/types'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ShareButton } from '@/components/sharing/ShareButton'
import { WorkspaceShell } from '@/components/workspace/WorkspaceShell'
import { FolderNavigation } from '@/components/workspace/FolderNavigation'
import {
  boardFolderName,
  boardsInFolder,
  filterFolderBoards,
  scopeFolderId,
  type BoardFilter,
  type BoardSort,
  type FolderScope,
} from '@/components/workspace/board-folders'
import {
  formatWorkspaceDate,
  WorkspaceError,
  WorkspaceLoading,
  workspaceErrorMessage,
} from '@/components/workspace/WorkspaceStates'

type BoardDialog =
  | { kind: 'create' }
  | { kind: 'rename' | 'delete' | 'move'; board: Board }
  | { kind: 'folder-create' }
  | { kind: 'folder-rename' | 'folder-delete'; folder: Folder }

export default function DashboardPage() {
  const { userId, isLoaded } = useAuth()
  if (!isLoaded || !userId)
    return (
      <WorkspaceShell section="Boards">
        <WorkspaceLoading label="Loading boards…" />
      </WorkspaceShell>
    )
  return <AccountDashboard key={userId} />
}

function AccountDashboard() {
  const router = useRouter()
  const [boards, setBoards] = useState<Board[]>([])
  const [folders, setFolders] = useState<Folder[]>([])
  const [scope, setScope] = useState<FolderScope>('all')
  const [foldersLoading, setFoldersLoading] = useState(true)
  const [foldersError, setFoldersError] = useState('')
  const [folderLoadVersion, setFolderLoadVersion] = useState(0)
  const [loading, setLoading] = useState(true)
  const [loadVersion, setLoadVersion] = useState(0)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<BoardFilter>('all')
  const [sort, setSort] = useState<BoardSort>('updated')
  const [view, setView] = useState<'grid' | 'list'>('grid')
  const [dialog, setDialog] = useState<BoardDialog | null>(null)
  const [name, setName] = useState('')
  const [destination, setDestination] = useState('')
  const [saving, setSaving] = useState(false)
  const [mutationError, setMutationError] = useState('')
  const [moveNotice, setMoveNotice] = useState<{
    boardId: string
    boardName: string
    folderName: string
  } | null>(null)
  const dialogTrigger = useRef<HTMLElement | null>(null)
  const pageHeading = useRef<HTMLHeadingElement>(null)
  const mutations = useRef<AbortController | null>(null)
  const savingRef = useRef(false)

  useEffect(() => {
    const controller = new AbortController()
    mutations.current = controller
    return () => controller.abort()
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    apiFetch<{ boards: Board[] }>('/boards', { signal: controller.signal })
      .then(({ boards: result }) => {
        if (!controller.signal.aborted) setBoards(result)
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted)
          setError(workspaceErrorMessage(cause, 'Could not load your boards.'))
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [loadVersion])

  useEffect(() => {
    const controller = new AbortController()
    apiFetch<{ folders: Folder[] }>('/folders', { signal: controller.signal })
      .then(({ folders: result }) => {
        if (!controller.signal.aborted) setFolders(result)
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted)
          setFoldersError(
            workspaceErrorMessage(cause, 'Could not load folders.')
          )
      })
      .finally(() => {
        if (!controller.signal.aborted) setFoldersLoading(false)
      })
    return () => controller.abort()
  }, [folderLoadVersion])

  const foldersById = new Map(folders.map((folder) => [folder.id, folder]))
  const scopedBoards = boardsInFolder(boards, scope)
  const sharedCount = scopedBoards.filter(
    (board) => board.share && board.share.revokedAt === null
  ).length
  const visibleBoards = filterFolderBoards(boards, folders, {
    scope,
    filter,
    query,
    sort,
  })
  const isFolderAction = dialog?.kind.startsWith('folder-') ?? false
  const isDelete = dialog?.kind === 'delete' || dialog?.kind === 'folder-delete'
  const needsName = dialog && !isDelete && dialog.kind !== 'move'
  const folderOptions = folders.toSorted((a, b) => a.name.localeCompare(b.name))
  const heading =
    scope === 'all'
      ? 'Boards'
      : scope === 'unfiled'
        ? 'Unfiled'
        : (foldersById.get(scopeFolderId(scope) ?? '')?.name ?? 'Folder')

  function openDialog(next: BoardDialog) {
    setMoveNotice(null)
    dialogTrigger.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null
    setName(
      next.kind === 'rename'
        ? next.board.name
        : next.kind === 'folder-rename'
          ? next.folder.name
          : ''
    )
    setDestination(
      next.kind === 'move'
        ? (next.board.folderId ?? '')
        : (scopeFolderId(scope) ?? '')
    )
    setMutationError('')
    setDialog(next)
  }

  function updateShare(boardId: string, share: Share) {
    setBoards((current) =>
      current.map((board) =>
        board.id === boardId ? { ...board, share } : board
      )
    )
  }

  async function submitBoardAction(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!dialog || savingRef.current || (needsName && !name.trim())) return
    const controller = mutations.current
    if (!controller || controller.signal.aborted) return
    savingRef.current = true
    setSaving(true)
    setMutationError('')
    try {
      if (dialog.kind === 'create') {
        const { boardId } = await apiFetch<{ boardId: string }>('/boards', {
          method: 'POST',
          body: JSON.stringify({
            name: name.trim(),
            folderId: destination || null,
          }),
          signal: controller.signal,
        })
        if (controller.signal.aborted) return
        router.push(`/board/${encodeURIComponent(boardId)}`)
      } else if (dialog.kind === 'rename') {
        await apiFetch(`/boards/${encodeURIComponent(dialog.board.id)}`, {
          method: 'PUT',
          body: JSON.stringify({ name: name.trim() }),
          signal: controller.signal,
        })
        if (controller.signal.aborted) return
        setBoards((current) =>
          current.map((board) =>
            board.id === dialog.board.id
              ? { ...board, name: name.trim(), updatedAt: Date.now() }
              : board
          )
        )
      } else if (dialog.kind === 'delete') {
        await apiFetch(`/boards/${encodeURIComponent(dialog.board.id)}`, {
          method: 'DELETE',
          signal: controller.signal,
        })
        if (controller.signal.aborted) return
        setBoards((current) =>
          current.filter((board) => board.id !== dialog.board.id)
        )
      } else if (dialog.kind === 'move') {
        await apiFetch(`/boards/${encodeURIComponent(dialog.board.id)}`, {
          method: 'PUT',
          body: JSON.stringify({ folderId: destination || null }),
          signal: controller.signal,
        })
        if (controller.signal.aborted) return
        setBoards((current) =>
          current.map((board) =>
            board.id === dialog.board.id
              ? {
                  ...board,
                  folderId: destination || null,
                  folderName: foldersById.get(destination)?.name ?? null,
                  updatedAt: Date.now(),
                }
              : board
          )
        )
        setScope(destination ? `folder:${destination}` : 'unfiled')
        setQuery('')
        setFilter('all')
        setMoveNotice({
          boardId: dialog.board.id,
          boardName: dialog.board.name,
          folderName: foldersById.get(destination)?.name ?? 'Unfiled',
        })
      } else if (
        dialog.kind === 'folder-create' ||
        dialog.kind === 'folder-rename'
      ) {
        const { folder } = await apiFetch<{ folder: Folder }>(
          dialog.kind === 'folder-create'
            ? '/folders'
            : `/folders/${encodeURIComponent(dialog.folder.id)}`,
          {
            method: dialog.kind === 'folder-create' ? 'POST' : 'PUT',
            body: JSON.stringify({ name: name.trim() }),
            signal: controller.signal,
          }
        )
        if (controller.signal.aborted) return
        setFolders((current) => [
          ...current.filter((item) => item.id !== folder.id),
          folder,
        ])
        setBoards((current) =>
          current.map((board) =>
            board.folderId === folder.id
              ? { ...board, folderName: folder.name }
              : board
          )
        )
        if (dialog.kind === 'folder-create') {
          setScope(`folder:${folder.id}`)
          setQuery('')
          setFilter('all')
        }
      } else if (dialog.kind === 'folder-delete') {
        await apiFetch(`/folders/${encodeURIComponent(dialog.folder.id)}`, {
          method: 'DELETE',
          signal: controller.signal,
        })
        if (controller.signal.aborted) return
        setFolders((current) =>
          current.filter((folder) => folder.id !== dialog.folder.id)
        )
        setBoards((current) =>
          current.map((board) =>
            board.folderId === dialog.folder.id
              ? { ...board, folderId: null, folderName: null }
              : board
          )
        )
        if (scopeFolderId(scope) === dialog.folder.id) {
          setScope('unfiled')
          setQuery('')
          setFilter('all')
        }
      }
      setDialog(null)
    } catch (cause) {
      if (!controller.signal.aborted)
        setMutationError(
          workspaceErrorMessage(
            cause,
            'Could not save your changes. Please try again.'
          )
        )
    } finally {
      savingRef.current = false
      if (!controller.signal.aborted) setSaving(false)
    }
  }

  return (
    <WorkspaceShell section="Boards">
      <div className="mb-8 flex items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <LayoutGrid
            className="size-6 shrink-0 text-neutral-300"
            aria-hidden="true"
          />
          <h1
            ref={pageHeading}
            tabIndex={-1}
            title={heading}
            className="min-w-0 truncate text-2xl font-semibold tracking-tight outline-none"
          >
            {heading}
          </h1>
        </div>
        <Button
          onClick={() => openDialog({ kind: 'create' })}
          className="shrink-0 border border-white/10 bg-white/[0.06] text-white shadow-none hover:bg-white/10"
        >
          <Plus aria-hidden="true" /> New board
        </Button>
      </div>

      <FolderNavigation
        boards={boards}
        folders={folders}
        scope={scope}
        boardsLoading={loading}
        loading={foldersLoading}
        error={foldersError}
        onSelect={setScope}
        onCreate={() => openDialog({ kind: 'folder-create' })}
        onRename={(folder) => openDialog({ kind: 'folder-rename', folder })}
        onDelete={(folder) => openDialog({ kind: 'folder-delete', folder })}
        onRetry={() => {
          setFoldersError('')
          setFoldersLoading(true)
          setFolderLoadVersion((value) => value + 1)
        }}
      />

      <div role="status" aria-live="polite" aria-atomic="true">
        {moveNotice ? (
          <div className="mb-5 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm">
            <p className="min-w-0 flex-1 break-words text-neutral-300">
              “{moveNotice.boardName}” moved to {moveNotice.folderName}.
            </p>
            <Link
              href={`/board/${encodeURIComponent(moveNotice.boardId)}`}
              className="shrink-0 rounded-sm text-violet-300 underline underline-offset-4 outline-none hover:text-violet-200 focus-visible:ring-2 focus-visible:ring-violet-500"
            >
              Open board
            </Link>
            <button
              type="button"
              aria-label="Dismiss move confirmation"
              onClick={() => setMoveNotice(null)}
              className="rounded-md p-1 text-neutral-500 outline-none hover:bg-white/[0.06] hover:text-white focus-visible:ring-2 focus-visible:ring-violet-500"
            >
              <X className="size-3.5" aria-hidden="true" />
            </button>
          </div>
        ) : null}
      </div>

      <div className="mb-6 flex flex-col gap-4 border-b border-white/10 pb-4 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex items-center gap-1" aria-label="Filter boards">
          {(
            [
              ['all', 'All', scopedBoards.length],
              ['shared', 'Shared', sharedCount],
              ['private', 'Private', scopedBoards.length - sharedCount],
            ] as const
          ).map(([value, label, count]) => (
            <button
              key={value}
              onClick={() => setFilter(value)}
              aria-pressed={filter === value}
              className={cn(
                'flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors outline-none focus-visible:ring-2 focus-visible:ring-violet-500',
                filter === value
                  ? 'bg-neutral-950 font-medium text-white shadow-sm ring-1 ring-white/10'
                  : 'text-neutral-400 hover:bg-white/[0.04] hover:text-neutral-100'
              )}
            >
              {label}
              <span
                className={cn(
                  'rounded-md px-1.5 py-0.5 text-[10px] leading-none',
                  filter === value
                    ? 'bg-violet-500/10 text-violet-300'
                    : 'bg-white/[0.06] text-neutral-400'
                )}
              >
                {loading ? '–' : count}
              </span>
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-44 flex-1 sm:flex-none">
            <Search
              className="absolute top-2.5 left-3 size-4 text-neutral-400"
              aria-hidden="true"
            />
            <input
              type="search"
              aria-label="Search boards or folders"
              placeholder="Search…"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="h-9 w-full rounded-lg border border-white/10 bg-neutral-950 pr-3 pl-9 text-sm outline-none placeholder:text-neutral-400 focus:border-violet-400 focus:ring-2 focus:ring-violet-500/20 sm:w-48"
            />
          </div>
          <select
            aria-label="Sort boards"
            value={sort}
            onChange={(event) => setSort(event.target.value as BoardSort)}
            className="h-9 rounded-lg border border-white/10 bg-neutral-900 px-2.5 text-xs text-neutral-400 outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-500/20"
          >
            <option value="updated">Last updated</option>
            <option value="created">Recently created</option>
            <option value="name">Name: A–Z</option>
          </select>
          <div
            className="flex rounded-lg border border-white/10 bg-neutral-950 p-0.5"
            aria-label="Board layout"
          >
            <button
              aria-label="Grid view"
              aria-pressed={view === 'grid'}
              onClick={() => setView('grid')}
              className={cn(
                'rounded-md p-1.5 outline-none focus-visible:ring-2 focus-visible:ring-violet-500',
                view === 'grid'
                  ? 'bg-violet-500/10 text-violet-300'
                  : 'text-neutral-400 hover:text-neutral-200'
              )}
            >
              <LayoutGrid className="size-4" />
            </button>
            <button
              aria-label="List view"
              aria-pressed={view === 'list'}
              onClick={() => setView('list')}
              className={cn(
                'rounded-md p-1.5 outline-none focus-visible:ring-2 focus-visible:ring-violet-500',
                view === 'list'
                  ? 'bg-violet-500/10 text-violet-300'
                  : 'text-neutral-400 hover:text-neutral-200'
              )}
            >
              <List className="size-4" />
            </button>
          </div>
        </div>
      </div>

      {loading ? (
        <WorkspaceLoading label="Loading boards…" />
      ) : error ? (
        <WorkspaceError
          message={error}
          onRetry={() => {
            setError('')
            setLoading(true)
            setLoadVersion((value) => value + 1)
          }}
        />
      ) : visibleBoards.length === 0 ? (
        <div className="flex min-h-44 flex-col items-center justify-center rounded-2xl border border-dashed border-white/10 bg-white/[0.02] px-5 py-12 text-center">
          <span className="mb-5 flex size-14 items-center justify-center rounded-2xl bg-violet-500/10 text-violet-500">
            <FilePenLine
              className="size-7"
              strokeWidth={1.5}
              aria-hidden="true"
            />
          </span>
          <h2 className="text-lg font-semibold tracking-tight">
            {scopedBoards.length === 0 && !query.trim() && filter === 'all'
              ? scope === 'all'
                ? 'No boards yet'
                : scope === 'unfiled'
                  ? 'No unfiled boards'
                  : 'No boards in this folder'
              : 'No boards found'}
          </h2>
          <Button
            className="mt-6 bg-violet-600 text-white hover:bg-violet-700"
            onClick={() => {
              if (
                scopedBoards.length === 0 &&
                !query.trim() &&
                filter === 'all'
              )
                openDialog({ kind: 'create' })
              else {
                setQuery('')
                setFilter('all')
              }
            }}
          >
            {scopedBoards.length === 0 && !query.trim() && filter === 'all' ? (
              <>
                <Plus aria-hidden="true" /> Create board
              </>
            ) : (
              <>
                <X aria-hidden="true" /> Clear filters
              </>
            )}
          </Button>
        </div>
      ) : (
        <>
          <div
            className={cn(
              view === 'grid'
                ? 'grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3'
                : 'flex flex-col gap-3'
            )}
          >
            {view === 'grid' && filter === 'all' && !query.trim() ? (
              <button
                onClick={() => openDialog({ kind: 'create' })}
                className="group flex h-44 flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-white/15 bg-white/[0.02] text-sm text-neutral-300 transition-colors outline-none hover:bg-white/[0.04] hover:text-white focus-visible:ring-2 focus-visible:ring-violet-500"
              >
                <span className="flex size-12 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.03]">
                  <Plus className="size-6" aria-hidden="true" />
                </span>
                Create board
              </button>
            ) : null}
            {visibleBoards.map((board) => {
              const isShared = Boolean(
                board.share && board.share.revokedAt === null
              )
              return (
                <article
                  key={board.id}
                  className={cn(
                    'group relative overflow-hidden rounded-xl border border-white/10 bg-white/[0.02] transition-colors hover:bg-white/[0.04]',
                    view === 'list'
                      ? 'flex flex-wrap items-center gap-x-4 gap-y-3 p-4'
                      : 'flex h-44 flex-col justify-between p-5'
                  )}
                >
                  <div className="absolute inset-x-0 top-0 h-[2px] bg-violet-500/80" />
                  <div
                    className={cn(
                      'flex min-w-0 items-start justify-between gap-3',
                      view === 'list' && 'flex-1'
                    )}
                  >
                    <div className="min-w-0">
                      <Link
                        href={`/board/${encodeURIComponent(board.id)}`}
                        className="block rounded-sm text-lg font-semibold tracking-tight text-white outline-none after:absolute after:inset-0 focus-visible:ring-2 focus-visible:ring-violet-500"
                      >
                        <span className="line-clamp-2 break-words">
                          {board.name}
                        </span>
                      </Link>
                      <div className="relative z-10 mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
                        <BoardVisibility shared={isShared} />
                        {board.folderId ? (
                          <button
                            type="button"
                            onClick={() =>
                              setScope(
                                board.folderId
                                  ? `folder:${board.folderId}`
                                  : 'unfiled'
                              )
                            }
                            title={boardFolderName(board, foldersById)}
                            className="flex max-w-36 min-w-0 items-center gap-1 rounded-sm text-[11px] text-neutral-500 outline-none hover:text-violet-300 focus-visible:ring-2 focus-visible:ring-violet-500"
                          >
                            <FolderIcon
                              className="size-3 shrink-0"
                              aria-hidden="true"
                            />
                            <span className="truncate">
                              {boardFolderName(board, foldersById)}
                            </span>
                          </button>
                        ) : null}
                      </div>
                    </div>
                    <div className="relative z-10 flex shrink-0 gap-0.5">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        disabled={foldersLoading || !!foldersError}
                        onClick={() => openDialog({ kind: 'move', board })}
                        aria-label={`Move ${board.name} to folder`}
                        title="Move to folder"
                        className="text-neutral-400 hover:bg-white/[0.06] hover:text-white"
                      >
                        <FolderInput className="size-3.5" aria-hidden="true" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => openDialog({ kind: 'rename', board })}
                        aria-label={`Rename ${board.name}`}
                        title="Rename board"
                        className="text-neutral-400 hover:bg-white/[0.06] hover:text-white"
                      >
                        <Pencil className="size-3.5" aria-hidden="true" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => openDialog({ kind: 'delete', board })}
                        aria-label={`Delete ${board.name}`}
                        title="Delete board"
                        className="text-neutral-400 hover:bg-red-500/10 hover:text-red-400"
                      >
                        <Trash2 className="size-3.5" aria-hidden="true" />
                      </Button>
                    </div>
                  </div>
                  <div
                    className={cn(
                      'flex items-center justify-between gap-3',
                      view === 'list' && 'ml-auto gap-4'
                    )}
                  >
                    <span className="text-xs text-neutral-400">
                      Updated {formatWorkspaceDate(board.updatedAt)}
                    </span>
                    <div className="relative z-10">
                      <ShareButton
                        boardId={board.id}
                        compact
                        onShared={(share) => updateShare(board.id, share)}
                      />
                    </div>
                  </div>
                </article>
              )
            })}
          </div>
        </>
      )}

      <Dialog
        open={dialog !== null}
        onOpenChange={(open) => {
          if (!open && !saving) setDialog(null)
        }}
      >
        <DialogContent
          className="dark rounded-xl border-white/10 bg-neutral-950 text-white"
          showCloseButton={!saving}
          onCloseAutoFocus={(event) => {
            event.preventDefault()
            if (dialogTrigger.current?.isConnected)
              dialogTrigger.current.focus()
            else pageHeading.current?.focus()
          }}
        >
          <DialogHeader>
            <DialogTitle>
              {dialog?.kind === 'delete'
                ? 'Delete this board?'
                : dialog?.kind === 'rename'
                  ? 'Rename board'
                  : dialog?.kind === 'move'
                    ? 'Move board'
                    : dialog?.kind === 'folder-delete'
                      ? 'Delete this folder?'
                      : dialog?.kind === 'folder-rename'
                        ? 'Rename folder'
                        : dialog?.kind === 'folder-create'
                          ? 'Create a folder'
                          : 'Create a board'}
            </DialogTitle>
            <DialogDescription
              className={
                isDelete || dialog?.kind === 'move'
                  ? 'pt-1 leading-relaxed break-words text-neutral-400'
                  : 'sr-only'
              }
            >
              {dialog?.kind === 'delete'
                ? `“${dialog.board.name}” and its videos will be permanently deleted. Its public links will stop working.`
                : dialog?.kind === 'folder-delete'
                  ? `“${dialog.folder.name}” will be deleted. Its boards will be kept in Unfiled.`
                  : dialog?.kind === 'move'
                    ? dialog.board.name
                    : isFolderAction
                      ? 'Enter a folder name.'
                      : 'Enter a board name.'}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={submitBoardAction} className="space-y-5">
            {needsName ? (
              <div>
                <label
                  htmlFor="board-name"
                  className="mb-2 block text-xs font-medium text-neutral-300"
                >
                  {isFolderAction ? 'Folder name' : 'Board name'}
                </label>
                <input
                  id="board-name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  autoFocus
                  required
                  maxLength={200}
                  disabled={saving}
                  className="h-11 w-full rounded-lg border border-white/10 bg-neutral-950 px-3 text-sm outline-none placeholder:text-neutral-400 focus:border-violet-400 focus:ring-2 focus:ring-violet-500/20 disabled:opacity-50"
                />
              </div>
            ) : null}
            {dialog?.kind === 'create' || dialog?.kind === 'move' ? (
              <div>
                <label
                  htmlFor="board-folder"
                  className="mb-2 block text-xs font-medium text-neutral-300"
                >
                  Folder
                </label>
                <select
                  id="board-folder"
                  value={destination}
                  onChange={(event) => setDestination(event.target.value)}
                  disabled={saving || foldersLoading || !!foldersError}
                  autoFocus={dialog.kind === 'move'}
                  className="h-11 w-full rounded-lg border border-white/10 bg-neutral-950 px-3 text-sm outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-500/20 disabled:opacity-50"
                >
                  <option value="">Unfiled</option>
                  {destination && !foldersById.has(destination) ? (
                    <option value={destination}>
                      {dialog.kind === 'move'
                        ? (dialog.board.folderName ?? 'Current folder')
                        : 'Selected folder'}
                    </option>
                  ) : null}
                  {folderOptions.map((folder) => (
                    <option key={folder.id} value={folder.id}>
                      {folder.name}
                    </option>
                  ))}
                </select>
                {foldersLoading ? (
                  <p role="status" className="mt-2 text-xs text-neutral-500">
                    Loading folders…
                  </p>
                ) : null}
                {foldersError ? (
                  <div className="mt-3">
                    <WorkspaceError
                      message={foldersError}
                      onRetry={() => {
                        setFoldersError('')
                        setFoldersLoading(true)
                        setFolderLoadVersion((value) => value + 1)
                      }}
                    />
                  </div>
                ) : null}
              </div>
            ) : null}
            {mutationError ? <WorkspaceError message={mutationError} /> : null}
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                disabled={saving}
                onClick={() => setDialog(null)}
                className="text-neutral-300 hover:bg-white/[0.06]"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={
                  saving ||
                  (!!needsName && !name.trim()) ||
                  (dialog?.kind === 'move' &&
                    (foldersLoading ||
                      !!foldersError ||
                      destination === (dialog.board.folderId ?? '')))
                }
                className={
                  isDelete
                    ? 'bg-red-600 text-white hover:bg-red-700'
                    : 'bg-violet-600 text-white hover:bg-violet-700'
                }
              >
                {saving ? (
                  <Loader2
                    className="animate-spin motion-reduce:animate-none"
                    aria-hidden="true"
                  />
                ) : null}
                {saving
                  ? isDelete
                    ? 'Deleting…'
                    : dialog?.kind === 'move'
                      ? 'Moving…'
                      : 'Saving…'
                  : dialog?.kind === 'delete'
                    ? 'Delete board'
                    : dialog?.kind === 'rename'
                      ? 'Save name'
                      : dialog?.kind === 'move'
                        ? 'Move board'
                        : dialog?.kind === 'folder-delete'
                          ? 'Delete folder'
                          : dialog?.kind === 'folder-rename'
                            ? 'Save name'
                            : dialog?.kind === 'folder-create'
                              ? 'Create folder'
                              : 'Create board'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </WorkspaceShell>
  )
}

function BoardVisibility({ shared }: { shared: boolean }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-[10px] font-medium',
        shared
          ? 'bg-violet-500/10 text-violet-300'
          : 'bg-white/[0.03] text-neutral-400'
      )}
    >
      {shared ? (
        <Link2 className="size-3" aria-hidden="true" />
      ) : (
        <LockKeyhole className="size-3" aria-hidden="true" />
      )}
      {shared ? 'Shared' : 'Private'}
    </span>
  )
}
