// The database module: the file's modes, the settings, the version checks, the cascade of an
// account's rows, and the notice about the JSON folders of earlier versions.

import { afterEach, describe, expect, spyOn, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PersistenceError } from "./errors.ts";
import { reportOldJsonFolders } from "./old-folders.ts";
import { DATABASE_FILE, isSupportedSqlite, openDatabase } from "./open.ts";
import { SCHEMA_VERSION } from "./schema.ts";
import { countRows, insertAccount, insertRow, memoryDatabase } from "./testing.ts";

const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

function temporaryDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), "algotank-db-"));
  directories.push(directory);
  return directory;
}

const ACCOUNT = "0b1c2d3e-0000-4000-8000-000000000001";

describe("a database file", () => {
  test("is 0600 with its -wal and -shm files, in a 0700 folder it creates, in WAL mode with the settings applied", () => {
    const dataDir = join(temporaryDirectory(), "data");
    const db = openDatabase({ kind: "file", dataDir });
    insertAccount(db, ACCOUNT);
    expect(statSync(dataDir).mode & 0o777).toBe(0o700);
    for (const name of [DATABASE_FILE, `${DATABASE_FILE}-wal`, `${DATABASE_FILE}-shm`]) {
      expect([name, statSync(join(dataDir, name)).mode & 0o777]).toEqual([name, 0o600]);
    }
    const pragma = (name: string) => Object.values(db.query<Record<string, unknown>, []>(`PRAGMA ${name}`).get() ?? {})[0];
    expect([pragma("journal_mode"), pragma("synchronous"), pragma("foreign_keys"), pragma("busy_timeout")]).toEqual(["wal", 2, 1, 5000]);
    db.close();
  });

  test("keeps its rows and its schema version over a reopen", () => {
    const dataDir = temporaryDirectory();
    const first = openDatabase({ kind: "file", dataDir });
    insertAccount(first, ACCOUNT);
    first.close();
    const second = openDatabase({ kind: "file", dataDir });
    expect(countRows(second, "account")).toBe(1);
    expect(second.query<{ user_version: number }, []>("PRAGMA user_version").get()?.user_version).toBe(SCHEMA_VERSION);
    second.close();
  });

  test("written by a newer version of the code stops the start with both versions named", () => {
    const dataDir = temporaryDirectory();
    const db = openDatabase({ kind: "file", dataDir });
    db.run(`PRAGMA user_version = ${SCHEMA_VERSION + 1}`);
    db.close();
    expect(() => openDatabase({ kind: "file", dataDir })).toThrow(PersistenceError);
    expect(() => openDatabase({ kind: "file", dataDir })).toThrow(`schema version ${SCHEMA_VERSION + 1}, and this version of AlgoTank knows only up to ${SCHEMA_VERSION}`);
  });
});

describe("a database in memory", () => {
  test("does not take WAL, so only a file database asks for it", () => {
    const db = memoryDatabase();
    expect(db.query<{ journal_mode: string }, []>("PRAGMA journal_mode = WAL").get()?.journal_mode).toBe("memory");
  });
});

describe("the SQLite version check", () => {
  test("takes 3.37.0 and newer and refuses older or unreadable versions", () => {
    expect(["3.37.0", "3.51.0", "3.53.2", "4.0.0"].map(isSupportedSqlite)).toEqual([true, true, true, true]);
    expect(["3.36.9", "3.8.11", "2.99.99", "", "unknown"].map(isSupportedSqlite)).toEqual([false, false, false, false, false]);
  });
});

describe("deleting an account", () => {
  test("deletes its rows in every other table", () => {
    const db = memoryDatabase();
    insertAccount(db, ACCOUNT);
    insertRow(db, "session", { token_hash: "a".repeat(64), account_id: ACCOUNT, expires_at: 1 });
    insertRow(db, "email_code", { account_id: ACCOUNT, purpose: "verify", code_hash: "h", attempts: 0, expires_at: 1 });
    insertRow(db, "account_tank", { account_id: ACCOUNT, name: "Rara", colour: 1, skin: "plain", second: 2, plate: null, icon: null, updated_at: 1 });
    insertRow(db, "account_strategy", { account_id: ACCOUNT, id: "style-0001", name: "Kept", updated_at: 1, strategy_json: "{}" });
    const numbers = { games: 1, rounds: 1, wins: 0, shots: 2, hits: 1 };
    insertRow(db, "account_stats", { account_id: ACCOUNT, ...numbers });
    insertRow(db, "account_stats_month", { account_id: ACCOUNT, month: "2026-11", ...numbers });
    const tables = ["session", "email_code", "account_tank", "account_strategy", "account_stats", "account_stats_month"];
    expect(tables.map((table) => countRows(db, table))).toEqual([1, 1, 1, 1, 1, 1]);
    db.run("DELETE FROM account WHERE id = ?", [ACCOUNT]);
    expect(tables.map((table) => countRows(db, table))).toEqual([0, 0, 0, 0, 0, 0]);
  });

  test("a row of an account that does not exist is refused", () => {
    const db = memoryDatabase();
    expect(() => insertRow(db, "session", { token_hash: "a".repeat(64), account_id: ACCOUNT, expires_at: 1 })).toThrow("FOREIGN KEY");
  });
});

describe("the JSON folders of an earlier version", () => {
  test("are named in one log line and left in place", () => {
    const dataDir = temporaryDirectory();
    const log = spyOn(console, "log").mockImplementation(() => {});
    try {
      reportOldJsonFolders(dataDir);
      expect(log).not.toHaveBeenCalled();
      for (const name of ["auth", "tanks"]) mkdirSync(join(dataDir, name));
      reportOldJsonFolders(dataDir);
      expect(log).toHaveBeenCalledTimes(1);
      expect(String(log.mock.calls[0]?.[0])).toContain("auth/, tanks/ from an earlier version");
      expect(statSync(join(dataDir, "auth")).isDirectory()).toBe(true);
    } finally {
      log.mockRestore();
    }
  });
});
