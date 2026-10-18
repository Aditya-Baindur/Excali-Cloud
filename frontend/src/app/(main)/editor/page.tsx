import type { Metadata } from 'next'
import EditorLoader from '@/components/editor/EditorLoader'

export const metadata: Metadata = {
  title: 'Video editor · ExcaliCloud',
}

export default async function EditorPage({
  searchParams,
}: {
  searchParams: Promise<{ boardId?: string; videoId?: string }>
}) {
  const { boardId, videoId } = await searchParams
  return <EditorLoader boardId={boardId} videoId={videoId} />
}
