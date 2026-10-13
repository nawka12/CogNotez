// Append-only. Step N takes the DB from user_version N-1 to N. Never edit a shipped step.
export const MIGRATIONS: readonly string[] = [
  // 1
  `
  CREATE TABLE notes(id TEXT PRIMARY KEY, title TEXT NOT NULL DEFAULT '', body TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, deleted_at INTEGER,
    pinned INTEGER NOT NULL DEFAULT 0, archived INTEGER NOT NULL DEFAULT 0,
    locked INTEGER NOT NULL DEFAULT 0, cipher BLOB, cipher_format TEXT, rev TEXT NOT NULL);
  CREATE TABLE tags(id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE COLLATE NOCASE);
  CREATE TABLE note_tags(note_id TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
    tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE, PRIMARY KEY(note_id, tag_id));
  CREATE TABLE media(hash TEXT PRIMARY KEY, mime TEXT NOT NULL, bytes INTEGER NOT NULL, created_at INTEGER NOT NULL);
  CREATE TABLE note_media(note_id TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
    hash TEXT NOT NULL REFERENCES media(hash), PRIMARY KEY(note_id, hash));
  CREATE TABLE ai_messages(id TEXT PRIMARY KEY, note_id TEXT REFERENCES notes(id) ON DELETE CASCADE,
    thread_id TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('user','assistant','system')),
    content TEXT NOT NULL, model TEXT, created_at INTEGER NOT NULL);
  CREATE TABLE settings(key TEXT PRIMARY KEY, value TEXT NOT NULL);
  CREATE TABLE sync_state(id TEXT PRIMARY KEY, base_rev TEXT, base_hash TEXT);
  CREATE VIRTUAL TABLE notes_fts USING fts5(title, body, content='notes', content_rowid='rowid',
    tokenize='unicode61 remove_diacritics 2');

  CREATE INDEX notes_list ON notes(deleted_at, pinned DESC, updated_at DESC);
  CREATE INDEX note_tags_tag ON note_tags(tag_id);

  CREATE TRIGGER notes_ai AFTER INSERT ON notes BEGIN
    INSERT INTO notes_fts(rowid, title, body) VALUES (new.rowid, new.title, new.body);
  END;
  CREATE TRIGGER notes_ad AFTER DELETE ON notes BEGIN
    INSERT INTO notes_fts(notes_fts, rowid, title, body) VALUES ('delete', old.rowid, old.title, old.body);
  END;
  CREATE TRIGGER notes_au AFTER UPDATE OF title, body ON notes BEGIN
    INSERT INTO notes_fts(notes_fts, rowid, title, body) VALUES ('delete', old.rowid, old.title, old.body);
    INSERT INTO notes_fts(rowid, title, body) VALUES (new.rowid, new.title, new.body);
  END;
  `,
  // 2: Sync v2 (docs/v5/sync-v2.md §6). sync_names caches the remote listing for incremental lists.
  `
  ALTER TABLE notes ADD COLUMN conflict_of TEXT;
  CREATE TABLE purged(id TEXT PRIMARY KEY, rev TEXT NOT NULL, purged_at INTEGER NOT NULL);
  CREATE TABLE sync_names(name TEXT PRIMARY KEY);
  CREATE INDEX notes_conflict ON notes(conflict_of) WHERE conflict_of IS NOT NULL;
  `
]
