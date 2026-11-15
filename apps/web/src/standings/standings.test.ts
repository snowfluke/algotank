/// <reference types="bun" />
import { plainTankLook } from "@game/arena";
import { describe, expect, test } from "bun:test";
import type { PublicArena, RoundSummary } from "@game/arena";
import { TEST_SETTINGS } from "../stream/fixtures.ts";
import { snapshotAt } from "../stream/fixtures.ts";
import { finalRanking, lastRoundResult, liveRanking, outlookOf, ownLive, placeOf, playerNames, roundHits, roundRows } from "./standings.ts";

const summary: RoundSummary = {
  round: 1,
  isFinal: false,
  seed: 1,
  ruleSetId: "standard",
  standings: [
    { botId: "a", score: 9, rank: 1, hitsLanded: 0, hitsTaken: 0 },
    { botId: "b", score: 5, rank: 2, hitsLanded: 0, hitsTaken: 0 },
    { botId: "c", score: 1, rank: 3, hitsLanded: 0, hitsTaken: 0 },
  ],
  survivors: ["a", "b"],
};

const arena: PublicArena = {
  id: "x",
  settings: TEST_SETTINGS,
  players: [
    { id: "a", name: "Ana", status: { kind: "winner" }, isBot: false, ready: false, look: plainTankLook(1) },
    { id: "b", name: "Bo", status: { kind: "eliminated", inRound: 2, finalRank: 2 }, isBot: false, ready: false, look: plainTankLook(2) },
    { id: "c", name: "Cy", status: { kind: "eliminated", inRound: 1, finalRank: 3 }, isBot: false, ready: false, look: plainTankLook(3) },
  ],
  phase: { kind: "finished", winnerId: "a", resultId: null },
  rounds: [summary],
  game: 1,
  auto: null,
  nextGameInMs: null,
  chat: "on",
};

describe("standings", () => {
  test("maps ids to names", () => {
    expect(playerNames(arena)).toEqual({ a: "Ana", b: "Bo", c: "Cy" });
  });

  test("marks who goes through", () => {
    const rows = roundRows(arena, summary);
    expect(rows.map((r) => [r.name, r.advanced])).toEqual([
      ["Ana", true],
      ["Bo", true],
      ["Cy", false],
    ]);
  });

  test("final ranking puts the winner first and sorts the rest by place", () => {
    const shuffled: PublicArena = { ...arena, players: [...arena.players].reverse() };
    expect(finalRanking(shuffled).map((p) => [p.place, p.name])).toEqual([
      [1, "Ana"],
      [2, "Bo"],
      [3, "Cy"],
    ]);
  });

  test("last round result for a player in the round", () => {
    expect(lastRoundResult(arena, "c")).toEqual({ round: 1, place: 3, of: 3, advanced: false, isFinal: false, nextIsFinal: true });
    expect(lastRoundResult(arena, "zzz")).toBeNull();
    expect(lastRoundResult({ ...arena, rounds: [] }, "a")).toBeNull();
  });

  test("place of a status", () => {
    expect(placeOf({ kind: "winner" })).toBe(1);
    expect(placeOf({ kind: "eliminated", inRound: 1, finalRank: 9 })).toBe(9);
    expect(placeOf({ kind: "playing" })).toBeNull();
  });
});

const bot = (id: string, score: number, water = 9) => ({
  id,
  x: 0,
  y: 0,
  direction: "N" as const,
  score,
  wasHit: false,
  build: { reach: 0, aim: 0, dodge: 0 },
  hitsLanded: score + 2,
  hitsTaken: 1,
  water,
  item: null,
  effect: null,
});

describe("live ranking", () => {
  test("tanks with the same points share a place, and rows carry the look and the bot flag", () => {
    const withBot: PublicArena = { ...arena, players: [...arena.players.slice(0, 2), { ...arena.players[2]!, isBot: true }] };
    const snapshot = { ...snapshotAt(3), survivorsAfterRound: 2, bots: [bot("a", 2), bot("b", 5), bot("c", 2)] };
    const ranking = liveRanking(withBot, snapshot);
    expect(ranking.rows.map((r) => [r.name, r.place, r.look.colour, r.isBot])).toEqual([
      ["Bo", 1, 2, false],
      ["Ana", 2, 1, false],
      ["Cy", 2, 3, true],
    ]);
    expect(ranking.cut).toBe(2);
    expect(ranking.tieAtCut).toBe(true);
  });

  test("no cut line when every tank goes through", () => {
    const snapshot = { ...snapshotAt(3), survivorsAfterRound: 8, bots: [bot("a", 2), bot("b", 5)] };
    expect(liveRanking(arena, snapshot).cut).toBeNull();
  });

  test("the viewer's own numbers and outlook", () => {
    const snapshot = { ...snapshotAt(3), survivorsAfterRound: 1, bots: [bot("a", 2, 1), bot("b", 5)] };
    const own = ownLive(snapshot, "a", false);
    expect(own).toMatchObject({ place: 2, tied: false, of: 2, score: 2, water: 1, canShoot: false, outlook: { kind: "out" } });
    expect(ownLive(snapshot, "zzz", false)).toBeNull();
  });

  test("the outlook says through, out, on the line, or the final's lead", () => {
    expect(outlookOf([9, 5, 3, 1], 5, 2, false)).toEqual({ kind: "through" });
    expect(outlookOf([9, 5, 3, 1], 3, 2, false)).toEqual({ kind: "out" });
    expect(outlookOf([9, 5, 5, 1], 5, 2, false)).toEqual({ kind: "onLine" });
    expect(outlookOf([9, 5], 5, 8, false)).toEqual({ kind: "allThrough" });
    expect(outlookOf([9, 9, 1], 9, null, true)).toEqual({ kind: "leading", shared: true });
    expect(outlookOf([9, 4, 1], 4, null, true)).toEqual({ kind: "chasing", behind: 5 });
  });

  test("round rows say when equal points sit next to each other", () => {
    const tied = { ...summary, standings: [summary.standings[0]!, { botId: "b", score: 9, rank: 2, hitsLanded: 0, hitsTaken: 0 }, summary.standings[2]!] };
    expect(roundRows(arena, tied).map((r) => r.sameScoreAsAbove)).toEqual([false, true, false]);
  });

  test("hits of a round come from its standings", () => {
    const played = { ...summary, standings: [{ botId: "a", score: 9, rank: 1, hitsLanded: 5, hitsTaken: 1 }] };
    expect(roundHits(played, "a")).toEqual({ landed: 5, taken: 1 });
    expect(roundHits(played, "b")).toBeNull();
  });
});
