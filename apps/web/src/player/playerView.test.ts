/// <reference types="bun" />
import { plainTankLook, isPublicKind } from "@game/arena";
import { describe, expect, test } from "bun:test";
import type { ArenaKind, ArenaPhase, PlayerStatus, PublicArena, PublicPlayer } from "@game/arena";
import { TEST_SETTINGS } from "../stream/fixtures.ts";
import { playerView } from "./playerView.ts";

const session = { playerId: "p1", playerToken: "t" };
const lobby: ArenaPhase = { kind: "lobby", nextRuleSetId: "standard", start: { kind: "waiting" } };
const pause: ArenaPhase = { kind: "break", nextRound: 2, nextRuleSetId: "standard", start: { kind: "waiting" } };
const finished: ArenaPhase = { kind: "finished", winnerId: "p1", resultId: null };

function arenaWith(phase: ArenaPhase, status: PlayerStatus = { kind: "playing" }, kind: ArenaKind = "presenter"): PublicArena {
  return {
    id: "a",
    settings: { ...TEST_SETTINGS, kind },
    players: [{ id: "p1", name: "Ana", status, isBot: false, ready: false, look: plainTankLook(1) }],
    phase,
    rounds: [],
    game: 1,
    auto: null,
    nextGameInMs: null,
    chat: isPublicKind(kind) ? null : "on",
  };
}

const running = (playerIds: string[]): ArenaPhase => ({
  kind: "running",
  round: 1,
  isFinal: false,
  seed: 1,
  ruleSetId: "standard",
  playerIds,
  survivorsAfterRound: 8,
});
const out: PlayerStatus = { kind: "eliminated", inRound: 1, finalRank: 9 };
const waiting: PlayerStatus = { kind: "waiting" };

describe("playerView", () => {
  test("the connection decides first: closed with an arena was closed, without one never existed", () => {
    expect(playerView("closed", arenaWith(lobby), session, null).kind).toBe("closed");
    expect(playerView("closed", null, session, null).kind).toBe("notFound");
    expect(playerView("connecting", null, session, null).kind).toBe("loading");
    // A dropped connection keeps the last arena, so a stored slot is never discarded by it.
    expect(playerView("reconnecting", arenaWith(lobby), session, null).kind).toBe("lobby");
  });

  test("without a slot: join in the lobby, and in any phase of a public arena", () => {
    expect(playerView("open", arenaWith(lobby), null, null).kind).toBe("join");
    expect(playerView("open", arenaWith(pause), null, null).kind).toBe("cannotJoin");
    expect(playerView("open", arenaWith(running(["p1"])), null, null).kind).toBe("cannotJoin");
    expect(playerView("open", arenaWith(finished, out, "private"), null, null).kind).toBe("cannotJoin");
    expect(playerView("open", arenaWith(running(["p1"]), { kind: "playing" }, "practice"), null, null).kind).toBe("join");
  });

  test("a full arena says so in the join view", () => {
    const players: PublicPlayer[] = Array.from({ length: 8 }, (_, i) => ({ id: `h${i}`, name: `H${i}`, status: { kind: "playing" }, isBot: false, ready: false, look: plainTankLook(1) }));
    expect(playerView("open", { ...arenaWith(lobby, undefined, "practice"), players }, null, null)).toMatchObject({ kind: "join", full: true });
    const withBots = players.map((p, i) => (i < 4 ? { ...p, isBot: true } : p));
    expect(playerView("open", { ...arenaWith(lobby, undefined, "practice"), players: withBots }, null, null)).toMatchObject({ kind: "join", full: false });
  });

  test("a signed-in-only lobby (joinPolicy account or verified) asks a visitor to sign in; anyone may join an arena that is open to all", () => {
    for (const joinPolicy of ["account", "verified"] as const) {
      const arena = { ...arenaWith(lobby, undefined, "private"), settings: { ...arenaWith(lobby, undefined, "private").settings, joinPolicy } };
      expect(playerView("open", arena, null, null).kind).toBe("loading");
      expect(playerView("open", arena, null, false)).toMatchObject({ kind: "signInToPlay" });
      expect(playerView("open", arena, null, true).kind).toBe("join");
    }
    expect(playerView("open", arenaWith(lobby, undefined, "private"), null, false).kind).toBe("join");
  });

  test("a signed-in account gets the join step in a running round and a break, so a second device can take its seat back", () => {
    for (const phase of [running(["p1"]), pause]) {
      const arena = { ...arenaWith(phase, undefined, "presenter"), settings: { ...arenaWith(phase, undefined, "presenter").settings, joinPolicy: "account" as const } };
      expect(playerView("open", arena, null, true)).toMatchObject({ kind: "join", full: false });
      expect(playerView("open", arena, null, false).kind).toBe("cannotJoin");
    }
  });

  test("a slot the arena does not know", () => {
    expect(playerView("open", { ...arenaWith(lobby), players: [] }, session, null).kind).toBe("lostSlot");
  });

  test("each phase and status of a joined player", () => {
    expect(playerView("open", arenaWith(lobby), session, null).kind).toBe("lobby");
    expect(playerView("open", arenaWith(running(["p1"])), session, null).kind).toBe("live");
    expect(playerView("open", arenaWith(running(["p2"]), out), session, null).kind).toBe("watching");
    expect(playerView("open", arenaWith(running(["p2"]), waiting, "practice"), session, null).kind).toBe("watching");
    expect(playerView("open", arenaWith(pause), session, null).kind).toBe("break");
    expect(playerView("open", arenaWith(pause, out), session, null).kind).toBe("out");
    expect(playerView("open", arenaWith(pause, waiting, "practice"), session, null).kind).toBe("waitingBreak");
    expect(playerView("open", arenaWith(finished, { kind: "winner" }), session, null).kind).toBe("finished");
  });
});
