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

import LoadingPage from '@/components/LoadingPage'
import { useUser } from '@clerk/nextjs'

type Board = { id: string; name: string; updatedAt: number }

export default function DashboardPage() {
  const API_BASE = process.env.NEXT_PUBLIC_API_BASE!

  const { user, isLoaded } = useUser()
  const USER_ID = user?.id

  const [boards, setBoards] = React.useState<Board[]>([])
  const [loading, setLoading] = React.useState(true)

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

      const res = await fetch(`${API_BASE}/boards`, {
        headers: { 'x-user-id': USER_ID },
      })

      const data = await res.json()
      setBoards(data.boards ?? [])
    } catch (err) {
      console.error('Failed to load boards:', err)
    } finally {
      setLoading(false)
    }
  }, [USER_ID, API_BASE])

  React.useEffect(() => {
    if (!isLoaded || !USER_ID) return
    loadBoards()
  }, [isLoaded, USER_ID, loadBoards])

  const createBoard = async () => {
    if (!USER_ID) return

    const trimmed = name.trim()
    if (!trimmed) return

    try {
      setCreating(true)

      const res = await fetch(`${API_BASE}/boards`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': USER_ID,
        },
        body: JSON.stringify({ name: trimmed }),
      })

      const data = await res.json()

      if (!res.ok) return

      setName('')
      setOpen(false)

      window.location.href = `/board/${data.boardId}`
    } catch (err) {
      console.error('Create failed:', err)
    } finally {
      setCreating(false)
    }
  }

  const deleteBoard = async (boardId: string) => {
    if (!USER_ID) return

    try {
      await fetch(`${API_BASE}/boards/${boardId}`, {
        method: 'DELETE',
        headers: { 'x-user-id': USER_ID },
      })

      loadBoards()
    } catch (err) {
      console.error('Delete failed:', err)
    }
  }

  const renameBoard = async () => {
    if (!USER_ID || !renameBoardId) return

    const trimmed = renameName.trim()
    if (!trimmed) return

    try {
      await fetch(`${API_BASE}/boards/${renameBoardId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': USER_ID,
        },
        body: JSON.stringify({ name: trimmed }),
      })

      setRenameOpen(false)
      setRenameName('')
      setRenameBoardId(null)

      loadBoards()
    } catch (err) {
      console.error('Rename failed:', err)
    }
  }

  if (!isLoaded || loading) {
    return <LoadingPage />
  }

  return (
    <main className="min-h-screen bg-neutral-950 text-white">
      <div className="mx-auto max-w-6xl px-6 py-10">
        {/* HEADER */}
        <div className="mb-8 flex items-center gap-3">
          <LayoutGrid className="h-6 w-6 text-neutral-300" />
          <h1 className="text-2xl font-semibold tracking-tight">Boards</h1>
        </div>

        {/* RENAME DIALOG */}
        <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
          <DialogContent className="border-white/10 bg-neutral-950 text-white">
            <DialogHeader>
              <DialogTitle>Rename board</DialogTitle>
            </DialogHeader>

            <div className="space-y-3">
              <Input
                value={renameName}
                onChange={(e) => setRenameName(e.target.value)}
                placeholder="New board name"
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
              <button className="group">
                <Card className="relative flex h-44 items-center justify-center border border-dashed border-white/15 bg-white/[0.02] transition hover:bg-white/[0.04]">
                  <div className="flex flex-col items-center gap-3 text-neutral-300">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.03]">
                      <Plus className="h-6 w-6" />
                    </div>

                    <div className="text-sm font-medium">Create board</div>
                  </div>
                </Card>
              </button>
            </DialogTrigger>

            <DialogContent className="border-white/10 bg-neutral-950 text-white">
              <DialogHeader>
                <DialogTitle>Create a board</DialogTitle>
              </DialogHeader>

              <div className="space-y-3">
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Board name (e.g. Product brainstorm)"
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
                    {creating ? 'Creating...' : 'Create'}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>

          {/* EMPTY STATE */}
          {boards.length === 0 ? (
            <div className="col-span-full text-sm text-neutral-400">
              No boards yet. Create your first one.
            </div>
          ) : (
            boards.map((b) => (
              <Link key={b.id} href={`/board/${b.id}`} className="block">
                <Card className="group relative h-44 cursor-pointer overflow-hidden border-white/10 bg-white/[0.02] transition hover:bg-white/[0.04]">
                  <div className="absolute inset-x-0 top-0 h-[2px] bg-violet-500/80" />

                  <div className="flex h-full flex-col justify-between p-5">
                    {/* TOP */}
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="mt-2 text-lg font-semibold tracking-tight text-white">
                          {b.name}
                        </div>
                      </div>

                      <div className="flex gap-1">
                        {/* RENAME */}
                        <Button
                          variant="ghost"
                          size="icon"
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

                        {/* DELETE */}
                        <Button
                          variant="ghost"
                          size="icon"
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

                    {/* BOTTOM */}
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
