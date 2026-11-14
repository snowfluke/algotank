/// <reference types="bun" />
import { plainTankLook, isPublicKind } from "@game/arena";
import { describe, expect, test } from "bun:test";
import type { ArenaKind, ArenaPhase, PlayerStatus, PublicArena } from "@game/arena";
import { playerView } from "../player/playerView.ts";
import { TEST_SETTINGS } from "../stream/fixtures.ts";
import { en, id } from "./messages.ts";
import { roomStatus } from "./roomStatus.ts";

const session = { playerId: "p1", playerToken: "t" };
function arena(phase: ArenaPhase, status: PlayerStatus = { kind: "playing" }, kind: ArenaKind = "private"): PublicArena {
  return {
    id: "a",
    settings: { ...TEST_SETTINGS, kind },
    players: [
      { id: "p1", name: "Ana", status, isBot: false, ready: false, look: plainTankLook(1) },
      { id: "p2", name: "Budi", status: { kind: "playing" }, isBot: false, ready: false, look: plainTankLook(2) },
    ],
    phase,
    rounds: [],
    game: 1,
    auto: null,
    nextGameInMs: null,
    chat: isPublicKind(kind) ? null : "on",
  };
}
const lobby: ArenaPhase = { kind: "lobby", nextRuleSetId: "standard", start: { kind: "waiting" } };
const player = { isOwner: false, autoSeconds: null };

describe("roomStatus", () => {
  test("the lobby tells the owner to start, a player to wait, and a public player the countdown", () => {
    const view = playerView("open", arena(lobby), session, null);
    expect(roomStatus(view, { isOwner: true, autoSeconds: null }, en)?.body).toBe(en.status.lobbyOwner);
    expect(roomStatus(view, player, en)?.body).toBe(en.status.lobbyWait);
    const publicView = playerView("open", arena(lobby, undefined, "practice"), session, null);
    expect(roomStatus(publicView, { isOwner: false, autoSeconds: 12 }, en)?.body).toBe("The game starts in 12 seconds.");
    expect(roomStatus(publicView, { isOwner: false, autoSeconds: 12 }, id)?.body).toBe("Permainan mulai dalam 12 detik.");
    // A public lobby has the clock beside the sentence, so its sentence is the short one.
    expect(roomStatus(publicView, player, en)?.title).toBe(en.status.lobbyPublic);
    expect(roomStatus(view, { isOwner: true, autoSeconds: null }, en)?.title).toBe(en.status.lobby);
    // A private guest's title says who starts, because a phone may show the title alone.
    expect(roomStatus(view, player, en)?.title).toBe(en.status.lobbyGuest);
  });

  test("a closed arena and one that never existed say different things", () => {
    expect(roomStatus(playerView("closed", arena(lobby), session, null), player, en)?.title).toBe(en.status.closed);
    expect(roomStatus(playerView("closed", null, session, null), player, en)?.title).toBe(en.status.notFound);
  });

  test("a game of one round says the game is running, and only a later last round is the final", () => {
    const one: ArenaPhase = { kind: "running", round: 1, isFinal: true, seed: 1, ruleSetId: "standard", playerIds: ["p1", "p2"], survivorsAfterRound: null };
    expect(roomStatus(playerView("open", arena(one, undefined, "practice"), session, null), player, en)?.title).toBe("The game is running.");
    expect(roomStatus(playerView("open", arena(one, undefined, "practice"), session, null), player, id)?.title).toBe("Permainan sedang berjalan.");
    const final: ArenaPhase = { ...one, round: 3 };
    expect(roomStatus(playerView("open", arena(final), session, null), player, en)?.title).toBe("The final is running.");
    const first: ArenaPhase = { ...one, isFinal: false };
    expect(roomStatus(playerView("open", arena(first), session, null), player, en)?.title).toBe("Round 1 is running.");
  });

  test("a waiting player hears they play from the next game", () => {
    const running: ArenaPhase = { kind: "running", round: 1, isFinal: true, seed: 1, ruleSetId: "standard", playerIds: ["p2"], survivorsAfterRound: null };
    expect(roomStatus(playerView("open", arena(running, { kind: "waiting" }, "practice"), session, null), player, en)?.title).toBe(en.status.waiting);
  });

  test("the finished game names the winner, or cheers the player who won", () => {
    const done: ArenaPhase = { kind: "finished", winnerId: "p2", resultId: null };
    expect(roomStatus(playerView("open", arena(done), session, null), { isOwner: true, autoSeconds: null }, en)?.title).toBe("Budi won the game.");
    // A private guest reads what comes next first; the winner moves to the body.
    expect(roomStatus(playerView("open", arena(done), session, null), player, en)).toMatchObject({ title: en.status.finishedWait, body: "Budi won the game." });
    const won = roomStatus(playerView("open", arena({ kind: "finished", winnerId: "p1", resultId: null }, { kind: "winner" }, "practice"), session, null), player, en);
    expect(won).toMatchObject({ tone: "success", title: en.status.winnerYou });
  });
});
