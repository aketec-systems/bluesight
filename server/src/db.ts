import { DatabaseSync } from 'node:sqlite';

// SQLite keeps hosting cheap: one file, no separate database server. The schema is small enough
// to move to Postgres later without changing the API.

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  phone TEXT UNIQUE NOT NULL,
  created_at INTEGER NOT NULL,
  name TEXT,
  dob TEXT,
  gender INTEGER NOT NULL DEFAULT 0,
  show_me INTEGER NOT NULL DEFAULT 7,
  age_min INTEGER NOT NULL DEFAULT 18,
  age_max INTEGER NOT NULL DEFAULT 60,
  intent INTEGER NOT NULL DEFAULT 0,
  vibes INTEGER NOT NULL DEFAULT 0,
  bio TEXT NOT NULL DEFAULT '',
  identity_pk BLOB,
  photo_key TEXT,
  thumbhash BLOB,
  photo_s INTEGER NOT NULL DEFAULT 0,
  photo_f INTEGER NOT NULL DEFAULT 0,
  lat REAL,
  lon REAL,
  -- 1 when the person picked a search city instead of using where they are (e.g. diaspora browsing back home)
  away INTEGER NOT NULL DEFAULT 0,
  lives_in TEXT NOT NULL DEFAULT '',
  radius_km INTEGER NOT NULL DEFAULT 25,
  last_active INTEGER NOT NULL DEFAULT 0,
  banned INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS users_geo ON users(lat, lon);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS otps (
  phone TEXT PRIMARY KEY,
  code_hash TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  sent_count INTEGER NOT NULL DEFAULT 0,
  window_start INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS swipes (
  from_id TEXT NOT NULL,
  to_id TEXT NOT NULL,
  liked INTEGER NOT NULL,
  at INTEGER NOT NULL,
  PRIMARY KEY (from_id, to_id)
);

CREATE TABLE IF NOT EXISTS matches (
  id TEXT PRIMARY KEY,
  a TEXT NOT NULL,
  b TEXT NOT NULL,
  source TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  closed_at INTEGER,
  UNIQUE (a, b)
);

CREATE TABLE IF NOT EXISTS nearby_claims (
  from_id TEXT NOT NULL,
  to_id TEXT NOT NULL,
  at INTEGER NOT NULL,
  PRIMARY KEY (from_id, to_id)
);

CREATE TABLE IF NOT EXISTS messages (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  match_id TEXT NOT NULL,
  from_id TEXT NOT NULL,
  to_id TEXT NOT NULL,
  body BLOB NOT NULL,
  at INTEGER NOT NULL
);

-- Per-user change feed. A client's sync cursor is the last seq it has seen.
CREATE TABLE IF NOT EXISTS changes (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  ref TEXT NOT NULL,
  at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS changes_user ON changes(user_id, seq);

CREATE TABLE IF NOT EXISTS blocks (
  from_id TEXT NOT NULL,
  to_id TEXT NOT NULL,
  at INTEGER NOT NULL,
  PRIMARY KEY (from_id, to_id)
);

CREATE TABLE IF NOT EXISTS reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  reporter_id TEXT NOT NULL,
  target_id TEXT,
  reason TEXT NOT NULL,
  note TEXT,
  evidence BLOB,
  at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS pass_log (
  user_id TEXT NOT NULL,
  at INTEGER NOT NULL
);

-- Makes sync retries safe on flaky networks: an op is applied at most once.
CREATE TABLE IF NOT EXISTS processed_ops (
  user_id TEXT NOT NULL,
  op_id TEXT NOT NULL,
  at INTEGER NOT NULL,
  PRIMARY KEY (user_id, op_id)
);
`;

export type Db = DatabaseSync;

export function openDb(file: string): Db {
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 3000; PRAGMA synchronous = NORMAL;');
  db.exec(SCHEMA);
  migrate(db);
  return db;
}

/** Adds columns introduced after a database was created. Safe to run every start. */
function migrate(db: Db) {
  const cols = new Set((db.prepare('PRAGMA table_info(users)').all() as { name: string }[]).map((c) => c.name));
  if (!cols.has('away')) db.exec('ALTER TABLE users ADD COLUMN away INTEGER NOT NULL DEFAULT 0');
  if (!cols.has('lives_in')) db.exec("ALTER TABLE users ADD COLUMN lives_in TEXT NOT NULL DEFAULT ''");
}

export function tx<T>(db: Db, fn: () => T): T {
  db.exec('BEGIN IMMEDIATE');
  try {
    const out = fn();
    db.exec('COMMIT');
    return out;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

export interface UserRow {
  id: string;
  phone: string;
  created_at: number;
  name: string | null;
  dob: string | null;
  gender: number;
  show_me: number;
  age_min: number;
  age_max: number;
  intent: number;
  vibes: number;
  bio: string;
  identity_pk: Uint8Array | null;
  photo_key: string | null;
  thumbhash: Uint8Array | null;
  photo_s: number;
  photo_f: number;
  lat: number | null;
  lon: number | null;
  away: number;
  lives_in: string;
  radius_km: number;
  last_active: number;
  banned: number;
}
