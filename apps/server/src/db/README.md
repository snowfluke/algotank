# The database

The server keeps its data in one SQLite file, `DATA_DIR/algotank.sqlite`, through `bun:sqlite`. Without `DATA_DIR` (tests) the database is in memory. `open.ts` opens it, applies the settings (WAL for a file, `synchronous = FULL`, `foreign_keys = ON`, `busy_timeout = 5000`), refuses SQLite older than 3.37.0, and applies the migrations.

## Add a table or change one

1. Add one SQL string at the end of `MIGRATIONS` in `schema.ts`. Never edit a migration that a released version has applied, because a database that already has it does not run it again.
2. Each migration runs in its own transaction and sets `PRAGMA user_version` to its position, so a failed migration leaves the version before it. A database whose version is higher than the code knows stops the start.
3. Follow the conventions: `STRICT` tables, snake_case names, times as INTEGER milliseconds, booleans as INTEGER 0 or 1 with a CHECK. A value the code looks up, filters or sorts by gets its own column, with an index where a query needs one. A JSON text column holds only a whole snapshot that the code reads and writes as one piece. A row that belongs to an account references `account (id) ON DELETE CASCADE`, unless the server holds its live copy in memory (the arenas, the league): a delete in the database alone would then leave the copy in memory, which the next save writes back. `schema.ts` says so at each such table.

## Write a store

- The store receives the `Database` in its constructor and prepares its statements there, once. SQL lives only in the store's file and in this folder.
- The store reads the database on each call; it keeps no copy in memory. The turn loop never runs SQL.
- Check every row you read, and throw a `PersistenceError` that names the table and the key when a row is damaged.
- A read followed by a write runs in `db.transaction(...).immediate()`, because the reset-password tool can write while the server runs.
- Keep the rules (limits, ranking, retention) in TypeScript. A UNIQUE or CHECK constraint is the second guard; map its failure to the store's typed error, never to a 500.
- Test through the store's public interface on `memoryDatabase()` from `testing.ts`. Use `insertAccount` for a row that needs an account, and `insertRow` for a damaged row that no store would write.

## Memory, the turn loop and the files here

- Most stores read the database on each call. The arenas (`store.ts`), the league (`monthly/monthly.ts`) and today's usage numbers (`metrics/metrics.ts`) stay in memory, because the turn loop reads them, and write a snapshot at a change, once a minute, or at a clean stop. A turn never runs SQL.
- `errors.ts` holds `PersistenceError`, and `rows.ts` the error of a damaged row and the JSON column reader. `backup.ts` is the backup (`bun run backup <target file>`), with `VACUUM INTO`, which is safe while the server runs. A copy of the folder is not a safe backup in WAL mode.
- `old-folders.ts` lists the JSON folders of earlier versions, which the start names in one log line and does not read.
