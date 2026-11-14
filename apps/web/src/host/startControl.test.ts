/// <reference types="bun" />
import { plainTankLook } from "@game/arena";
import { describe, expect, test } from "bun:test";
import type { ArenaPhase, PublicArena, PublicPlayer } from "@game/arena";
import { TEST_SETTINGS } from "../stream/fixtures.ts";
import { ownerStep, readyCount } from "./startControl.ts";

function player(i: number, isBot = false, status: PublicPlayer["status"] = { kind: "playing" }): PublicPlayer {
  return { id: `p${i}`, name: `P${i}`, status, isBot, look: plainTankLook(1), ready: false };
}

function arena(phase: ArenaPhase, players: PublicPlayer[], botFill = false): PublicArena {
  return { id: "a", settings: { ...TEST_SETTINGS, botFill }, players, phase, rounds: [], game: 1, auto: null, nextGameInMs: null, chat: "on" };
}

const lobby: ArenaPhase = { kind: "lobby", nextRuleSetId: "standard", start: { kind: "waiting" } };
const humans = (n: number) => Array.from({ length: n }, (_, i) => player(i));

describe("ownerStep", () => {
  test("in the lobby, bots fill the seats up to 8 when they are on", () => {
    expect(ownerStep(arena(lobby, humans(1), true))).toEqual({ kind: "start", round: 1, tanks: 8, botsAdded: 7, isFinal: true, blocked: null });
    expect(ownerStep(arena(lobby, humans(12), true))).toMatchObject({ tanks: 12, botsAdded: 0, isFinal: false });
  });

  test("with a tank count of 48, the owner sees 48 tanks of which 47 are bots, and only the people with bots off", () => {
    const big = (botFill: boolean): PublicArena => ({ ...arena(lobby, humans(1), botFill), settings: { ...TEST_SETTINGS, kind: "private", botFill, tankCount: 48 } });
    expect(ownerStep(big(true))).toMatchObject({ tanks: 48, botsAdded: 47, isFinal: false });
    expect(ownerStep(big(false))).toMatchObject({ tanks: 1, botsAdded: 0 });
  });

  test("without bots, fewer than 2 people cannot start, and nobody at all is its own reason", () => {
    expect(ownerStep(arena(lobby, humans(1)))).toMatchObject({ tanks: 1, blocked: { kind: "tooFew", tanks: 1 } });
    expect(ownerStep(arena(lobby, []))).toMatchObject({ blocked: { kind: "noPlayers" } });
    expect(ownerStep(arena(lobby, [], true))).toMatchObject({ tanks: 8, blocked: { kind: "noPlayers" } });
  });

  test("in a break, only the tanks still playing count, and 8 or fewer make the final", () => {
    const players = [...humans(8), player(8, false, { kind: "eliminated", inRound: 1, finalRank: 9 })];
    expect(ownerStep(arena({ kind: "break", nextRound: 2, nextRuleSetId: "standard", start: { kind: "waiting" } }, players))).toMatchObject({
      round: 2,
      tanks: 8,
      isFinal: true,
      blocked: null,
    });
  });

  test("a running round and a finished game", () => {
    const running: ArenaPhase = { kind: "running", round: 2, isFinal: false, seed: 1, ruleSetId: "standard", playerIds: [], survivorsAfterRound: 8 };
    expect(ownerStep(arena(running, humans(10)))).toEqual({ kind: "running", round: 2, isFinal: false });
    expect(ownerStep(arena({ kind: "finished", winnerId: "p0", resultId: null }, humans(2)))).toEqual({ kind: "reset" });
  });
});

describe("readyCount", () => {
  test("counts the people who play the next round, without the owner's own tank, bots and players who are out", () => {
    const ready = (p: PublicPlayer) => ({ ...p, ready: true });
    const players = [ready(player(1)), ready(player(2)), player(3), player(4, true), player(5, false, { kind: "eliminated", inRound: 1, finalRank: 9 }), player(6, false, { kind: "removed" })];
    expect(readyCount(arena(lobby, players), null)).toEqual({ ready: 2, of: 3 });
    expect(readyCount(arena(lobby, players), "p1")).toEqual({ ready: 1, of: 2 });
  });
});
