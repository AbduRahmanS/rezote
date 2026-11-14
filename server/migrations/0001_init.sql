-- Rezote sync server schema. The server only stores encrypted envelopes.

CREATE TABLE IF NOT EXISTS spaces (
  id TEXT PRIMARY KEY,
  app TEXT NOT NULL,
  write_key_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS events (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  id TEXT NOT NULL UNIQUE,
  space TEXT NOT NULL REFERENCES spaces(id),
  received_at INTEGER NOT NULL,
  envelope TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS events_space_seq ON events(space, seq);
