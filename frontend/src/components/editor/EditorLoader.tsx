'use client'

import dynamic from 'next/dynamic'

const EditorWorkspace = dynamic(() => import('./EditorWorkspace'), {
  ssr: false,
  loading: () => (
    <div
      role="status"
      className="grid min-h-screen place-items-center bg-neutral-950 text-neutral-400"
    >
      Loading video editor…
    </div>
  ),
})

export default function EditorLoader(props: {
  boardId?: string
  videoId?: string
}) {
  return <EditorWorkspace {...props} />
}
