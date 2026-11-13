// SQLite storage (Node's built-in node:sqlite, no extra packages).
import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
export const DEFAULT_DB = process.env.HACKTRACK_DB ?? join(here, "..", "data", "hacktrack.db");

const SCHEMA = `
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE COLLATE NOCASE,
  handle        TEXT NOT NULL UNIQUE,
  role          TEXT NOT NULL CHECK (role IN ('participant','judge','admin')),
  country       TEXT NOT NULL DEFAULT '',
  password_hash TEXT NOT NULL,
  created_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS judges (
  id      TEXT PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  title   TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS sessions (
  token      TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS event (
  id                 INTEGER PRIMARY KEY CHECK (id = 1),
  name               TEXT NOT NULL,
  tagline            TEXT NOT NULL,
  starts_at          TEXT NOT NULL,
  deadline           TEXT NOT NULL,
  results_at         TEXT NOT NULL,
  judging_open       INTEGER NOT NULL DEFAULT 1,
  voting_open        INTEGER NOT NULL DEFAULT 1,
  results_published  INTEGER NOT NULL DEFAULT 0,
  judges_per_project INTEGER NOT NULL DEFAULT 3,
  max_team_size      INTEGER NOT NULL DEFAULT 4,
  votes_per_user     INTEGER NOT NULL DEFAULT 3
);

CREATE TABLE IF NOT EXISTS tracks (
  id TEXT PRIMARY KEY, code TEXT NOT NULL, name TEXT NOT NULL, description TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS prizes (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, amount TEXT NOT NULL, track_id TEXT, winners INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS rubric (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS teams (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL UNIQUE COLLATE NOCASE,
  invite_code TEXT NOT NULL UNIQUE,
  created_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS team_members (
  team_id   TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  user_id   TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,  -- one team per participant
  role      TEXT NOT NULL CHECK (role IN ('captain','member')),
  joined_at TEXT NOT NULL,
  PRIMARY KEY (team_id, user_id)
);

CREATE TABLE IF NOT EXISTS projects (
  id           INTEGER PRIMARY KEY,
  team_id      TEXT NOT NULL UNIQUE REFERENCES teams(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  tagline      TEXT NOT NULL DEFAULT '',
  description  TEXT NOT NULL DEFAULT '',
  track_id     TEXT REFERENCES tracks(id),
  stack        TEXT NOT NULL DEFAULT '[]',
  status       TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','submitted')),
  submitted_at TEXT,
  updated_at   TEXT NOT NULL,
  repo         TEXT NOT NULL DEFAULT '',
  demo         TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS conflicts (
  judge_id TEXT NOT NULL REFERENCES judges(id) ON DELETE CASCADE,
  team_id  TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  reason   TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (judge_id, team_id)
);

CREATE TABLE IF NOT EXISTS assignments (
  judge_id     TEXT NOT NULL REFERENCES judges(id) ON DELETE CASCADE,
  project_id   INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  status       TEXT NOT NULL DEFAULT 'not_started' CHECK (status IN ('not_started','in_progress','submitted','flagged')),
  scores       TEXT NOT NULL DEFAULT '{}',
  confidence   INTEGER NOT NULL DEFAULT 3,
  notes        TEXT NOT NULL DEFAULT '',
  submitted_at TEXT,
  updated_at   TEXT,
  PRIMARY KEY (judge_id, project_id)
);

CREATE TABLE IF NOT EXISTS votes (
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  PRIMARY KEY (user_id, project_id)
);

CREATE TABLE IF NOT EXISTS comments (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body       TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS audit (
  id     INTEGER PRIMARY KEY AUTOINCREMENT,
  at     TEXT NOT NULL,
  actor  TEXT NOT NULL,
  action TEXT NOT NULL,
  object TEXT NOT NULL,
  ip     TEXT NOT NULL DEFAULT '',
  detail TEXT NOT NULL DEFAULT ''
);
`;

export function openDb(file = DEFAULT_DB) {
  if (file !== ":memory:") mkdirSync(dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec(SCHEMA);
  return db;
}

/** Run `fn` inside a transaction; roll back on any throw. */
export function tx(db, fn) {
  db.exec("BEGIN");
  try {
    const out = fn();
    db.exec("COMMIT");
    return out;
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}
