/// <reference types="bun" />
import { describe, expect, test } from "bun:test";
import { CATALOGS } from "../i18n/catalog.ts";
import { liveTitle } from "../room/roomStatus.ts";
import { roundHeading, roundKind } from "./roundHeading.ts";

describe("roundKind", () => {
  test("one round alone is the game, a later last round is the final, and the room's title follows it", () => {
    expect(roundKind({ round: 1, isFinal: true })).toBe("game");
    expect(roundKind({ round: 3, isFinal: true })).toBe("final");
    expect(roundKind({ round: 2, isFinal: false })).toBe("round");
    const s = CATALOGS.en.room.status;
    expect(liveTitle({ round: 1, isFinal: true }, s)).toBe(s.liveGame);
    expect(liveTitle({ round: 3, isFinal: true }, s)).toBe(s.liveFinal);
  });
});

describe("roundHeading", () => {
  test("a game of one round is headed as the game, and only a later last round is the final", () => {
    for (const m of [CATALOGS.en, CATALOGS.id]) {
      expect(roundHeading({ round: 1, isFinal: true, ruleSetId: "standard" }, false, m)).toBe(m.live.headingGame);
      expect(roundHeading({ round: 1, isFinal: false, ruleSetId: "standard" }, false, m)).toBe(m.live.heading(1, false));
      expect(roundHeading({ round: 3, isFinal: true, ruleSetId: "standard" }, false, m)).toBe(m.live.heading(3, true));
      expect(roundHeading({ round: 3, isFinal: true, ruleSetId: "standard" }, true, m)).toBe(m.live.headingWithRules(m.live.heading(3, true), m.vocabulary.roundRules.standard.name));
    }
  });
});
