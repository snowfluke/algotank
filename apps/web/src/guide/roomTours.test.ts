/// <reference types="bun" />
import { describe, expect, test } from "bun:test";
import { plainTankLook, type ArenaKind, type ArenaPhase, type PublicArena, isPublicKind } from "@game/arena";
import { playerView, type JoinedView } from "../player/playerView.ts";
import { TEST_SETTINGS } from "../stream/fixtures.ts";
import { roomTourOf } from "./RoomTours.tsx";

function view(phase: ArenaPhase, kind: ArenaKind): JoinedView {
  const arena: PublicArena = {
    id: "a",
    settings: { ...TEST_SETTINGS, kind },
    players: [
      { id: "p1", name: "Ana", status: phase.kind === "finished" ? { kind: "eliminated", inRound: 1, finalRank: 2 } : { kind: "playing" }, isBot: false, ready: false, look: plainTankLook(1) },
      { id: "p2", name: "Budi", status: phase.kind === "finished" ? { kind: "winner" } : { kind: "playing" }, isBot: false, ready: false, look: plainTankLook(2) },
    ],
    phase,
    rounds: [],
    game: 1,
    auto: null,
    nextGameInMs: null,
    chat: isPublicKind(kind) ? null : "on",
  };
  const joined = playerView("open", arena, { playerId: "p1", playerToken: "t" }, null);
  if (!("me" in joined)) throw new Error(`no seat in ${joined.kind}`);
  return joined;
}

describe("roomTourOf (what Show me around replays)", () => {
  test("the lobby tour in any lobby", () => {
    expect(roomTourOf(view({ kind: "lobby", nextRuleSetId: "standard", start: { kind: "waiting" } }, "private"))).toBe("lobby");
    expect(roomTourOf(view({ kind: "lobby", nextRuleSetId: "standard", start: { kind: "waiting" } }, "practice"))).toBe("lobby");
  });

  test("the round tour while the player's tank plays a round", () => {
    const running: ArenaPhase = { kind: "running", round: 1, isFinal: true, seed: 1, ruleSetId: "standard", playerIds: ["p1", "p2"], survivorsAfterRound: null };
    expect(roomTourOf(view(running, "private"))).toBe("round");
    expect(roomTourOf(view(running, "practice"))).toBe("round");
  });

  test("the result tour only after a game without a result clock", () => {
    const done: ArenaPhase = { kind: "finished", winnerId: "p2", resultId: null };
    expect(roomTourOf(view(done, "private"))).toBe("result");
    expect(roomTourOf(view(done, "practice"))).toBeNull();
  });
});
