import { describe, expect, test } from "bun:test";
import { compactTick, plainTankLook, type LeagueLive, type LeagueStreamMessage, type PublicSnapshot } from "@game/arena";
import { ruleSet, STANDARD_RULE_SET_ID, type Decision } from "@game/engine";
import { nextLeagueLoad, parseLeagueMessage } from "./leagueLive.ts";

const bot = (id: string, x: number) => ({ id, x, y: 1, direction: "N" as const, score: 0, wasHit: false, build: {}, hitsLanded: 0, hitsTaken: 0, water: 10, item: null, effect: null });
const board: PublicSnapshot = { width: 12, height: 9, tick: 0, ticksTotal: 100, survivorsAfterRound: null, ruleSetId: STANDARD_RULE_SET_ID, bots: [bot("a", 1), bot("b", 3)], items: [] };
const live: LeagueLive = {
  league: 1,
  month: "2026-11",
  day: "2026-11-14",
  dayEndsInMs: 1000,
  tickMs: 900,
  phase: "withoutBot",
  tanks: [
    { id: "a", name: "Ada", look: plainTankLook(1), isBot: false },
    { id: "b", name: "Bo", look: plainTankLook(2), isBot: false },
  ],
  board,
  activity: [],
};
const next: PublicSnapshot = { ...board, tick: 1, bots: [{ ...bot("a", 2), score: 1 }, { ...bot("b", 3), score: -1 }] };
const tick = compactTick({ tick: 0, order: ["a", "b"], moves: [{ botId: "a", move: "F" }, { botId: "b", move: "W" }], throws: [], pickups: [], snapshot: next }, ["a", "b"]);

