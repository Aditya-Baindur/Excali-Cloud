export type Share = {
  id: string
  boardId: string
  boardName: string
  token: string
  createdAt: number
  revokedAt: number | null
}

export type Board = {
  id: string
  name: string
  createdAt: number
  updatedAt: number
  share?: Share | null
  folderId?: string | null
  folderName?: string | null
}

export type Folder = {
  id: string
  name: string
  createdAt: number
  updatedAt: number
}

export type Video = {
  id: string
  boardId: string
  name: string
  mimeType: string
  size: number
  createdAt: number
}
