/// <reference types="bun" />
import { describe, expect, test } from "bun:test";
import type { ArenaPhase, PublicArena } from "@game/arena";
import { CATALOGS } from "../i18n/catalog.ts";
import { TEST_SETTINGS } from "../stream/fixtures.ts";
import { statusOf } from "./HostPage.tsx";

function arena(phase: ArenaPhase): PublicArena {
  return { id: "a", settings: { ...TEST_SETTINGS, kind: "presenter" }, players: [], phase, rounds: [], game: 1, auto: null, nextGameInMs: null, chat: "on" };
}
const running = (round: number, isFinal: boolean): ArenaPhase => ({ kind: "running", round, isFinal, seed: 1, ruleSetId: "standard", playerIds: [], survivorsAfterRound: null });

describe("the presenter's status line", () => {
  test("a game of one round is the game, and only a later last round is the final", () => {
    for (const m of [CATALOGS.en, CATALOGS.id]) {
      expect(statusOf(arena(running(1, true)), m)).toBe(m.room.status.liveGame);
      expect(statusOf(arena(running(3, true)), m)).toBe(m.room.status.liveFinal);
      expect(statusOf(arena(running(2, false)), m)).toBe(m.room.status.live(2));
    }
  });
});
