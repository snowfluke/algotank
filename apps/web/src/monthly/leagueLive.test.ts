import { describe, expect, test } from "bun:test";
import { compactTick, plainTankLook, type LeagueLive, type PublicSnapshot } from "@game/arena";
import { STANDARD_RULE_SET_ID } from "@game/engine";
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
});
