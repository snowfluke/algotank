// "My tank" of an account: who may call the routes, the name rule and the block list,
// the look check, "newer wins" with 409 for a stale copy, and the stored rows.

import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AccountTank, AccountTankErrorResponse, AccountTankResponse } from "@game/arena";
import { AccountTanks } from "./account-tank.ts";
import { PersistenceError } from "./db/errors.ts";
import { insertAccount, insertRow, memoryDatabase } from "./db/testing.ts";
import { signUp, startTestServer, type TestServer, type TestServerOptions } from "./test-helpers.ts";

const open: TestServer[] = [];
const directories: string[] = [];
afterEach(async () => {
  for (const t of open.splice(0)) await t.server.stop();
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

function start(options: TestServerOptions = {}): TestServer {
  const t = startTestServer(options);
  open.push(t);
  return t;
}

function temporaryDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), "algotank-tanks-"));
  directories.push(directory);
  return directory;
}

const NOW = Date.parse("2026-11-11T09:00:00Z");
const TANK: AccountTank = { name: "Rara 2015", look: { colour: 9, skin: "stars", second: 3, plate: 6, icon: "moon", flag: null }, updatedAt: NOW };

const get = async (t: TestServer, cookie: string): Promise<AccountTankResponse> => {
  const res = await t.api("/api/account/tank", { cookie });
  expect(res.status).toBe(200);
  return (await res.json()) as AccountTankResponse;
};
const put = (t: TestServer, cookie: string, body: unknown) => t.api("/api/account/tank", { method: "PUT", cookie, body });
const errorOf = async (res: Response) => (await res.json()) as AccountTankErrorResponse;

describe("the flag of My tank", () => {
  test("is saved and read back, and a tank saved before flags reads as one without a flag", async () => {
    const t = start();
    const cookie = await signUp(t);
    const flagged: AccountTank = { ...TANK, look: { ...TANK.look, flag: { pattern: "dot", first: 3, second: 1 } } };
    expect((await put(t, cookie, flagged)).status).toBe(204);
    expect(await get(t, cookie)).toEqual({ tank: flagged });
    expect((await put(t, cookie, { ...flagged, look: { ...flagged.look, flag: { pattern: "dot", first: 3, second: 3 } }, updatedAt: NOW + 1 })).status).toBe(400);
    expect((await put(t, cookie, { ...TANK, updatedAt: NOW + 2 })).status).toBe(204);
    expect(await get(t, cookie)).toEqual({ tank: { ...TANK, updatedAt: NOW + 2 } });
  });
});

describe("account tank routes", () => {
  test("need a session, and a change from another site is refused", async () => {
    const t = start();
    expect((await t.api("/api/account/tank")).status).toBe(401);
    expect((await t.api("/api/account/tank", { method: "PUT", body: TANK })).status).toBe(401);
    const cookie = await signUp(t);
    const foreign = await t.api("/api/account/tank", { method: "PUT", cookie, body: TANK, headers: { origin: "https://evil.example" } });
    expect(foreign.status).toBe(403);
    expect(await get(t, cookie)).toEqual({ tank: null });
  });

  test("saves the tank and reads it back, per account, with the name as parsePlayerName gives it", async () => {
    const t = start();
    const cookie = await signUp(t);
    const other = await signUp(t);
    expect((await put(t, cookie, { ...TANK, name: "  Rara   2015 ", extra: "dropped" })).status).toBe(204);
    expect(await get(t, cookie)).toEqual({ tank: TANK });
    expect(await get(t, other)).toEqual({ tank: null });
  });

  test("refuses a bad name, a blocked name with a suggestion, a bad look and a bad time", async () => {
    const t = start();
    const cookie = await signUp(t);
    expect(await errorOf(await put(t, cookie, { ...TANK, name: "Bo" }))).toMatchObject({ code: "name_invalid" });
    const blocked = await put(t, cookie, { ...TANK, name: "Tolol 7" });
    expect(blocked.status).toBe(400);
    expect(await errorOf(blocked)).toMatchObject({ code: "name_blocked", suggestion: expect.stringMatching(/^[A-Z][a-z]+ [A-Z][a-z]+$/) });
    expect(await errorOf(await put(t, cookie, { ...TANK, look: { ...TANK.look, second: 9 } }))).toMatchObject({ code: "look_invalid" });
    for (const updatedAt of [0, 1.5, "now", NOW + 2 * 24 * 60 * 60 * 1000]) {
      expect(await errorOf(await put(t, cookie, { ...TANK, updatedAt }))).toMatchObject({ code: "tank_time_invalid" });
    }
    expect(await get(t, cookie)).toEqual({ tank: null });
  });

  test("the newer copy wins: an older one is 409 tank_stale, the same time or newer replaces it", async () => {
    const t = start();
    const cookie = await signUp(t);
    await put(t, cookie, TANK);
    const stale = await put(t, cookie, { ...TANK, name: "Older", updatedAt: NOW - 1 });
    expect(stale.status).toBe(409);
    expect((await errorOf(stale)).code).toBe("tank_stale");
    expect((await put(t, cookie, { ...TANK, name: "Newer", updatedAt: NOW + 1 })).status).toBe(204);
    expect((await get(t, cookie)).tank?.name).toBe("Newer");
  });
});

describe("stored account tanks", () => {
  test("a saved tank survives a restart", async () => {
    const dataDir = temporaryDirectory();
    const first = start({ dataDir });
    const cookie = await signUp(first);
    await put(first, cookie, TANK);
    await first.server.stop();
    const second = start({ dataDir });
    expect((await get(second, cookie)).tank).toEqual(TANK);
  });

  const ACCOUNT = "00000000-0000-0000-0000-000000000000";
  const ROW = { account_id: ACCOUNT, name: TANK.name, colour: 9, skin: "stars", second: 3, plate: 6, icon: "moon", updated_at: NOW };

  test("a damaged row is a PersistenceError that names the table and the account", () => {
    const db = memoryDatabase();
    insertAccount(db, ACCOUNT);
    insertRow(db, "account_tank", { ...ROW, skin: "polka" });
    const tanks = new AccountTanks(db);
    expect(() => tanks.get(ACCOUNT)).toThrow(PersistenceError);
    expect(() => tanks.get(ACCOUNT)).toThrow(`row ${ACCOUNT} of the table account_tank`);
  });

  test("a stored name with a word added to the block list later still loads", () => {
    const db = memoryDatabase();
    insertAccount(db, ACCOUNT);
    insertRow(db, "account_tank", { ...ROW, name: "Anjing" });
    expect(new AccountTanks(db).get(ACCOUNT)?.name).toBe("Anjing");
  });
});
