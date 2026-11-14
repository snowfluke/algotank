// The backup: a copy of an open database, its mode, and the refusals that keep a wrong DATA_DIR
// or an existing file from passing as a backup.

import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Database } from "bun:sqlite";
import { backupDatabase } from "./backup.ts";
import { PersistenceError } from "./errors.ts";
import { openDatabase } from "./open.ts";
import { countRows, insertAccount } from "./testing.ts";

const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

function temporaryDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), "algotank-backup-"));
  directories.push(directory);
  return directory;
}

describe("a backup", () => {
  test("copies the open database, the rows still in its -wal file included, as a 0600 file", () => {
    const dataDir = temporaryDirectory();
    const running = openDatabase({ kind: "file", dataDir });
    insertAccount(running, "account-1");
    const target = join(temporaryDirectory(), "copy.sqlite");
    backupDatabase(dataDir, target);
    insertAccount(running, "account-2");
    running.close();

    expect(statSync(target).mode & 0o777).toBe(0o600);
    const copy = new Database(target, { readonly: true });
    expect(countRows(copy, "account")).toBe(1);
    copy.close();
  });

  test("refuses a folder without a database, and does not create one", () => {
    const dataDir = temporaryDirectory();
    expect(() => backupDatabase(dataDir, join(dataDir, "copy.sqlite"))).toThrow(PersistenceError);
    expect(() => statSync(join(dataDir, "algotank.sqlite"))).toThrow();
  });

  test("refuses a target that exists, so no file is overwritten", () => {
    const dataDir = temporaryDirectory();
    openDatabase({ kind: "file", dataDir }).close();
    const target = join(dataDir, "old.sqlite");
    writeFileSync(target, "an older backup");
    expect(() => backupDatabase(dataDir, target)).toThrow("exists already");
  });
});
