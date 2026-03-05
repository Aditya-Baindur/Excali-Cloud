"use client"

import React from "react"
import { Button } from "@/components/ui/button"
import { useRouter } from "next/navigation"

export default function Page() {

  const router = useRouter()

  return (
    <div className="flex items-center justify-center min-h-screen bg-black">
      <Button
        variant="ghost"
        onClick={() => router.push("/dashboard")}
        className="bg-white font-extrabold text-3xl p-5"
      >
        START
      </Button>
    </div>
  )
}