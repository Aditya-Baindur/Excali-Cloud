'use client'

import * as React from 'react'
import Link from 'next/link'
import { Plus, ArrowRight, LayoutGrid, Trash2, Pencil } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'

import LoadingPageNS from '@/components/LoadingPageNoSignIn'

type Board = { id: string; name: string; updatedAt: number }

export default function DashboardPage() {
  const API_BASE = process.env.NEXT_PUBLIC_API_BASE!

  const USER_ID = 'PUBLIC-USER'

  const MAX_BOARDS = 3

  const [boards, setBoards] = React.useState<Board[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState('')

  const [open, setOpen] = React.useState(false)
  const [name, setName] = React.useState('')
  const [creating, setCreating] = React.useState(false)

  const [renameOpen, setRenameOpen] = React.useState(false)
  const [renameName, setRenameName] = React.useState('')
  const [renameBoardId, setRenameBoardId] = React.useState<string | null>(null)

  const loadBoards = React.useCallback(async () => {
    if (!USER_ID) return

    try {
      setLoading(true)
      setError('')

      const res = await fetch(`${API_BASE}/boards`, {
        headers: { 'x-user-id': USER_ID },
      })
      if (!res.ok) throw new Error('Could not load demo boards.')

      const data = await res.json() as { boards?: Board[] }
      setBoards(data.boards ?? [])
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Could not load demo boards.'
      )
    } finally {
      setLoading(false)
    }
  }, [USER_ID, API_BASE])

  React.useEffect(() => {
    if (!USER_ID) return
    loadBoards()
  }, [USER_ID, loadBoards])

  const createBoard = async () => {
    if (!USER_ID) return

    if (boards.length >= MAX_BOARDS) {
      alert('Demo limit: 3 boards.')
      return
    }

    const trimmed = name.trim()
    if (!trimmed) return

    try {
      setCreating(true)
      setError('')

      const res = await fetch(`${API_BASE}/boards`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': USER_ID,
        },
        body: JSON.stringify({ name: trimmed }),
      })

      const data = await res.json() as { boardId: string }

      if (!res.ok) throw new Error('Could not create board.')

      setName('')
      setOpen(false)

      window.location.href = `/public/board/${data.boardId}`
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create board.')
    } finally {
      setCreating(false)
    }
  }

  const deleteBoard = async (boardId: string) => {
    if (!USER_ID) return
    if (
      !window.confirm(
        `Delete “${boards.find((board) => board.id === boardId)?.name ?? 'board'}”?`
      )
    )
      return

    try {
      setError('')
      const res = await fetch(`${API_BASE}/boards/${boardId}`, {
        method: 'DELETE',
        headers: { 'x-user-id': USER_ID },
      })
      if (!res.ok) throw new Error('Could not delete board.')

      loadBoards()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete board.')
    }
  }

  const renameBoard = async () => {
    if (!USER_ID || !renameBoardId) return

    const trimmed = renameName.trim()
    if (!trimmed) return

    try {
      setError('')
      const res = await fetch(`${API_BASE}/boards/${renameBoardId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': USER_ID,
        },
        body: JSON.stringify({ name: trimmed }),
      })
      if (!res.ok) throw new Error('Could not rename board.')

      setRenameOpen(false)
      setRenameName('')
      setRenameBoardId(null)

      loadBoards()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not rename board.')
    }
  }

  if (loading) {
    return <LoadingPageNS />
  }

  const maxReached = boards.length >= MAX_BOARDS

  return (
    <main className="dark min-h-screen bg-neutral-950 text-white">
      <div className="mx-auto max-w-6xl px-6 py-10">
        {/* HEADER */}
        <div className="mb-8 flex items-center gap-3">
          <LayoutGrid className="h-6 w-6 text-neutral-300" />
          <h1 className="text-2xl font-semibold tracking-tight">Demo boards</h1>
        </div>
        {error && !open && !renameOpen ? (
          <div
            role="alert"
            className="mb-6 flex items-center justify-between gap-4 rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-300"
          >
            <span>{error}</span>
            <button className="underline" onClick={() => void loadBoards()}>
              Retry
            </button>
          </div>
        ) : null}

        {/* RENAME DIALOG */}
        <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
          <DialogContent
            className="dark border-white/10 bg-neutral-950 text-white"
            aria-describedby={undefined}
          >
            <DialogHeader>
              <DialogTitle>Rename board</DialogTitle>
            </DialogHeader>

            <div className="space-y-3">
              {error ? (
                <p role="alert" className="text-sm text-red-400">
                  {error}
                </p>
              ) : null}
              <Input
                value={renameName}
                onChange={(e) => setRenameName(e.target.value)}
                placeholder="New board name"
                aria-label="Board name"
                className="border-white/10 bg-white/[0.03]"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') renameBoard()
                }}
              />

              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={() => setRenameOpen(false)}>
                  Cancel
                </Button>

                <Button onClick={renameBoard}>Rename</Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* GRID */}
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {/* CREATE BOARD TILE */}
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <button className="group" disabled={maxReached}>
                <Card
                  className={`relative flex h-44 items-center justify-center border border-dashed border-white/15 transition ${
                    maxReached
                      ? 'cursor-not-allowed bg-white/[0.01] opacity-40'
                      : 'bg-white/[0.02] hover:bg-white/[0.04]'
                  }`}
                >
                  <div className="flex flex-col items-center gap-3 text-neutral-300">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.03]">
                      <Plus className="h-6 w-6" />
                    </div>

                    <div className="text-sm font-medium">
                      {maxReached ? '3-board demo limit' : 'New board'}
                    </div>
                  </div>
                </Card>
              </button>
            </DialogTrigger>

            {!maxReached && (
              <DialogContent
                className="dark border-white/10 bg-neutral-950 text-white"
                aria-describedby={undefined}
              >
                <DialogHeader>
                  <DialogTitle>New board</DialogTitle>
                </DialogHeader>

                <div className="space-y-3">
                  {error ? (
                    <p role="alert" className="text-sm text-red-400">
                      {error}
                    </p>
                  ) : null}
                  <Input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Board name"
                    aria-label="Board name"
                    className="border-white/10 bg-white/[0.03]"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') createBoard()
                    }}
                  />

                  <div className="flex justify-end gap-2">
                    <Button variant="ghost" onClick={() => setOpen(false)}>
                      Cancel
                    </Button>

                    <Button onClick={createBoard} disabled={creating}>
                      {creating ? 'Creating…' : 'Create'}
                    </Button>
                  </div>
                </div>
              </DialogContent>
            )}
          </Dialog>

          {/* EMPTY STATE */}
          {boards.length === 0 && !error ? (
            <div className="col-span-full text-sm text-neutral-400">
              No boards yet.
            </div>
          ) : (
            boards.map((b) => (
              <Link key={b.id} href={`/public/board/${b.id}`} className="block">
                <Card className="group relative h-44 cursor-pointer overflow-hidden border-white/10 bg-white/[0.02] transition hover:bg-white/[0.04]">
                  <div className="absolute inset-x-0 top-0 h-[2px] bg-violet-500/80" />

                  <div className="flex h-full flex-col justify-between p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="mt-2 text-lg font-semibold tracking-tight text-white">
                          {b.name}
                        </div>
                      </div>

                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Rename ${b.name}`}
                          className="text-neutral-300 hover:text-white"
                          onClick={(e) => {
                            e.preventDefault()
                            e.stopPropagation()

                            setRenameBoardId(b.id)
                            setRenameName(b.name)
                            setRenameOpen(true)
                          }}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>

                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Delete ${b.name}`}
                          className="text-neutral-300 hover:text-white"
                          onClick={(e) => {
                            e.preventDefault()
                            e.stopPropagation()
                            deleteBoard(b.id)
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-sm text-neutral-400">
                      <span>
                        Updated{' '}
                        {new Date(b.updatedAt).toLocaleDateString(undefined, {
                          month: 'short',
                          day: 'numeric',
                        })}
                      </span>

                      <div className="flex items-center gap-2 text-white opacity-0 transition group-hover:opacity-100">
                        Open
                        <ArrowRight className="h-4 w-4" />
                      </div>
                    </div>
                  </div>
                </Card>
              </Link>
            ))
          )}
        </div>
      </div>
    </main>
  )
}
