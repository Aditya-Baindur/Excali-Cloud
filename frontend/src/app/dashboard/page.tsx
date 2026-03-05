"use client";

import * as React from "react";
import Link from "next/link";
import { Plus, ArrowRight, LayoutGrid, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

type Board = { id: string; name: string; updatedAt: number };

const API_BASE = process.env.NEXT_PUBLIC_API_BASE!;
const DEMO_USER_ID = process.env.NEXT_PUBLIC_DEMO_USER_ID || "demo-user";

export default function DashboardPage() {
  const [boards, setBoards] = React.useState<Board[]>([]);
  const [loading, setLoading] = React.useState(true);

  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [creating, setCreating] = React.useState(false);

  const loadBoards = React.useCallback(async () => {
    setLoading(true);
    const res = await fetch(`${API_BASE}/boards`, {
      headers: { "x-user-id": DEMO_USER_ID }
    });
    const data = await res.json();
    setBoards(data.boards ?? []);
    setLoading(false);
  }, []);

  React.useEffect(() => {
    loadBoards();
  }, [loadBoards]);

  const createBoard = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;

    setCreating(true);
    const res = await fetch(`${API_BASE}/boards`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-user-id": DEMO_USER_ID
      },
      body: JSON.stringify({ name: trimmed })
    });
    const data = await res.json();
    setCreating(false);

    if (!res.ok) return;

    setName("");
    setOpen(false);
    window.location.href = `/board/${data.boardId}`;
  };

  const deleteBoard = async (boardId: string) => {
    await fetch(`${API_BASE}/boards/${boardId}`, {
      method: "DELETE",
      headers: { "x-user-id": DEMO_USER_ID }
    });
    loadBoards();
  };

  return (
    <main className="min-h-screen bg-neutral-950 text-white">
      <div className="mx-auto max-w-6xl px-6 py-10">
        <div className="mb-8 flex items-center gap-3">
          <LayoutGrid className="h-6 w-6 text-neutral-300" />
          <h1 className="text-2xl font-semibold tracking-tight">Boards</h1>
        </div>

        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {/* Create tile */}
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
                    if (e.key === "Enter") createBoard();
                  }}
                />

                <div className="flex justify-end gap-2">
                  <Button variant="ghost" onClick={() => setOpen(false)}>
                    Cancel
                  </Button>
                  <Button onClick={createBoard} disabled={creating}>
                    {creating ? "Creating..." : "Create"}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>

          {/* Board tiles */}
          {loading ? (
            <div className="col-span-full text-sm text-neutral-400">Loading…</div>
          ) : boards.length === 0 ? (
            <div className="col-span-full text-sm text-neutral-400">
              No boards yet. Create your first one.
            </div>
          ) : (
            boards.map((b) => (
              <Card
                key={b.id}
                className="group relative h-44 overflow-hidden border-white/10 bg-white/[0.02] transition hover:bg-white/[0.04]"
              >
                <div className="absolute inset-x-0 top-0 h-[2px] bg-violet-500/80" />

                <div className="flex h-full flex-col justify-between p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm text-neutral-400">Free Plan</div>
                      <div className="mt-2 text-lg font-semibold tracking-tight">
                        {b.name}
                      </div>
                    </div>

                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-neutral-300 hover:text-white"
                      onClick={() => deleteBoard(b.id)}
                      aria-label="Delete board"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>

                  <div className="flex items-center justify-between text-sm text-neutral-400">
                    <span>
                      Updated{" "}
                      {new Date(b.updatedAt).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric"
                      })}
                    </span>

                    <Link
                      href={`/board/${b.id}`}
                      className="flex items-center gap-2 opacity-0 transition group-hover:opacity-100"
                    >
                      Open <ArrowRight className="h-4 w-4" />
                    </Link>
                  </div>
                </div>
              </Card>
            ))
          )}
        </div>
      </div>
    </main>
  );
}
