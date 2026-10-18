'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { UserButton, useUser } from '@clerk/nextjs'
import { Film, LayoutGrid, Link2 } from 'lucide-react'
import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'
import { BoardCommandTrigger } from './BoardCommandMenu'

const navigation = [
  { href: '/dashboard', label: 'Boards', icon: LayoutGrid },
  { href: '/editor', label: 'Editor', icon: Film },
  { href: '/admin/shares', label: 'Shares', icon: Link2 },
]

export function WorkspaceShell({
  children,
  section,
}: {
  children: ReactNode
  section: string
}) {
  const pathname = usePathname()
  const { user, isLoaded } = useUser()

  return (
    <div className="dark min-h-screen bg-neutral-950 text-white [color-scheme:dark] selection:bg-violet-500/30">
      <a
        href="#workspace-content"
        className="sr-only z-50 rounded-md bg-neutral-900 p-3 text-white focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        Skip to content
      </a>
      <header className="border-b border-white/[0.06]">
        <div className="mx-auto flex min-h-16 max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-3">
          <Link
            href="/dashboard"
            className="text-sm font-semibold tracking-tight text-neutral-200 outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
          >
            ExcaliCloud
          </Link>
          <div className="flex items-center gap-3 sm:gap-6">
            <nav aria-label="Workspace" className="flex gap-1">
              {navigation.map(({ href, label, icon: Icon }) => (
                <Link
                  key={href}
                  href={href}
                  aria-label={label}
                  aria-current={pathname === href ? 'page' : undefined}
                  className={cn(
                    'flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors outline-none focus-visible:ring-2 focus-visible:ring-violet-500',
                    pathname === href
                      ? 'bg-white/[0.06] text-white'
                      : 'text-neutral-400 hover:bg-white/[0.03] hover:text-white'
                  )}
                >
                  <Icon className="size-4" aria-hidden="true" />
                  <span className="hidden sm:inline">{label}</span>
                </Link>
              ))}
            </nav>
            <BoardCommandTrigger />
            {isLoaded && user ? <UserButton /> : null}
          </div>
        </div>
      </header>
      <main
        id="workspace-content"
        aria-label={section}
        className="mx-auto max-w-6xl px-6 py-10"
      >
        {children}
      </main>
    </div>
  )
}
