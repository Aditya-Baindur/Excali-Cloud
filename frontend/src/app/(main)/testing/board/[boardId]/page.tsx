import { redirect } from 'next/navigation'

export default async function TestingBoardPage({
  params,
}: {
  params: Promise<{ boardId: string }>
}) {
  const { boardId } = await params
  redirect(`/board/${encodeURIComponent(boardId)}`)
}
