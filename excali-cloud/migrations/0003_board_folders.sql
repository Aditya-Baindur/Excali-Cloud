-- Additive folder storage. Existing boards remain unfiled until assigned.
CREATE UNIQUE INDEX IF NOT EXISTS idx_boards_id_user ON boards(id, user_id);

CREATE TABLE IF NOT EXISTS board_folders (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 200),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_board_folders_user ON board_folders(user_id, name);

CREATE TABLE IF NOT EXISTS board_folder_assignments (
  board_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  folder_id TEXT NOT NULL,
  FOREIGN KEY(board_id, user_id) REFERENCES boards(id, user_id) ON DELETE CASCADE,
  FOREIGN KEY(folder_id, user_id) REFERENCES board_folders(id, user_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_board_folder_assignments_folder ON board_folder_assignments(folder_id, user_id);
