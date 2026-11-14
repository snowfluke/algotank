// Statistics for players (docs/specs/revamp/81-metrics.md, K2) through the public interfaces:
// the event stream, the arena's answers, GET /api/account/stats and the monthly league.

import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expandTick, parseOwnStats, plainTankLook, type AccountStatsResponse, type OwnStats, type ReplayResponse, type StreamMessage } from "@game/arena";
import { createRound, PRESETS, runRound, statsOfRound, statsView, stepRound, type StrategyInput } from "@game/engine";
import { AccountStatsStore } from "./account-stats.ts";
import { ArenaStats } from "./arena-stats.ts";
import { manualScheduler } from "../test-helpers.ts";
import { createTestArena, joinTestPlayer, openStream, SETTINGS, signUp, startTestServer, type StreamReader, type TestServer } from "../test-helpers.ts";
import { zoneCalendar } from "../monthly/calendar.ts";
import { Champions } from "../monthly/champions.ts";
import { LeagueFiles } from "../monthly/league-files.ts";
import { MonthlyLeagues } from "../monthly/monthly.ts";
import { LeagueStreams } from "../monthly/streams.ts";

const servers: TestServer[] = [];
const streams: StreamReader[] = [];
const directories: string[] = [];

afterEach(async () => {
  for (const reader of streams.splice(0)) await reader.close();
  for (const t of servers.splice(0)) await t.server.stop();
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

const TICKS = 20;
/** A mode name and a rule id nobody else uses, to look for in what other people receive. */
const SECRET_MODE = "Zorblax plan";
const SECRET_RULE = "zorblax-rule";

function secretStrategy(): StrategyInput {
  const base = PRESETS.find((p) => p.id === "ambusher")?.strategy;
  if (base === undefined) throw new Error("test setup: no ambusher");
  return {
    ...base,
    modes: base.modes.map((mode, i) => (i === 0 ? { ...mode, name: SECRET_MODE, rules: mode.rules.map((rule, r) => (r === 0 ? { ...rule, id: SECRET_RULE } : rule)) } : mode)),
  };
}

async function stream(t: TestServer, arenaId: string, token?: string): Promise<StreamReader> {
  const reader = await openStream(t, arenaId, token);
  streams.push(reader);
  return reader;
}

const isStats = (m: StreamMessage): m is Extract<StreamMessage, { type: "stats" }> => m.type === "stats";
const phaseOf = (m: StreamMessage) => (m.type === "arena" ? m.arena.phase.kind : null);

/** A presenter arena with player A (signed in, the secret strategy) and player B, one round played. */
async function playedRound(options: { readonly dataDir?: string } = {}) {
  const t = startTestServer(options.dataDir === undefined ? {} : { dataDir: options.dataDir });
  servers.push(t);
  const { arenaId, cookie: owner } = await createTestArena(t, { settings: { ...SETTINGS, ticksPerRound: TICKS } });
  const accountA = await signUp(t);
  const joinA = await t.api(`/api/arenas/${arenaId}/players`, { method: "POST", cookie: accountA, body: { name: "Ana", look: plainTankLook(1) } });
  const a = (await joinA.json()) as { playerId: string; playerToken: string };
  const b = await joinTestPlayer(t, arenaId, "Budi", plainTankLook(2));
  expect((await t.api(`/api/arenas/${arenaId}/players/me/strategy`, { method: "PUT", token: a.playerToken, body: secretStrategy() })).status).toBe(204);
  const streamA = await stream(t, arenaId, a.playerToken);
  const streamB = await stream(t, arenaId, b.playerToken);
  const viewer = await stream(t, arenaId);
  expect((await t.api(`/api/arenas/${arenaId}/rounds`, { method: "POST", cookie: owner })).status).toBe(204);
  for (let i = 0; i < TICKS + 1; i++) t.ticks.tick();
  await viewer.waitFor((m) => phaseOf(m) === "break" || phaseOf(m) === "finished");
  await streamA.waitFor(isStats);
  return { t, arenaId, owner, accountA, a, b, streamA, streamB, viewer };
}

describe("a player's statistics in an arena", () => {
  test("arrive on the player's own stream just before the arena message that ends the round, and equal a count of the replay", async () => {
    const { t, arenaId, a, streamA } = await playedRound();
    const at = streamA.messages.findIndex(isStats);
    const next = streamA.messages[at + 1];
    expect(next?.type).toBe("arena");
    expect(next !== undefined && phaseOf(next)).not.toBe("running");

    const message = streamA.messages[at];
    const own = message !== undefined && isStats(message) ? parseOwnStats(message.stats) : null;
    if (own === null) throw new Error("the stats message did not pass its check");

    // The replay is the same round computed again from its seed: its public throws give A's shots, hits and times hit.
    const replay = (await (await t.api(`/api/arenas/${arenaId}/rounds/1/replay`)).json()) as ReplayResponse;
    const throws = replay.ticks.flatMap((tick) => expandTick(tick, replay.spawn).throws);
    const mine = throws.filter((e) => e.throwerId === a.playerId && (e.outcome === "hit" || e.outcome === "miss"));
    expect(own.last).toMatchObject({
      turns: TICKS,
      shots: mine.length,
      hits: mine.filter((e) => e.outcome === "hit").length,
      timesHit: throws.filter((e) => e.outcome === "hit" && e.targetId === a.playerId).length,
    });
    expect(own).toMatchObject({ game: 1, round: 1 });
    expect(own.last.modes[0]?.name).toBe(SECRET_MODE);
    expect(own.gameTotal).toEqual({ turns: own.last.turns, shots: own.last.shots, hits: own.last.hits, timesHit: own.last.timesHit, squaresMoved: own.last.squaresMoved, noRuleTurns: own.last.noRuleTurns });
    const ruleTurns = own.last.modes.reduce((sum, mode) => sum + mode.rules.reduce((s, n) => s + n, 0) + mode.fallback, 0);
    expect(ruleTurns).toBe(TICKS);
  });

  test("never reach another player, a viewer, the arena message or the arena's answer", async () => {
    const { t, arenaId, a, b, streamA, streamB, viewer } = await playedRound();
    expect(JSON.stringify(streamA.messages)).toContain(SECRET_MODE);
    for (const reader of [streamB, viewer]) {
      const bytes = JSON.stringify(reader.messages);
      expect(bytes).not.toContain(SECRET_MODE);
      expect(bytes).not.toContain(SECRET_RULE);
    }
    // B's stream has B's own statistics and nothing of A's.
    expect(streamB.messages.filter(isStats)).toHaveLength(1);
    expect(viewer.messages.filter(isStats)).toHaveLength(0);
    for (const message of streamA.messages) if (message.type === "arena") expect(JSON.stringify(message)).not.toContain(SECRET_MODE);
    expect(await (await t.api(`/api/arenas/${arenaId}`)).text()).not.toContain(SECRET_MODE);

    // On connect in the break: A's new stream starts with A's card; B's and a viewer's do not get it.
    const againA = await stream(t, arenaId, a.playerToken);
    const againB = await stream(t, arenaId, b.playerToken);
    const againViewer = await stream(t, arenaId);
    await againA.waitFor(isStats);
    await againB.waitFor(isStats);
    await againViewer.waitFor((m) => m.type === "arena");
    expect(JSON.stringify(againA.messages)).toContain(SECRET_MODE);
    expect(JSON.stringify(againB.messages)).not.toContain(SECRET_MODE);
    expect(againViewer.messages.filter(isStats)).toHaveLength(0);
  });

  test("count for a signed-in player's account: the round, its shots and hits, and the game with its win", async () => {
    // Two tanks play one round, which is the final, so the game ends with it.
    const { t, arenaId, accountA, a, streamA } = await playedRound();
    const own = streamA.messages.find(isStats)?.stats as OwnStats;
    const arena = await (await t.api(`/api/arenas/${arenaId}`)).json();
    expect(arena.phase.kind).toBe("finished");
    const won = arena.phase.winnerId === a.playerId ? 1 : 0;
    const numbers = { games: 1, rounds: 1, wins: won, shots: own.last.shots, hits: own.last.hits };
    const answer = (await (await t.api("/api/account/stats", { cookie: accountA })).json()) as AccountStatsResponse;
    expect(answer.stats).toEqual({ total: numbers, months: [{ month: "2026-11", ...numbers }] });
    // Someone else's account has nothing, and a visitor without a session is refused.
    const other = await signUp(t);
    expect(await (await t.api("/api/account/stats", { cookie: other })).json()).toEqual({ stats: null });
    expect((await t.api("/api/account/stats")).status).toBe(401);
  });

  test("survive a restart as account totals, which are read back from their file", async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "algotank-stats-"));
    directories.push(dataDir);
    const { t, accountA } = await playedRound({ dataDir });
    const saved = await (await t.api("/api/account/stats", { cookie: accountA })).json();
    expect(saved).not.toEqual({ stats: null });
    for (const reader of streams.splice(0)) await reader.close();
    await t.server.stop();
    servers.splice(servers.indexOf(t), 1);
    const again = startTestServer({ dataDir });
    servers.push(again);
    expect(await (await again.api("/api/account/stats", { cookie: accountA })).json()).toEqual(saved);
  });
});

