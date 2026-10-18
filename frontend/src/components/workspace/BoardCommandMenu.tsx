'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  useTransition,
  type ReactNode,
} from 'react'
import { useAuth } from '@clerk/nextjs'
import { usePathname, useRouter } from 'next/navigation'
import { Check, FilePenLine, Folder, Loader2, Search } from 'lucide-react'
import { defaultFilter } from 'cmdk'
import {
  CommandDialog,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { Button } from '@/components/ui/button'
import { apiFetch } from '@/lib/api'
import { cn } from '@/lib/utils'
import type { Board } from '@/lib/types'

type NavigationGuard = () => Promise<void>
const BoardNavigationContext = createContext<{
  openMenu: () => void
  registerGuard: (guard: NavigationGuard) => () => void
} | null>(null)

export function useBoardNavigation() {
  const context = useContext(BoardNavigationContext)
  if (!context) throw new Error('BoardNavigationProvider is missing.')
  return context
}

export function BoardNavigationProvider({ children }: { children: ReactNode }) {
  const { isSignedIn, userId } = useAuth()
  return (
    <AccountBoardNavigation
      key={userId ?? 'signed-out'}
      isSignedIn={!!isSignedIn}
    >
      {children}
    </AccountBoardNavigation>
  )
}

function AccountBoardNavigation({
  children,
  isSignedIn,
}: {
  children: ReactNode
  isSignedIn: boolean
}) {
  const pathname = usePathname()
  const router = useRouter()
  const guardRef = useRef<NavigationGuard | null>(null)
  const returnFocusRef = useRef<HTMLElement | null>(null)
  const navigatingRef = useRef(false)
  const [open, setOpen] = useState(false)
  const [boards, setBoards] = useState<Board[]>([])
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [navigationError, setNavigationError] = useState('')
  const [navigating, startTransition] = useTransition()
  const mountedRef = useRef(true)
  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])
  const [retry, setRetry] = useState(0)

  const openMenu = useCallback(() => {
    if (!isSignedIn || navigating || navigatingRef.current) return
    returnFocusRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null
    setBoards([])
    setLoading(true)
    setLoadError('')
    setNavigationError('')
    setOpen(true)
  }, [isSignedIn, navigating])

  const registerGuard = useCallback((guard: NavigationGuard) => {
    guardRef.current = guard
    return () => {
      if (guardRef.current === guard) guardRef.current = null
    }
  }, [])

  useEffect(() => {
    if (!open || !isSignedIn) return
    const controller = new AbortController()
    apiFetch<{ boards: Board[] }>('/boards', { signal: controller.signal })
      .then(({ boards: results }) => {
        if (controller.signal.aborted) return
        setBoards([...results].sort((a, b) => b.updatedAt - a.updatedAt))
        setLoading(false)
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        setLoadError(
          error instanceof Error ? error.message : 'Could not load boards.'
        )
        setLoading(false)
      })
    return () => controller.abort()
  }, [open, isSignedIn, retry])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        !isSignedIn ||
        event.isComposing ||
        event.altKey ||
        !(event.metaKey || event.ctrlKey) ||
        event.key.toLowerCase() !== 'k'
      )
        return
      event.preventDefault()
      event.stopImmediatePropagation()
      if (event.repeat || navigatingRef.current || navigating) return
      if (open) setOpen(false)
      else openMenu()
    }
    window.addEventListener('keydown', onKeyDown, { capture: true })
    return () =>
      window.removeEventListener('keydown', onKeyDown, { capture: true })
  }, [isSignedIn, open, openMenu, navigating])

  function selectBoard(board: Board) {
    if (navigatingRef.current || navigating) return
    const href = `/board/${board.id}`
    if (pathname === href) {
      setOpen(false)
      return
    }
    navigatingRef.current = true
    setNavigationError('')
    startTransition(async () => {
      try {
        await guardRef.current?.()
        if (!mountedRef.current) return
        setOpen(false)
        router.push(href)
      } catch (error) {
        setNavigationError(
          error instanceof Error
            ? error.message
            : 'Could not save this board. Try again.'
        )
      } finally {
        navigatingRef.current = false
      }
    })
  }

  return (
    <BoardNavigationContext.Provider value={{ openMenu, registerGuard }}>
      {children}
      <CommandDialog
        title="Switch board"
        onCloseAutoFocus={(event) => {
          event.preventDefault()
          if (returnFocusRef.current?.isConnected)
            returnFocusRef.current.focus()
        }}
        commandProps={{
          filter: (_value, search, keywords) =>
            defaultFilter(keywords?.join(' ') ?? '', search),
        }}
        description="Search your boards. Use arrow keys to select and Enter to open."
        open={open && !!isSignedIn}
        onOpenChange={(next) => {
          if (!navigatingRef.current && !navigating) setOpen(next)
        }}
        className="dark top-[22vh] translate-y-0 border-white/10 bg-neutral-950 text-white [color-scheme:dark]"
      >
        <CommandInput
          placeholder="Search boards…"
          aria-label="Search boards"
          readOnly={navigating}
        />
        <CommandList aria-busy={loading || navigating}>
          {loading ? (
            <div
              role="status"
              className="flex items-center justify-center gap-2 p-8 text-sm text-neutral-400"
            >
              <Loader2 className="size-4 animate-spin" /> Loading…
            </div>
          ) : loadError ? (
            <div className="p-6 text-center text-sm">
              <p role="alert" className="mb-3 text-neutral-400">
                {loadError}
              </p>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setLoading(true)
                  setLoadError('')
                  setRetry((value) => value + 1)
                }}
              >
                Retry
              </Button>
            </div>
          ) : (
            <>
              <CommandEmpty>
                {boards.length ? 'No boards found.' : 'No boards yet.'}
              </CommandEmpty>
              {boards.map((board) => (
                <CommandItem
                  key={board.id}
                  value={board.id}
                  keywords={[board.name, board.folderName ?? '']}
                  disabled={navigating}
                  onSelect={() => void selectBoard(board)}
                  className="mx-2 my-1 gap-3 px-3 py-3 data-[selected=true]:bg-white/10"
                >
                  <FilePenLine className="size-4 shrink-0 text-neutral-500" />
                  <span className="min-w-0 flex-1 truncate">{board.name}</span>
                  {board.folderName ? (
                    <span className="flex max-w-[40%] items-center gap-1.5 text-xs text-neutral-500">
                      <Folder className="size-3 shrink-0" aria-hidden="true" />
                      <span className="truncate">{board.folderName}</span>
                    </span>
                  ) : null}
                  {pathname === `/board/${board.id}` ? (
                    <Check
                      aria-label="Current board"
                      className="ml-auto size-4 shrink-0 text-neutral-400"
                    />
                  ) : null}
                </CommandItem>
              ))}
            </>
          )}
        </CommandList>
        {navigationError ? (
          <p
            role="alert"
            className="border-t border-white/10 px-4 py-3 text-sm text-red-400"
          >
            {navigationError}
          </p>
        ) : null}
        {navigating ? (
          <p
            role="status"
            className="border-t border-white/10 px-4 py-3 text-sm text-neutral-400"
          >
            Saving…
          </p>
        ) : null}
      </CommandDialog>
    </BoardNavigationContext.Provider>
  )
}

const subscribe = () => () => {}
export function BoardCommandTrigger({ className }: { className?: string }) {
  const { openMenu } = useBoardNavigation()
  const shortcut = useSyncExternalStore(
    subscribe,
    () => (/Mac|iPhone|iPad/.test(navigator.platform) ? '⌘ K' : 'Ctrl K'),
    () => '⌘ K'
  )
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={openMenu}
      aria-label="Search boards"
      title={`Search boards (${shortcut})`}
      className={cn('gap-2 text-neutral-400 hover:text-white', className)}
    >
      <Search className="size-4" />
      <kbd className="hidden rounded border border-white/15 px-1.5 py-0.5 text-[10px] font-normal sm:inline">
        {shortcut}
      </kbd>
    </Button>
  )
}
