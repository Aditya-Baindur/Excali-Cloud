"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useUser } from "@clerk/nextjs"
import { ArrowRight, PencilRuler } from "lucide-react"

import { Button } from "@/components/ui/button"

export default function Page() {
  const router = useRouter()
  const { isLoaded, isSignedIn } = useUser()

  React.useEffect(() => {
    if (isLoaded && isSignedIn) {
      router.push("/dashboard")
    }
  }, [isLoaded, isSignedIn, router])

  if (!isLoaded) return null
  if (isSignedIn) return null

  return (
    <main className="relative grid min-h-screen place-items-center overflow-hidden bg-black text-white px-6">

      {/* background glow */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute left-1/2 top-[-250px] h-[600px] w-[600px] -translate-x-1/2 rounded-full bg-white/10 blur-3xl" />
        <div className="absolute bottom-[-150px] right-[15%] h-[350px] w-[350px] rounded-full bg-white/5 blur-3xl" />
      </div>

      <div className="relative max-w-2xl text-center space-y-8">

        {/* Title */}
        <div className="flex items-center justify-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/10">
            <PencilRuler className="h-5 w-5" />
          </div>

          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight">
            EXCALI-CLOUD
          </h1>
        </div>

        {/* Description */}
        <p className="text-white/60 text-lg leading-relaxed">
          A collaborative whiteboard powered by
          <span className="text-white"> Cloudflare R2</span> and
          <span className="text-white"> D1</span>.
        </p>

        {/* Actions */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">

          <Button
            asChild
            className="h-12 px-8 rounded-2xl bg-white text-black hover:bg-white/90"
          >
            <Link href="/dashboard">
              Open Dashboard
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>

          <Button
            asChild
            variant="ghost"
            className="h-12 px-8 rounded-2xl border border-white/15 text-white hover:bg-white/10"
          >
            <Link href="/draw">
              Quick Board
            </Link>
          </Button>

        </div>

        {/* Hint */}
        <p className="text-xs text-white/40">
          Quick Board deletes on refresh • Dashboard boards persist
        </p>

      </div>
    </main>
  )
}