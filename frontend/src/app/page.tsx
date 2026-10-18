'use client'

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useUser } from '@clerk/nextjs'

import { Button } from '@/components/ui/button'

export default function Page() {
  const router = useRouter()
  const { isLoaded, isSignedIn } = useUser()

  React.useEffect(() => {
    if (isLoaded && isSignedIn) {
      router.push('/dashboard')
    }
  }, [isLoaded, isSignedIn, router])

  if (!isLoaded) return null
  if (isSignedIn) return null

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden text-white">
      {/* Background image */}
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{ backgroundImage: "url('/bg.avif')" }}
      />

      <div className="absolute inset-0 bg-black/50 backdrop-blur-[2px]" />

      {/* Content */}
      <div className="relative z-10 max-w-2xl space-y-8 px-6 text-center">
        {/* Logo */}
        <div className="flex items-center justify-center gap-3">
          <h1 className="text-5xl font-semibold tracking-tight">
            Excali-Cloud
          </h1>
        </div>

        <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
          <Button
            asChild
            className="h-12 rounded-full bg-white px-10 text-base font-medium text-black shadow-md hover:bg-transparent hover:text-white hover:outline-2 hover:outline-white"
          >
            <Link href="/sign-in">Sign in</Link>
          </Button>
          <Button
            asChild
            variant="ghost"
            className="h-12 rounded-full border border-white/20 px-10 text-base text-white hover:bg-white/10 hover:text-white"
          >
            <Link href="/public">Try demo</Link>
          </Button>
        </div>
        <Link
          href="/privacy"
          className="inline-block text-xs text-white/50 hover:text-white"
        >
          Privacy
        </Link>
      </div>
    </main>
  )
}
