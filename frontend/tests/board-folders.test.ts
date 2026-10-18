import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Board, Folder, Share } from '../src/lib/types'
import {
  boardFolderName,
  boardsInFolder,
  filterFolderBoards,
  scopeFolderId,
} from '../src/components/workspace/board-folders'

const folders: Folder[] = [
  { id: 'work', name: 'Client work', createdAt: 1, updatedAt: 1 },
  { id: 'personal', name: 'Personal', createdAt: 2, updatedAt: 2 },
]
const activeShare: Share = {
  id: 'share',
  boardId: 'work-board',
  boardName: 'Sketch',
  token: 'public',
  createdAt: 1,
  revokedAt: null,
}
const boards: Board[] = [
  { id: 'legacy', name: 'Ideas', createdAt: 1, updatedAt: 4 },
  {
    id: 'unfiled',
    name: 'Untitled',
    folderId: null,
    createdAt: 2,
    updatedAt: 3,
  },
  {
    id: 'work-board',
    name: 'Sketch',
    folderId: 'work',
    folderName: 'Old folder name',
    share: activeShare,
    createdAt: 3,
    updatedAt: 2,
  },
  {
    id: 'personal-board',
    name: 'Shopping',
    folderId: 'personal',
    share: { ...activeShare, revokedAt: 0 },
    createdAt: 4,
    updatedAt: 1,
  },
]

test('folder scopes separate all, unfiled legacy records, and opaque folder IDs', () => {
  assert.deepEqual(
    boardsInFolder(boards, 'unfiled').map((board) => board.id),
    ['legacy', 'unfiled']
  )
  assert.deepEqual(
    boardsInFolder(boards, 'folder:work').map((board) => board.id),
    ['work-board']
  )
  assert.equal(boardsInFolder(boards, 'all').length, 4)
  assert.deepEqual(boardsInFolder(boards, 'folder:missing'), [])
  assert.equal(scopeFolderId('folder:all'), 'all')
  assert.equal(scopeFolderId('folder:id:with:colons'), 'id:with:colons')
  assert.equal(scopeFolderId('unfiled'), null)
})

test('folder search uses current folder names after rename and remains scoped', () => {
  const options = {
    scope: 'all' as const,
    filter: 'all' as const,
    query: '  CLIENT  ',
    sort: 'updated' as const,
  }
  assert.deepEqual(
    filterFolderBoards(boards, folders, options).map((board) => board.id),
    ['work-board']
  )
  assert.deepEqual(
    filterFolderBoards(boards, folders, { ...options, query: 'old folder' }),
    []
  )
  assert.deepEqual(
    filterFolderBoards(boards, folders, {
      ...options,
      scope: 'folder:personal',
    }),
    []
  )
  assert.deepEqual(
    filterFolderBoards(boards, folders, { ...options, query: 'SKETCH' }).map(
      (board) => board.id
    ),
    ['work-board']
  )
})

test('sharing filters retain revocation semantics inside each folder', () => {
  const options = { scope: 'all' as const, query: '', sort: 'updated' as const }
  assert.deepEqual(
    filterFolderBoards(boards, folders, { ...options, filter: 'shared' }).map(
      (board) => board.id
    ),
    ['work-board']
  )
  assert.deepEqual(
    filterFolderBoards(boards, folders, {
      ...options,
      scope: 'folder:personal',
      filter: 'private',
    }).map((board) => board.id),
    ['personal-board']
  )
  assert.deepEqual(
    filterFolderBoards(boards, folders, {
      ...options,
      scope: 'unfiled',
      filter: 'shared',
    }),
    []
  )
})

test('sorting and filtering never mutate the loaded board order', () => {
  const before = structuredClone(boards)
  const options = { scope: 'all' as const, filter: 'all' as const, query: '' }
  assert.deepEqual(
    filterFolderBoards(boards, folders, { ...options, sort: 'created' }).map(
      (board) => board.id
    ),
    ['personal-board', 'work-board', 'unfiled', 'legacy']
  )
  assert.deepEqual(
    filterFolderBoards(boards, folders, { ...options, sort: 'name' }).map(
      (board) => board.name
    ),
    ['Ideas', 'Shopping', 'Sketch', 'Untitled']
  )
  assert.deepEqual(boards, before)
})

test('moving and deleting folders produce the expected filter memberships', () => {
  const moved = boards.map((board) =>
    board.id === 'legacy'
      ? { ...board, folderId: 'work', folderName: 'Client work' }
      : board
  )
  assert.equal(boardsInFolder(moved, 'folder:work').length, 2)
  assert.equal(boardsInFolder(moved, 'unfiled').length, 1)
  const unfiled = moved.map((board) =>
    board.folderId === 'work'
      ? { ...board, folderId: null, folderName: null }
      : board
  )
  assert.equal(unfiled.length, boards.length)
  assert.equal(boardsInFolder(unfiled, 'unfiled').length, 3)
  assert.equal(
    unfiled.find((board) => board.id === 'work-board')?.share,
    activeShare
  )
})

test('folder labels fall back to board metadata during folder-load failure', () => {
  assert.equal(boardFolderName(boards[2], new Map()), 'Old folder name')
  assert.equal(boardFolderName(boards[0], new Map()), 'Unfiled')
  assert.deepEqual(
    filterFolderBoards(boards, [], {
      scope: 'all',
      filter: 'all',
      query: 'old folder',
      sort: 'updated',
    }).map((board) => board.id),
    ['work-board']
  )
})
