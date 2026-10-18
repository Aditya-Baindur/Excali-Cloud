'use client'

import { createElement } from 'react'
import { Sidebar } from '@videoflow/react-video-editor'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

export default function EditorProperties({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="dark gap-0 overflow-hidden border-white/10 bg-neutral-950 p-0 text-white"
        onKeyDown={(event) => event.stopPropagation()}
      >
        <DialogHeader className="border-b border-white/10 px-5 py-4">
          <DialogTitle className="text-sm">Edit properties</DialogTitle>
          <DialogDescription className="sr-only">
            Adjust the selected clip, or the project when no clip is selected.
          </DialogDescription>
        </DialogHeader>
        {/* VideoFlow scopes its controls to this element. Keep that styling
            inside the dialog without mounting a second editor or renderer. */}
        {createElement(
          'vf-editor',
          { 'data-theme': 'dark', className: 'video-editor-properties' },
          <Sidebar />
        )}
      </DialogContent>
    </Dialog>
  )
}
