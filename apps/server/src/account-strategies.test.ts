// The account's play styles: who may call the routes, the checks on a record, the limit
// of 20, a stale copy, and the stored rows (kept over a restart, a damaged row names itself).

import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AccountStrategiesResponse, PutAccountStrategyRequest } from "@game/arena";
import { PRESETS } from "@game/engine";
import { AccountStrategies } from "./account-strategies.ts";
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
  const directory = mkdtempSync(join(tmpdir(), "algotank-strategies-"));
  directories.push(directory);
  return directory;
}

const strategy = PRESETS[0]?.strategy;
if (strategy === undefined) throw new Error("the engine has no preset");
const NOW = Date.parse("2026-11-11T09:00:00Z");
const body = (name: string, updatedAt = NOW): PutAccountStrategyRequest => ({ name, strategy, updatedAt });
const idOf = (n: number) => `style-${String(n).padStart(4, "0")}`;

async function list(t: TestServer, cookie: string): Promise<AccountStrategiesResponse> {
  const res = await t.api("/api/account/strategies", { cookie });
  expect(res.status).toBe(200);
  return (await res.json()) as AccountStrategiesResponse;
}

const put = (t: TestServer, cookie: string, id: string, payload: unknown) => t.api(`/api/account/strategies/${id}`, { method: "PUT", cookie, body: payload });

describe("account play style routes", () => {
  test("need a session, and a change from another site is refused", async () => {
    const t = start();
    expect((await t.api("/api/account/strategies")).status).toBe(401);
    expect((await t.api(`/api/account/strategies/${idOf(1)}`, { method: "PUT", body: body("Ana") })).status).toBe(401);
    const cookie = await signUp(t);
    const foreign = await t.api(`/api/account/strategies/${idOf(1)}`, {
      method: "PUT",
      cookie,
      body: body("Ana"),
      headers: { origin: "https://evil.example" },
    });
    expect(foreign.status).toBe(403);
    expect((await list(t, cookie)).strategies).toEqual([]);
  });

  test("a play style is created, replaced, listed newest first, kept apart per account and deleted", async () => {
    const t = start();
    const ana = await signUp(t);
    const budi = await signUp(t);
    expect((await put(t, ana, idOf(1), body("Sneaky", NOW))).status).toBe(204);
    expect((await put(t, ana, idOf(2), body("  Splashy  ", NOW + 5))).status).toBe(204);
    expect((await put(t, ana, idOf(1), body("Sneaky two", NOW + 10))).status).toBe(204);
    const mine = await list(t, ana);
    expect(mine.strategies.map((s) => [s.id, s.name])).toEqual([
      [idOf(1), "Sneaky two"],
      [idOf(2), "Splashy"],
    ]);
    expect((await list(t, budi)).strategies).toEqual([]);
    expect((await t.api(`/api/account/strategies/${idOf(1)}`, { method: "DELETE", cookie: ana })).status).toBe(204);
    // Deleting what is gone is not an error, so a retried delete succeeds.
    expect((await t.api(`/api/account/strategies/${idOf(1)}`, { method: "DELETE", cookie: ana })).status).toBe(204);
    expect((await list(t, ana)).strategies.map((s) => s.id)).toEqual([idOf(2)]);
  });

  test("an upsert keeps the id's ultimate, and a new id from a stale bundle gets one", async () => {
    const t = start();
    const cookie = await signUp(t);
    const { modes, build, ultimate } = strategy;
    const legacy = { modes, build };
    const explicit = { ...strategy, ultimate: "magnet" } as const;
    expect((await put(t, cookie, idOf(1), { ...body("Mine"), strategy: explicit })).status).toBe(204);
    const other = PRESETS.find((preset) => preset.id === "random-walker")!.strategy;
    expect((await put(t, cookie, idOf(1), { ...body("Mine", NOW + 1), strategy: other })).status).toBe(204);
    expect((await list(t, cookie)).strategies[0]?.strategy).toEqual({ ...other, ultimate: "magnet" });

    expect((await put(t, cookie, idOf(1), { ...body("Mine", NOW + 2), strategy: legacy })).status).toBe(204);
    expect((await put(t, cookie, idOf(2), { ...body("Old bundle"), strategy: legacy })).status).toBe(204);
    expect((await put(t, cookie, idOf(3), { ...body("Invalid"), strategy: { ...legacy, ultimate: "fly" } })).status).toBe(400);
    expect((await list(t, cookie)).strategies.map((s) => s.strategy)).toEqual([explicit, { ...legacy, ultimate }]);
  });

  test("the id, the name, the time and the strategy are checked", async () => {
    const t = start();
    const cookie = await signUp(t);
    const codeOf = async (res: Response) => [res.status, ((await res.json()) as { code?: string }).code];
    expect(await codeOf(await put(t, cookie, "short", body("Ana")))).toEqual([400, "strategy_id_invalid"]);
    expect(await codeOf(await put(t, cookie, idOf(1), body("")))).toEqual([400, "strategy_name_invalid"]);
    expect(await codeOf(await put(t, cookie, idOf(1), body("x".repeat(25))))).toEqual([400, "strategy_name_invalid"]);
    expect(await codeOf(await put(t, cookie, idOf(1), body("Ana​")))).toEqual([400, "strategy_name_invalid"]);
    expect(await codeOf(await put(t, cookie, idOf(1), body("Ana", 1.5)))).toEqual([400, "strategy_time_invalid"]);
    expect(await codeOf(await put(t, cookie, idOf(1), body("Ana", NOW + 2 * 24 * 60 * 60 * 1000)))).toEqual([400, "strategy_time_invalid"]);
    const broken = await put(t, cookie, idOf(1), { name: "Ana", updatedAt: NOW, strategy: { ...strategy, modes: [] } });
    expect(broken.status).toBe(400);
    expect(((await broken.json()) as { details?: string[] }).details?.length).toBeGreaterThan(0);
    const huge = await put(t, cookie, idOf(1), { ...body("Ana"), padding: "x".repeat(70 * 1024) });
    expect(huge.status).toBe(413);
    expect((await list(t, cookie)).strategies).toEqual([]);
  });

  test("an account keeps 20: a 21st id is refused, a replace at 20 still works", async () => {
    const t = start();
    const cookie = await signUp(t);
    for (let n = 1; n <= 20; n++) expect((await put(t, cookie, idOf(n), body(`Style ${n}`))).status).toBe(204);
    const over = await put(t, cookie, idOf(21), body("One more"));
    expect([over.status, ((await over.json()) as { code: string }).code]).toEqual([409, "strategy_limit"]);
    expect((await put(t, cookie, idOf(20), body("Renamed", NOW + 1))).status).toBe(204);
    expect((await list(t, cookie)).strategies).toHaveLength(20);
  });

  test("a copy older than the stored one is refused, so a late upload cannot undo a newer edit", async () => {
    const t = start();
    const cookie = await signUp(t);
    await put(t, cookie, idOf(1), body("Newer", NOW + 100));
    const stale = await put(t, cookie, idOf(1), body("Older", NOW));
    expect([stale.status, ((await stale.json()) as { code: string }).code]).toEqual([409, "strategy_stale"]);
    expect((await list(t, cookie)).strategies[0]?.name).toBe("Newer");
  });
});

