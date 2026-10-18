import type { Metadata } from 'next'
import PublicShareViewer from './PublicShareViewer'

export const metadata: Metadata = {
  title: 'Shared board · ExcaliCloud',
  description: 'View a shared ExcaliCloud board and its videos.',
  robots: { index: false, follow: false },
}

export default async function SharedBoardPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  return <PublicShareViewer key={token} token={token} />
}
