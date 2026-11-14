// The database's schema as an ordered list of migrations. MIGRATIONS[i] takes the database from
// version i to version i + 1; the version is PRAGMA user_version. Add a migration at the end and
// never edit one that a released version has applied (README.md in this folder).
//
// Conventions: STRICT tables, snake_case names, times as INTEGER milliseconds since 1970 (the
// code's clock), booleans as INTEGER 0 or 1 with a CHECK. A value the code looks up, filters or
// sorts by has its own column; JSON text only holds a whole snapshot read and written as one piece.

import type { Database } from "bun:sqlite";
import { PersistenceError } from "./errors.ts";

const MIGRATIONS: readonly string[] = [
  // 1: the accounts and what belongs to them (83-sqlite.md, D1). Every child row goes with its
  // account (ON DELETE CASCADE), although no route deletes an account today.
  `
  CREATE TABLE account (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL CHECK (password_hash <> ''),
    email_verified INTEGER NOT NULL CHECK (email_verified IN (0, 1)),
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

  // 2: the arenas and their chat (83-sqlite.md, D2). The Store holds the live arenas in memory and
  // writes a whole snapshot per change (store.ts); the columns beside the snapshot are copies for
  // the one-arena-per-owner guard and for a person who reads the database. owner_account_id has
  // no foreign key: memory is the live copy, so a delete through the key would remove a row the next save writes
  // back. A chat line goes with its arena (ON DELETE CASCADE). Arena ids are the arena codes.
  `
  CREATE TABLE arena (
    id TEXT PRIMARY KEY,
    kind TEXT NOT NULL CHECK (kind IN ('private', 'presenter', 'practice', 'tournament')),
    owner_account_id TEXT,
    status TEXT NOT NULL CHECK (status IN ('lobby', 'running', 'break', 'finished')),
    updated_at INTEGER NOT NULL,
    snapshot_json TEXT NOT NULL
  ) STRICT;
  CREATE UNIQUE INDEX arena_one_per_owner ON arena (owner_account_id) WHERE owner_account_id IS NOT NULL;

  CREATE TABLE chat_line (
    sequence INTEGER PRIMARY KEY,
    arena_id TEXT NOT NULL REFERENCES arena (id) ON DELETE CASCADE,
    id TEXT NOT NULL CHECK (id <> ''),
    at INTEGER NOT NULL CHECK (at >= 0),
    sender_kind TEXT NOT NULL CHECK (sender_kind IN ('host', 'player')),
    player_id TEXT,
    name TEXT,
    look_json TEXT,
    text TEXT NOT NULL,
    CHECK (CASE sender_kind
      WHEN 'host' THEN player_id IS NULL AND name IS NULL AND look_json IS NULL
      ELSE player_id IS NOT NULL AND name IS NOT NULL AND look_json IS NOT NULL END),
    UNIQUE (arena_id, id)
  ) STRICT;
  CREATE INDEX chat_line_by_arena ON chat_line (arena_id, sequence);
  CREATE INDEX chat_line_by_time ON chat_line (at);
  `,

  // 3: the stored results of owners' tournaments. The document is the result and the accounts
  // behind its players, read and written as one piece.
  `
  CREATE TABLE result (
    id TEXT PRIMARY KEY,
    arena_id TEXT NOT NULL,
    owner_account_id TEXT NOT NULL REFERENCES account (id) ON DELETE CASCADE,
    finished_at INTEGER NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('private', 'presenter')),
    document_json TEXT NOT NULL
  ) STRICT;
  CREATE INDEX result_by_owner ON result (owner_account_id, finished_at);
  CREATE INDEX result_by_arena ON result (arena_id, finished_at);
  CREATE INDEX result_by_time ON result (finished_at);
  `,

  // 4: the lists of the public page. A tournament game adds its winner once (UNIQUE arena and
  // game). champion_month holds every closed month, with or without a record; champion holds a
  // month's top places, place 1 being the champion.
  `
  CREATE TABLE tournament_winner (
    sequence INTEGER PRIMARY KEY,
    arena_id TEXT NOT NULL,
    game INTEGER NOT NULL CHECK (game >= 1),
    name TEXT NOT NULL,
    look_json TEXT NOT NULL,
    won_at INTEGER NOT NULL,
    tanks INTEGER NOT NULL CHECK (tanks >= 2),
    UNIQUE (arena_id, game)
  ) STRICT;

  CREATE TABLE champion_month (
    month TEXT PRIMARY KEY CHECK (month GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]')
  ) STRICT;

  CREATE TABLE champion (
    month TEXT NOT NULL REFERENCES champion_month (month) ON DELETE CASCADE,
    place INTEGER NOT NULL CHECK (place BETWEEN 1 AND 10),
    rank INTEGER NOT NULL CHECK (rank >= 1),
    name TEXT NOT NULL,
    look_json TEXT NOT NULL,
    score REAL NOT NULL,
    games INTEGER NOT NULL CHECK (games >= 0),
    wins INTEGER NOT NULL CHECK (wins >= 0),
    PRIMARY KEY (month, place)
  ) STRICT;
  `,

  // 5: the monthly league (monthly/league-store.ts). MonthlyLeagues holds the seats and the day
  // round in memory, because the turn loop reads them, and writes them here at each change. Like
  // the arenas, these rows have no foreign key to account: memory is the live copy. The seat's
  // name is unique without case, as the name rule in monthly.ts; NOCASE folds only A to Z, so it
  // never refuses a name that rule accepts. league_checkpoint is one row, written once a minute.
  `
  CREATE TABLE league_state (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    leagues INTEGER NOT NULL CHECK (leagues >= 1),
    next_order INTEGER NOT NULL CHECK (next_order >= 1),
    closed_month TEXT CHECK (closed_month GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]')
  ) STRICT;

  CREATE TABLE league_seat (
    account_id TEXT PRIMARY KEY,
    seat_id TEXT NOT NULL UNIQUE,
    league INTEGER NOT NULL CHECK (league >= 1),
    name TEXT NOT NULL UNIQUE COLLATE NOCASE,
    look_json TEXT NOT NULL,
    strategy_json TEXT NOT NULL,
    seat_order INTEGER NOT NULL UNIQUE CHECK (seat_order >= 1)
  ) STRICT;

  CREATE TABLE league_name (
    account_id TEXT PRIMARY KEY,
    month TEXT NOT NULL CHECK (month GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]'),
    name TEXT NOT NULL
  ) STRICT;

  CREATE TABLE league_move (
    account_id TEXT PRIMARY KEY,
    month TEXT NOT NULL CHECK (month GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]'),
    from_league INTEGER NOT NULL CHECK (from_league >= 1),
    to_league INTEGER NOT NULL CHECK (to_league >= 1),
    kind TEXT NOT NULL CHECK (kind IN ('up', 'down', 'stayed'))
  ) STRICT;

  -- A counted day of one tank; place is set when the day closes.
  CREATE TABLE league_day_score (
    account_id TEXT NOT NULL,
    day TEXT NOT NULL CHECK (day GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
    seat_id TEXT NOT NULL,
    name TEXT NOT NULL,
    look_json TEXT NOT NULL,
    seat_order INTEGER NOT NULL CHECK (seat_order >= 1),
    league INTEGER NOT NULL CHECK (league >= 1),
    points INTEGER NOT NULL,
    place INTEGER CHECK (place >= 1),
    PRIMARY KEY (account_id, day)
  ) STRICT;
  CREATE INDEX league_day_score_by_day ON league_day_score (day);

  -- The top 3 of a finished day of one league.
  CREATE TABLE league_day_record (
    day TEXT NOT NULL CHECK (day GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
    league INTEGER NOT NULL CHECK (league >= 1),
    place INTEGER NOT NULL CHECK (place BETWEEN 1 AND 3),
    account_id TEXT NOT NULL,
    name TEXT NOT NULL,
    look_json TEXT NOT NULL,
    points INTEGER NOT NULL,
    PRIMARY KEY (day, league, place)
  ) STRICT;

  CREATE TABLE league_checkpoint (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    written_at INTEGER NOT NULL,
    checkpoint_json TEXT NOT NULL
  ) STRICT;
  `,

  // 6: the usage numbers of the admin page, one row per day and counter (metrics/day-counters.ts).
  `
  CREATE TABLE metrics_counter (
    day TEXT NOT NULL CHECK (day GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
    name TEXT NOT NULL,
    value INTEGER NOT NULL CHECK (value >= 0),
    PRIMARY KEY (day, name)
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