describe("the engine's count matches a hand-checked round", () => {
  test("statsView over a played round adds up to its turns", () => {
    const strategy = PRESETS[0]?.strategy;
    if (strategy === undefined) throw new Error("test setup");
    const { spawn, ticks } = runRound({ seed: 11, ticksTotal: 30, survivorsAfterRound: null, ruleSetId: "standard", players: [{ id: "x", strategy }, { id: "y", strategy }] });
    const view = statsView(statsOfRound(spawn, ticks, "x"), strategy);
    expect(view.modes.reduce((sum, mode) => sum + mode.rules.reduce((s, n) => s + n, 0) + mode.fallback, 0)).toBe(30);
  });
});

// ---------------------------------------------------------------------------
// The monthly league: today's statistics over a join, a quit and a restart.
// ---------------------------------------------------------------------------

const NOV_14_10H = Date.parse("2026-11-14T03:00:00Z");

function league(dataDir: string | undefined, at = NOV_14_10H) {
  const ticks = manualScheduler(at);
  const streams = new LeagueStreams({ heartbeatMs: 60_000, maxStreamsPerLeague: 10 });
  const monthly = new MonthlyLeagues({
    files: new LeagueFiles(dataDir),
    champions: new Champions(dataDir),
    streams,
    calendar: zoneCalendar("Asia/Jakarta"),
    now: ticks.now,
    scheduler: ticks,
    tickMs: 900,
  });
  monthly.start();
  return { ticks, monthly, streams };
}

