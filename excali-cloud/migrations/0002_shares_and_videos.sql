-- Safe to apply to an existing database; existing boards and scenes are preserved.
CREATE TABLE IF NOT EXISTS board_shares (
  id TEXT PRIMARY KEY,
  board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  token TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL,
  revoked_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_board_shares_user ON board_shares(user_id, created_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_board_shares_active ON board_shares(board_id) WHERE revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS board_videos (
  id TEXT PRIMARY KEY,
  board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size INTEGER NOT NULL CHECK(size > 0 AND size <= 52428800),
  r2_key TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_board_videos_board ON board_videos(board_id, created_at);
CREATE INDEX IF NOT EXISTS idx_board_videos_user ON board_videos(user_id);
