// The account's play styles: who may call the routes, the checks on a record, the limit
// of 20, a stale copy, and the files (mode 0600, read back at start, a damaged file stops it).

import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AccountStrategiesResponse, PutAccountStrategyRequest } from "@game/arena";
import { PRESETS } from "@game/engine";
import { AccountStrategies, STRATEGIES_FOLDER } from "./account-strategies.ts";
import { PersistenceError } from "./arena-files.ts";
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

describe("play style files", () => {
  test("are written with mode 0600, read back by a new server, and removed when the last one goes", async () => {
    const dataDir = temporaryDirectory();
    const first = start({ dataDir });
    const cookie = await signUp(first);
    await put(first, cookie, idOf(1), body("Kept"));
    const folder = join(dataDir, STRATEGIES_FOLDER);
    const [file] = readdirSync(folder).filter((name) => name.endsWith(".json"));
    if (file === undefined) throw new Error("no file was written");
    expect(statSync(join(folder, file)).mode & 0o777).toBe(0o600);
    expect(statSync(folder).mode & 0o777).toBe(0o700);

    const accountId = file.replace(/\.json$/, "");
    const store = new AccountStrategies(dataDir);
    expect(store.list(accountId).map((s) => s.name)).toEqual(["Kept"]);
    store.remove(accountId, idOf(1));
    expect(readdirSync(folder).filter((name) => name.endsWith(".json"))).toEqual([]);
  });

  test("a damaged file stops the start with a message that names it", () => {
    const dataDir = temporaryDirectory();
    mkdirSync(join(dataDir, STRATEGIES_FOLDER));
    const path = join(dataDir, STRATEGIES_FOLDER, "0b1c2d3e-0000-4000-8000-000000000001.json");
    writeFileSync(path, "{ not json");
    expect(() => new AccountStrategies(dataDir)).toThrow(PersistenceError);
    expect(() => new AccountStrategies(dataDir)).toThrow(path);
    writeFileSync(path, JSON.stringify({ version: 1, strategies: [{ id: idOf(1), name: "", strategy, updatedAt: NOW }] }));
    expect(() => new AccountStrategies(dataDir)).toThrow("entry 1");
  });
});