const seatStats = (l: ReturnType<typeof league>, accountId: string) => {
  const seat = l.monthly.me(accountId).seat;
  if (seat === null) throw new Error(`${accountId} has no seat`);
  return seat.stats;
};

describe("a seat's statistics in the monthly league", () => {
  const strategy = (id: string) => {
    const preset = PRESETS.find((p) => p.id === id);
    if (preset === undefined) throw new Error("test setup");
    return preset.strategy;
  };

  test("count every turn from the seat, start again at zero after a quit and a new seat, and survive a restart", () => {
    const dataDir = mkdtempSync(join(tmpdir(), "algotank-monthly-stats-"));
    directories.push(dataDir);
    const l = league(dataDir);
    l.monthly.takeSeat("account-a", { look: plainTankLook(1), strategy: strategy("picker") });
    expect(seatStats(l, "account-a").turns).toBe(0);
    for (let i = 0; i < 10; i++) l.ticks.tick();
    const tenTurns = seatStats(l, "account-a");
    expect(tenTurns.turns).toBe(10);
    expect(tenTurns.modes.reduce((sum, mode) => sum + mode.rules.reduce((s, n) => s + n, 0) + mode.fallback, 0)).toBe(10);

    // A second seat joins later: it counts from its own first turn.
    l.monthly.takeSeat("account-b", { look: plainTankLook(2), strategy: strategy("charger") });
    for (let i = 0; i < 5; i++) l.ticks.tick();
    expect(seatStats(l, "account-a").turns).toBe(15);
    expect(seatStats(l, "account-b").turns).toBe(5);

    // A restart resumes from the checkpoint the clean stop wrote.
    l.monthly.stop();
    const resumed = league(dataDir, l.ticks.now());
    expect(seatStats(resumed, "account-a")).toEqual(seatStats(l, "account-a"));
    expect(seatStats(resumed, "account-b").turns).toBe(5);
    for (let i = 0; i < 3; i++) resumed.ticks.tick();
    expect(seatStats(resumed, "account-a").turns).toBe(18);

    // A quit takes the statistics with the seat; a new seat starts at zero.
    resumed.monthly.quit("account-b");
    expect(resumed.monthly.me("account-b").seat).toBeNull();
    resumed.monthly.takeSeat("account-b", { look: plainTankLook(2), strategy: strategy("charger") });
    expect(seatStats(resumed, "account-b").turns).toBe(0);
    resumed.monthly.stop();
  });

  test("a checkpoint from before the statistics loads, with zeros", () => {
    const dataDir = mkdtempSync(join(tmpdir(), "algotank-monthly-stats-"));
    directories.push(dataDir);
    const l = league(dataDir);
    const me = l.monthly.takeSeat("account-a", { look: plainTankLook(1), strategy: strategy("picker") });
    l.monthly.stop();
    const files = new LeagueFiles(dataDir);
    const checkpoint = files.readCheckpoint();
    if (checkpoint === null) throw new Error("no checkpoint");
    // Written as the file was before K2: no stats field.
    Bun.write(join(dataDir, "monthly", "today.json"), JSON.stringify({ version: 1, ...checkpoint, tanks: checkpoint.tanks.map(({ stats: _stats, ...rest }) => rest) }));
    const again = league(dataDir, l.ticks.now());
    expect(seatStats(again, "account-a").turns).toBe(0);
    expect(me.seat?.seatId).toBe(again.monthly.me("account-a").seat?.seatId ?? "");
    again.monthly.stop();
  });

  test("never go out in the league's state or turns, which another account's stream reads", async () => {
    const l = league(undefined);
    l.monthly.takeSeat("account-a", { look: plainTankLook(1), strategy: { ...strategy("picker"), modes: strategy("picker").modes.map((mode) => ({ ...mode, name: SECRET_MODE })) } });
    l.monthly.takeSeat("account-b", { look: plainTankLook(2), strategy: strategy("charger") });
    const reader = l.streams.open(1, "account-b", l.monthly.live(1)).body?.getReader();
    if (reader === undefined) throw new Error("no body");
    for (let i = 0; i < 5; i++) l.ticks.tick();
    // The stream's queue hands its chunks over in microtasks; one macrotask lets them arrive.
    await new Promise((resolve) => setTimeout(resolve, 0));
    let bytes = "";
    const decoder = new TextDecoder();
    for (;;) {
      const next = await Promise.race([reader.read(), new Promise<null>((resolve) => setTimeout(() => resolve(null), 20))]);
      if (next === null || next.done) break;
      bytes += decoder.decode(next.value, { stream: true });
    }
    await reader.cancel();
    expect(bytes).toContain('"type":"tick"');
    expect(bytes).not.toContain(SECRET_MODE);
    expect(bytes).not.toContain('"stats"');
    expect(JSON.stringify(l.monthly.ranking(1))).not.toContain(SECRET_MODE);
    // Only the owner's own answer carries them.
    expect(l.monthly.me("account-b").seat?.stats.modes.map((mode) => mode.name)).not.toContain(SECRET_MODE);
    expect(l.monthly.me("account-a").seat?.stats.modes[0]?.name).toBe(SECRET_MODE);
    l.monthly.stop();
  });
});

