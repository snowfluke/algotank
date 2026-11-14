# Work packages D1 and D2: storage moves from JSON files to SQLite

Read `00-overview.md` first. Owner, 2026-11-14: "okay then sqlite". Today 13 stores write JSON files under `DATA_DIR`. They move to one SQLite database, so the data has real queries and safe writes, with no service to install and no cost.

D1 builds the database module and moves the account stores. D2 moves the other stores and corrects the documents. D2 starts after the lead has reviewed D1. Neither builder commits; the lead does.

## Decisions for both packages

| Topic | Decision |
|-------|----------|
| Library | `bun:sqlite`, which Bun includes. No new dependency, no ORM, no query builder. |
| File | `DATA_DIR/algotank.sqlite`, mode 0600 in the 0700 folder; the `-wal` and `-shm` files next to it must not be readable by others either. Without a data folder (tests) the database is in memory. |
| Settings | `journal_mode = WAL` for a file database, `synchronous = FULL` (the game writes a few times a minute, and an account must not be lost in a power cut), `foreign_keys = ON`, `busy_timeout = 5000`. Find which SQLite version `bun:sqlite` loads on macOS and on Linux, use only features both have, and refuse to start below the minimum version you need, with a message that names both versions. |
| Schema | `apps/server/src/db/`: `open.ts` (open, settings, version check, close), `schema.ts` (the ordered list of migrations as SQL strings in TypeScript, applied in one transaction each, tracked in `PRAGMA user_version`), `testing.ts` (a database in memory for tests). A database whose version is newer than the code refuses to start. Tables are `STRICT` when both platforms allow it, names in snake_case, times as INTEGER milliseconds like the code's clock, booleans as INTEGER 0 or 1 with a CHECK. |
| Typed columns and JSON | A value the code looks up, filters or sorts by is a typed column with an index where a query needs one. A JSON text column holds only a whole snapshot that the code reads and writes as one piece (an arena, a rule set, the league's checkpoint, a stored result's round history). |
| Where the SQL lives | In the store's own file, in its feature folder. A store receives the `Database` in its constructor (today: the data folder) and prepares its statements once. No SQL outside the stores and `db/`. |
| Interfaces | Every store keeps its public interface, so routes and the turn loop do not change. Where one request changes two things (an account and its session, a code and the account's verified mark), one transaction does both. |
| Source of truth | The database, read on each call, for everything a request reads: accounts, sessions, email codes, "My tank", saved play styles, account statistics, stored results, chat lines, tournament winners, champions. Memory stays the live state only for what the turn loop reads: arenas, running rounds, the league's day round, today's usage counters. Those write their snapshot on the cadence they have today (on change for arenas, once a minute for the league checkpoint and the usage counters, at a clean stop for all). The turn loop never runs SQL. |
| Rules | Ranking, promotion, retention windows and limits stay in TypeScript with their existing constants. A UNIQUE or CHECK constraint is the second guard, and a constraint failure maps to the existing typed error (for example the "email taken" answer), never to a 500. |
| Old JSON files | No importer: the game was never deployed, so the only JSON data is on developers' machines. At start, when the data folder holds the old folders (`auth/`, `arenas/`, ...), the server logs one line that says they are from an earlier version and are not read, and leaves them untouched. The code that only served old files goes away with its tests: `refuseOldLayout`, `setAsideOldMonthlyData`, the accounts version 1 read, the stored-arena migrations below the current version (the version field and the refusal of an unknown version stay, so a later migration has its place). |
| Damaged data | A row that fails validation is reported the way a damaged file is today: a `PersistenceError` that names the table and the key. Validation at the boundary stays (the parse functions that check a stored arena keep checking it). |
| Clean stop | The server closes the database after the last write. |
| Tests | Through the public interfaces, on a database in memory. A test that opens a JSON file today (a session is stored by its hash and not by its token, the file's mode, damaged data) keeps its assertion against the database. Check whether a database in memory accepts WAL before asserting it. |

## D1: database module and account stores

You own `apps/server/src/db/**`, `apps/server/src/auth/**`, `account-tank.ts`, `account-strategies.ts`, `stats/account-stats.ts`, and the wiring in `server.ts` and `index.ts` for these stores.

| Store today | Tables |
|-------------|--------|
| `auth/store.ts` (accounts.json, sessions.json) | `account` (id, email unique without case, password hash, email verified, language, created at), `session` (token hash as key, account, expires at; at most 10 per account as today) |
| `auth/codes.ts` | `email_code` (account, purpose, code hash, attempts, expires at, sent at) |
| `account-tank.ts` | `account_tank` (account as key, the fields the code reads as columns) |
| `account-strategies.ts` | `account_strategy` (account, id, name, updated at, the rule set as JSON) |
| `stats/account-stats.ts` | `account_stats` (account as key, one column per total) |

The PID lock between the server and the reset-password tool (`auth/index.ts`, `auth/reset-password.ts`) exists because the server holds accounts in memory. With the database read on each call it has no purpose: remove it, and the tool writes while the server runs. Deleting an account's rows must not leave rows in the other tables (foreign keys with `ON DELETE CASCADE`), even when no route deletes an account today.

Write `db/README.md` in a few lines for the D2 builder and for contributors: how to add a table, how to write a migration, how a store gets its statements.

## D2: the other stores and the documents

Same pattern, read `db/README.md` and one D1 store first.

| Store today | Tables |
|-------------|--------|
| `arena-files.ts`, `store.ts` | `arena` (id, code, kind, owner account, status, updated at, the snapshot as JSON) |
| `chat.ts` | `chat_line` (arena, sequence, at, author fields, text); the 24 hours and 500 lines rules as today |
| `results.ts` | `result` (id, arena, owner account, finished at, kind, the document as JSON); 180 days as today; "my results" by a query on owner and time |
| `tournament-winners.ts`, `monthly/champions.ts` | `tournament_winner`, `champion` |
| `monthly/league-files.ts`, `monthly.ts`, `league-day.ts` | `league_seat` (one seat per account by a UNIQUE constraint, the name unique as today), `league_day_score` (league, day, account, points, counted), the month's standing as today's rules need it, `league_checkpoint` (one row, the day round's snapshot as JSON, written once a minute) |
| `metrics/day-files.ts` | `metrics_counter` (day, counter name, value), so the admin page's range is one query; 400 days as today |

`healthGauges` reads the checkpoint's age from the data folder today (`server.ts`); give it the checkpoint row's time.

Documents and tools:

- A backup command `bun run backup <target file>` that uses `VACUUM INTO`, which is safe while the server runs. Copying the folder of a running server is not a safe backup in WAL mode: say so.
- Correct every document that names the JSON files or the folder copy: `docs/deployment/**` (backup, restore, troubleshooting), `PRIVACY.md` (where each kind of data is kept), `docs/settings.md`, `README.md`, `docs/known-limits.md`, `docs/DEBT.md` (remove the rows this clears, add the ones it creates), `CONTRIBUTING.md` (how to add a table), `.gitignore` (`*.sqlite`, `*.sqlite-wal`, `*.sqlite-shm`).
- The specs in `docs/specs/revamp/` are the design record and stay as written.

## Check

`bun test` and `bun run type-check` (prefix long commands with `caffeinate -i`, because the laptop sleeps when idle and a sleep makes one test time out).

On a real process with a temporary `DATA_DIR` and your own port (D1: 9016, D2: 9017): register an account and, in D2, create an arena and take a league seat; stop the server with SIGTERM, start it again, and confirm that they are there. Repeat with `kill -9` on your own process. Print the database file's mode and the modes of its `-wal` and `-shm` files.

No screen changes, so no audit and no browser. Never `bun run build`; never port 8787. Report briefly: the tables, what you removed, the SQLite versions you found, the checks above, and anything a store could not keep from its interface.
