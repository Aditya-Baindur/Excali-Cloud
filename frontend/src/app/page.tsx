'use client'

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useUser } from '@clerk/nextjs'
import { ArrowRight, PencilRuler } from 'lucide-react'

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

      {/* Apple-style dark gradient overlay */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-[2px]" />

      {/* Content */}
      <div className="relative z-10 max-w-2xl space-y-10 px-6 text-center">
        {/* Logo */}
        <div className="flex items-center justify-center gap-3">

          <h1 className="text-5xl font-semibold tracking-tight">
            Excali-Cloud
          </h1>
        </div>

        {/* Subtitle */}
        <p className="text-lg leading-relaxed text-white/70">
          A stateful excalidraw whiteboard powered by
          <span className="font-medium text-white"> Cloudflare R2</span> and
          <span className="font-medium text-white"> D1</span>.
        </p>

        {/* CTAs */}
        <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
          {/* Public Demo */}
          <Button
            asChild
            className="h-12 rounded-full bg-white px-10 text-base font-medium text-black shadow-md hover:bg-transparent hover:text-white hover:outline-2 hover:outline-white"
          >
            <Link href="/public" className="flex items-center gap-3">
              <span className="ml-1">Try Demo</span>
              <ArrowRight className="mr-1 h-4 w-4 opacity-70" />
            </Link>
          </Button>

          {/* Dashboard */}
          {/* <Button
            asChild
            variant="ghost"
            className="h-12 rounded-full border border-white/20 px-10 text-white hover:bg-white"
          >
            <Link href="/dashboard">Open Dashboard</Link>
          </Button>
        </div> */}

        {/* Small hint */}
        <p className="text-xs text-white/40">
          Demo boards persist but are limited to 3 • Dashboard boards persist
          and are unlimited • <br/> Currently No sign-up for dashboard
        </p>
      </div>
    </main>
  )
}
