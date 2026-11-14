import { describe, expect, test } from "bun:test";
import { createArena, type Arena, type ArenaSettings } from "@game/arena";
import { RULE_SET_IDS, STANDARD_RULE_SET_ID } from "@game/engine";
import { announcementFor, drawRuleSetId, ruleSetToStart } from "./rule-set-draw.ts";

const SETTINGS: ArenaSettings = { name: "Draw", kind: "private", ticksPerRound: 20, tickMs: 100, ruleSetMode: "announced", botFill: false, joinPolicy: "anyone", tankCount: 8 };

describe("drawRuleSetId", () => {
  test("never repeats the previous id, and over many draws reaches every other id", () => {
    for (const previous of RULE_SET_IDS) {
      const seen = new Set<string>();
      for (let i = 0; i < 400; i++) {
        const drawn = drawRuleSetId(previous);
        expect(drawn).not.toBe(previous);
        seen.add(drawn);
      }
      // 400 draws among 5 ids miss one with a chance below 5 * 0.8^400, which is zero in practice.
      expect([...seen].sort()).toEqual(RULE_SET_IDS.filter((id) => id !== previous).sort());
    }
  });

  test("without a previous id it can draw any id, the standard one included", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 400; i++) seen.add(drawRuleSetId(null));
    expect([...seen].sort()).toEqual([...RULE_SET_IDS].sort());
  });
});

describe("announcementFor", () => {
  test("standard always names the standard set, announced draws, surprise names nothing", () => {
    expect(announcementFor("standard", "downpour")).toBe(STANDARD_RULE_SET_ID);
    expect(announcementFor("surprise", "downpour")).toBeNull();
    for (let i = 0; i < 50; i++) expect(announcementFor("announced", "downpour")).not.toBe("downpour");
  });
});

describe("ruleSetToStart", () => {
  const arenaIn = (mode: ArenaSettings["ruleSetMode"], next: ReturnType<typeof announcementFor>): Arena =>
    createArena("ABC234", { ...SETTINGS, ruleSetMode: mode }, next);

  test("starts under the announced id", () => {
    expect(ruleSetToStart(arenaIn("announced", "dry-spell"))).toBe("dry-spell");
    expect(ruleSetToStart(arenaIn("standard", "standard"))).toBe("standard");
  });

  test("draws at the start in surprise mode from every rule set, the last round's included", () => {
    const lobby = arenaIn("surprise", null);
    const afterRound: Arena = {
      ...lobby,
      phase: { kind: "break", nextRound: 2, nextRuleSetId: null, start: { kind: "waiting" } },
      rounds: [{ round: 1, isFinal: false, seed: 1, ruleSetId: "sharp-eyes", standings: [], survivors: [] }],
    };
    for (const arena of [lobby, afterRound]) {
      const seen = new Set<string>();
      // 400 draws among 6 ids miss one with a chance below 6 * (5/6)^400, which is zero in practice.
      for (let i = 0; i < 400; i++) seen.add(ruleSetToStart(arena));
      expect([...seen].sort()).toEqual([...RULE_SET_IDS].sort());
    }
  });
});
