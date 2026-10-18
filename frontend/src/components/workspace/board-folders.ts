import type { Board, Folder } from '@/lib/types'

export type FolderScope = 'all' | 'unfiled' | `folder:${string}`
export type BoardFilter = 'all' | 'shared' | 'private'
export type BoardSort = 'updated' | 'created' | 'name'

export function scopeFolderId(scope: FolderScope): string | null {
  return scope.startsWith('folder:') ? scope.slice(7) : null
}

export function boardsInFolder(boards: readonly Board[], scope: FolderScope) {
  if (scope === 'all') return [...boards]
  if (scope === 'unfiled') return boards.filter((board) => !board.folderId)
  const id = scopeFolderId(scope)
  return boards.filter((board) => board.folderId === id)
}

export function boardFolderName(
  board: Board,
  folders: ReadonlyMap<string, Folder>
) {
  return board.folderId
    ? (folders.get(board.folderId)?.name ?? board.folderName ?? 'Folder')
    : 'Unfiled'
}

export function filterFolderBoards(
  boards: readonly Board[],
  folders: readonly Folder[],
  options: {
    scope: FolderScope
    filter: BoardFilter
    query: string
    sort: BoardSort
  }
) {
  const names = new Map(folders.map((folder) => [folder.id, folder]))
  const query = options.query.trim().toLocaleLowerCase()
  return boardsInFolder(boards, options.scope)
    .filter((board) => {
      const shared = Boolean(board.share && board.share.revokedAt === null)
      const matchesName = board.name.toLocaleLowerCase().includes(query)
      const matchesFolder =
        Boolean(board.folderId) &&
        boardFolderName(board, names).toLocaleLowerCase().includes(query)
      return (
        (matchesName || matchesFolder) &&
        (options.filter === 'all' ||
          (options.filter === 'shared' ? shared : !shared))
      )
    })
    .sort((a, b) =>
      options.sort === 'name'
        ? a.name.localeCompare(b.name)
        : options.sort === 'created'
          ? b.createdAt - a.createdAt
          : b.updatedAt - a.updatedAt
    )
}
