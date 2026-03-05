'use client'

import React from 'react'
import dynamic from 'next/dynamic'

const Excalidraw = dynamic(
  async () => (await import('@excalidraw/excalidraw')).Excalidraw,
  { ssr: false }
)

export default function ExcalidrawCanvas() {
  return (
    <div className="h-[calc(100vh-0px)] w-full">
      <Excalidraw />
    </div>
  )
}