describe("stored play styles", () => {
  test("are read back by a new server and go away when removed", async () => {
    const dataDir = temporaryDirectory();
    const first = start({ dataDir });
    const cookie = await signUp(first);
    await put(first, cookie, idOf(1), body("Kept"));
    await first.server.stop();

    const second = start({ dataDir });
    expect((await list(second, cookie)).strategies.map((s) => s.name)).toEqual(["Kept"]);
    await second.api(`/api/account/strategies/${idOf(1)}`, { method: "DELETE", cookie });
    expect((await list(second, cookie)).strategies).toEqual([]);
  });

  test("a damaged row is a PersistenceError that names the table, the account and the id", () => {
    const db = memoryDatabase();
    const account = "0b1c2d3e-0000-4000-8000-000000000001";
    insertAccount(db, account);
    const row = { account_id: account, id: idOf(1), name: "Kept", updated_at: NOW, strategy_json: "{ not json" };
    insertRow(db, "account_strategy", row);
    const store = new AccountStrategies(db);
    expect(() => store.list(account)).toThrow(PersistenceError);
    expect(() => store.list(account)).toThrow(`row ${account}/${idOf(1)} of the table account_strategy`);
    const second = memoryDatabase();
    insertAccount(second, account);
    insertRow(second, "account_strategy", { ...row, name: "", strategy_json: JSON.stringify(strategy) });
    expect(() => new AccountStrategies(second).list(account)).toThrow("The name must have");
  });
});
