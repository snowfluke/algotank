// The database's schema as an ordered list of migrations. MIGRATIONS[i] takes the database from
// version i to version i + 1; the version is PRAGMA user_version. Add a migration at the end and
// never edit one that a released version has applied (README.md in this folder).
//
// Conventions: STRICT tables, snake_case names, times as INTEGER milliseconds since 1970 (the
// code's clock), booleans as INTEGER 0 or 1 with a CHECK. A value the code looks up, filters or
// sorts by has its own column; JSON text only holds a whole snapshot read and written as one piece.

import type { Database } from "bun:sqlite";
import { PersistenceError } from "../arena-files.ts";

const MIGRATIONS: readonly string[] = [
  // 1: the accounts and what belongs to them (83-sqlite.md, D1). Every child row goes with its
  // account (ON DELETE CASCADE), although no route deletes an account today.
  `
  CREATE TABLE account (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL CHECK (password_hash <> ''),
    email_verified INTEGER NOT NULL CHECK (email_verified IN (0, 1)),
    language TEXT NOT NULL CHECK (language IN ('en', 'id')),
    created_at INTEGER NOT NULL
  ) STRICT;

  CREATE TABLE session (
    token_hash TEXT PRIMARY KEY CHECK (length(token_hash) = 64),
    account_id TEXT NOT NULL REFERENCES account (id) ON DELETE CASCADE,
    expires_at INTEGER NOT NULL
  ) STRICT;
  CREATE INDEX session_by_account ON session (account_id, expires_at);

  CREATE TABLE email_code (
    account_id TEXT NOT NULL REFERENCES account (id) ON DELETE CASCADE,
    purpose TEXT NOT NULL CHECK (purpose IN ('verify', 'reset')),
    code_hash TEXT NOT NULL CHECK (code_hash <> ''),
    attempts INTEGER NOT NULL CHECK (attempts >= 0),
    expires_at INTEGER NOT NULL,
    sent_at INTEGER NOT NULL,
    PRIMARY KEY (account_id, purpose)
  ) STRICT;

  CREATE TABLE account_tank (
    account_id TEXT PRIMARY KEY REFERENCES account (id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    colour INTEGER NOT NULL,
    skin TEXT NOT NULL,
    second INTEGER NOT NULL,
    plate INTEGER,
    icon TEXT,
    updated_at INTEGER NOT NULL
  ) STRICT;

  CREATE TABLE account_strategy (
    account_id TEXT NOT NULL REFERENCES account (id) ON DELETE CASCADE,
    id TEXT NOT NULL,
    name TEXT NOT NULL,
    updated_at INTEGER NOT NULL,
    strategy_json TEXT NOT NULL,
    PRIMARY KEY (account_id, id)
  ) STRICT;

  CREATE TABLE account_stats (
    account_id TEXT PRIMARY KEY REFERENCES account (id) ON DELETE CASCADE,
    games INTEGER NOT NULL CHECK (games >= 0),
    rounds INTEGER NOT NULL CHECK (rounds >= 0),
    wins INTEGER NOT NULL CHECK (wins >= 0),
    shots INTEGER NOT NULL CHECK (shots >= 0),
    hits INTEGER NOT NULL CHECK (hits >= 0)
  ) STRICT;

  -- The months of account_stats; the code keeps the last ACCOUNT_STATS_MONTHS of them.
  CREATE TABLE account_stats_month (
    account_id TEXT NOT NULL REFERENCES account_stats (account_id) ON DELETE CASCADE,
    month TEXT NOT NULL CHECK (month GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]'),
    games INTEGER NOT NULL CHECK (games >= 0),
    rounds INTEGER NOT NULL CHECK (rounds >= 0),
    wins INTEGER NOT NULL CHECK (wins >= 0),
    shots INTEGER NOT NULL CHECK (shots >= 0),
    hits INTEGER NOT NULL CHECK (hits >= 0),
    PRIMARY KEY (account_id, month)
  ) STRICT;
  `,
];

/** The version this code writes. */
export const SCHEMA_VERSION = MIGRATIONS.length;

/**
 * Applies the migrations the database does not have yet, each in its own transaction with its
 * version number, so a failed migration leaves the version before it. A database newer than
 * this code stops the start, because this code would misread tables it does not know.
 */
export function migrate(db: Database): void {
  const current = db.query<{ user_version: number }, []>("PRAGMA user_version").get()?.user_version;
  if (current === undefined) throw new PersistenceError("SQLite did not answer PRAGMA user_version.");
  if (current > SCHEMA_VERSION) {
    throw new PersistenceError(
      `The database has schema version ${current}, and this version of AlgoTank knows only up to ${SCHEMA_VERSION}. Start the newer version of AlgoTank, or restore a backup.`,
    );
  }
  MIGRATIONS.slice(current).forEach((sql, i) => {
    const version = current + i + 1;
    db.transaction(() => {
      db.run(sql);
      db.run(`PRAGMA user_version = ${version}`);
    })();
  });
}