describe("a league's live state", () => {
  test("a state message sets the board; a turn moves it; a turn before any state is skipped", () => {
    expect(nextLeagueLoad({ kind: "connecting" }, { type: "tick", tick, own: null }, 0)).toEqual({ kind: "connecting" });
    const ready = nextLeagueLoad({ kind: "connecting" }, { type: "state", state: live }, 0);
    const moved = nextLeagueLoad(ready, { type: "tick", tick, own: null }, 0);
    if (moved.kind !== "ready") throw new Error("expected a board");
    expect(moved.board.snapshot.bots.map((b) => [b.id, b.x, b.score])).toEqual([
      ["a", 2, 1],
      ["b", 3, -1],
    ]);
  });

  test("a turn for other tanks than the last state throws, so the page connects again", () => {
    const one = nextLeagueLoad({ kind: "connecting" }, { type: "state", state: { ...live, tanks: live.tanks.slice(0, 1), board: { ...board, bots: board.bots.slice(0, 1) } } }, 0);
    expect(() => nextLeagueLoad(one, { type: "tick", tick, own: null }, 0)).toThrow();
  });

  test("the day's end is anchored to the time the state arrived", () => {
    const ready = nextLeagueLoad({ kind: "connecting" }, { type: "state", state: live }, 5000);
    expect(ready.kind === "ready" ? ready.board.dayEndsAt : null).toBe(6000);
  });

  test("the own tank's turns feed the list, stay through a join on the same day, and start over on a new day", () => {
    const own = { botId: "a", ruleIndex: 0, move: "F" } as unknown as NonNullable<Parameters<typeof nextLeagueLoad>[1] & { type: "tick" }>["own"];
    const ready = nextLeagueLoad({ kind: "connecting" }, { type: "state", state: live }, 0);
    const moved = nextLeagueLoad(ready, { type: "tick", tick, own }, 0);
    const owned = (load: ReturnType<typeof nextLeagueLoad>) => (load.kind === "ready" ? load.board.own.map((o) => o.decision.botId) : []);
    expect(owned(moved)).toEqual(["a"]);
    expect(owned(nextLeagueLoad(moved, { type: "state", state: live }, 0))).toEqual(["a"]);
    expect(owned(nextLeagueLoad(moved, { type: "state", state: { ...live, day: "2026-11-15" } }, 0))).toEqual([]);
  });

  test("only board growth counts as a reshuffle", () => {
    const reshuffles = (load: ReturnType<typeof nextLeagueLoad>) => (load.kind === "ready" ? load.board.reshuffles : null);
    const ready = nextLeagueLoad({ kind: "connecting" }, { type: "state", state: live }, 0);
    expect(reshuffles(ready)).toBe(0);
    const moved = nextLeagueLoad(ready, { type: "tick", tick, own: null }, 0);
    // A join goes on with the round, so its state keeps the turn.
    const joined = nextLeagueLoad(moved, { type: "state", state: { ...live, board: next } }, 0);
    expect(reshuffles(joined)).toBe(0);
    // Error recovery may reset to turn 0 too, without growing the board.
    expect(reshuffles(nextLeagueLoad(joined, { type: "state", state: live }, 0))).toBe(0);
    const growth = parseLeagueMessage(JSON.stringify({ type: "state", state: live, change: "growth" }));
    if (growth === null) throw new Error("expected growth");
    const again = nextLeagueLoad(joined, growth, 0);
    expect(reshuffles(again)).toBe(1);
    // Two states at turn 0 in a row are one new round.
    expect(reshuffles(nextLeagueLoad(again, { type: "state", state: live }, 0))).toBe(1);
    expect(reshuffles(nextLeagueLoad(joined, { type: "state", state: { ...live, day: "2026-11-15" } }, 0))).toBe(0);
  });

  test("a fresh start gives the owner's feed one line and sets the order for the following tick", () => {
    const ready = nextLeagueLoad({ kind: "connecting" }, { type: "state", state: live }, 0);
    const own: Decision = { botId: "a", modeId: "main", nextModeId: "main", ruleId: null, actionId: "wait", move: "W" };
    const fresh: LeagueStreamMessage = { type: "tick", tick: { ...tick, freshStarts: [[0, 4, 2]] }, own };
    const moved = nextLeagueLoad(ready, fresh, 0);
    if (moved.kind !== "ready") throw new Error("expected a board");
    expect(moved.board.snapshot.bots.map(({ id, x, y }) => [id, x, y])).toEqual([["b", 3, 1], ["a", 4, 2]]);
    expect(moved.board.snapshot.bots[1]?.water).toBe(ruleSet(STANDARD_RULE_SET_ID).waterCapacity);
    expect(moved.board.tunnels).toMatchObject([{ kind: "through", from: { id: "a", x: 2, y: 1 } }]);
    expect(moved.board.ownFreshStart).toEqual({ id: "a", tick: 0 });
    expect(moved.board.reshuffles).toBe(0);
    for (const other of [null, { ...own, botId: "b" }]) {
      const watched = nextLeagueLoad(ready, { ...fresh, own: other }, 0);
      expect(watched.kind === "ready" ? watched.board.ownFreshStart : undefined).toBeNull();
    }

    const snapshot = { ...moved.board.snapshot, tick: 2 };
    const second = compactTick({ tick: 1, order: ["a", "b"], moves: [{ botId: "a", move: "W" }, { botId: "b", move: "W" }], throws: [], pickups: [], snapshot }, ["b", "a"]);
    const after = nextLeagueLoad(moved, { type: "tick", tick: second, own }, 900);
    if (after.kind !== "ready") throw new Error("expected a board");
    expect(after.board.snapshot).toEqual(snapshot);
    expect(after.board.tunnels).toEqual([]);
    expect(after.board.ownFreshStart).toEqual(moved.board.ownFreshStart);
  });

  test("a bot quit and join uses state at the same turn with a dust ring at each bot's square", () => {
    const withBot = { ...live, tanks: live.tanks.map((tank) => tank.id === "b" ? { ...tank, isBot: true } : tank) };
    const ready = nextLeagueLoad({ kind: "connecting" }, { type: "state", state: withBot }, 0);
    const moved = nextLeagueLoad(ready, { type: "tick", tick: { ...tick, freshStarts: [[0, 4, 2]] }, own: null }, 0);
    const state = { ...withBot, tanks: withBot.tanks.map((tank) => tank.id === "b" ? { ...tank, id: "c" } : tank), board: { ...next, bots: [bot("a", 4), bot("c", 5)] } };
    const changed = nextLeagueLoad(moved, { type: "state", state, change: "botFreshStart" }, 0);
    if (changed.kind !== "ready") throw new Error("expected a board");
    expect(changed.board.tunnels).toMatchObject([
      { kind: "through", from: { id: "a", x: 2 } },
      { kind: "exit", from: { id: "b", x: 3 }, look: plainTankLook(2) },
      { kind: "enter", id: "c" },
    ]);
    expect(changed.board.reshuffles).toBe(0);
  });

  test("a closed league ends the load with the number of leagues left", () => {
    const ready = nextLeagueLoad({ kind: "connecting" }, { type: "state", state: live }, 0);
    expect(nextLeagueLoad(ready, { type: "closed", leagues: 2 }, 0)).toEqual({ kind: "closed", leagues: 2 });
    expect(parseLeagueMessage(JSON.stringify({ type: "closed", leagues: 2 }))?.type).toBe("closed");
    expect(parseLeagueMessage(JSON.stringify({ type: "closed", leagues: 0 }))).toBeNull();
  });

  test("data that is not a league message is ignored", () => {
    expect(parseLeagueMessage("not json")).toBeNull();
    expect(parseLeagueMessage(JSON.stringify({ type: "arena" }))).toBeNull();
    expect(parseLeagueMessage(JSON.stringify({ type: "state", state: live }))?.type).toBe("state");
  });

  test("state messages deliver the validated activity through turns and replace it on a new state", () => {
    const activity: LeagueLive["activity"] = [{ kind: "joined", seatId: "a", name: "Ada", look: plainTankLook(1), at: 1000 }];
    const parse = (events: unknown) => parseLeagueMessage(JSON.stringify({ type: "state", state: { ...live, activity: events } }));
    expect(parse([{ ...activity[0], at: "today" }])).toBeNull();
    expect(parse(undefined)).toBeNull();
    const message = parse(activity);
    if (message?.type !== "state") throw new Error("expected a state");
    const ready = nextLeagueLoad({ kind: "connecting" }, message, 1000);
    const moved = nextLeagueLoad(ready, { type: "tick", tick, own: null }, 1000);
    const replaced = nextLeagueLoad(moved, { type: "state", state: live }, 1000);
    expect(moved.kind === "ready" ? moved.board.live.activity : null).toEqual(activity);
    expect(replaced.kind === "ready" ? replaced.board.live.activity : null).toEqual([]);
  });
});