describe("the arena statistics in memory", () => {
  test("hold a fixed size per tank however many turns play, drop an aborted round and go with the arena", () => {
    const strategy = PRESETS.find((p) => p.id === "ambusher")?.strategy;
    if (strategy === undefined) throw new Error("test setup");
    const stats = new ArenaStats({ accounts: new AccountStatsStore(undefined), month: () => "2026-11" });
    // Two joins; only p1 plays the next game, so p2's credit goes at its start.
    stats.credit("ARENA1", "p1", "account-1");
    stats.credit("ARENA1", "p2", "account-2");
    const round = createRound({ seed: 5, ticksTotal: 500, survivorsAfterRound: null, ruleSetId: "standard", players: [{ id: "p1", strategy }, { id: "p2", strategy }] });
    stats.roundStarted("ARENA1", 1, 1, [{ id: "p1", strategy }]);
    const sizes: number[] = [];
    while (!round.isOver) {
      const before = round.snapshot;
      stats.turn("ARENA1", before, stepRound(round));
      sizes.push(stats.holdings().uses);
    }
    // Ambusher has 2 modes and 4 rules: at most 6 counters, whatever the round's length.
    expect(Math.max(...sizes)).toBeLessThanOrEqual(6);
    expect(stats.holdings()).toMatchObject({ arenas: 1, players: 1, credits: 1 });
    stats.roundAborted("ARENA1");
    expect(stats.roundCompleted("ARENA1", { kind: "goesOn" }).size).toBe(0);
    expect(stats.ownOf("ARENA1", "p1", 1)).toBeNull();
    stats.forget("ARENA1");
    expect(stats.holdings()).toEqual({ arenas: 0, players: 0, uses: 0, credits: 0 });
  });
});
