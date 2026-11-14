/// <reference types="bun" />
import { describe, expect, test } from "bun:test";
import type { ArenaPhase } from "@game/arena";
import { ruleSet } from "@game/engine";
import { CATALOGS } from "../i18n/catalog.ts";
import { arenaIn } from "../stream/fixtures.ts";
import { defaultRuleSetId, nextRulesOf, nextRulesSentence } from "./nextRules.ts";

const { en, id } = CATALOGS;
const lobby = (nextRuleSetId: "standard" | "dry-spell" | null): ArenaPhase => ({ kind: "lobby", nextRuleSetId, start: { kind: "waiting" } });
const pause = (nextRuleSetId: "standard" | "dry-spell" | null): ArenaPhase => ({ kind: "break", nextRound: 2, nextRuleSetId, start: { kind: "waiting" } });
const running: ArenaPhase = {
  kind: "running",
  round: 1,
  isFinal: false,
  seed: 1,
  ruleSetId: "dry-spell",
  playerIds: [],
  survivorsAfterRound: 8,
};

describe("nextRulesOf", () => {
  test("standard mode says nothing, even though the phase carries the standard id", () => {
    expect(nextRulesOf(arenaIn(lobby("standard"), "standard")).kind).toBe("none");
    expect(nextRulesOf(arenaIn(pause("standard"), "standard")).kind).toBe("none");
  });

  test("announced mode knows the set in the lobby and in the break", () => {
    for (const phase of [lobby("dry-spell"), pause("dry-spell")]) {
      const next = nextRulesOf(arenaIn(phase, "announced"));
      expect(next.kind === "known" && next.ruleSetId).toBe("dry-spell");
      expect(next.kind === "known" && next.rules).toBe(ruleSet("dry-spell"));
    }
  });

  test("announced mode can announce the standard set", () => {
    expect(nextRulesOf(arenaIn(lobby("standard"), "announced")).kind).toBe("known");
  });

  test("surprise mode hides the set in the lobby and in the break", () => {
    expect(nextRulesOf(arenaIn(lobby(null), "surprise")).kind).toBe("hidden");
    expect(nextRulesOf(arenaIn(pause(null), "surprise")).kind).toBe("hidden");
  });

  test("a running round and a finished event have no next rules", () => {
    expect(nextRulesOf(arenaIn(running, "announced")).kind).toBe("none");
    expect(nextRulesOf(arenaIn({ kind: "finished", winnerId: "p", resultId: null }, "surprise")).kind).toBe("none");
  });
});

describe("nextRulesSentence", () => {
  test("a known set gives its name and its summary sentence", () => {
    const sentence = nextRulesSentence(nextRulesOf(arenaIn(lobby("dry-spell"), "announced")));
    expect(sentence).toBe(`The next round uses the Dry spell rules. ${en.vocabulary.roundRules["dry-spell"].summary}`);
    expect(nextRulesSentence(nextRulesOf(arenaIn(lobby("dry-spell"), "announced")), id)).toContain("Musim kering");
  });

  test("surprise mode says when the rules appear and names no set", () => {
    expect(nextRulesSentence({ kind: "hidden" })).toBe(en.prep.nextRules.hidden);
  });

  test("standard mode gives no sentence", () => {
    expect(nextRulesSentence({ kind: "none" })).toBeNull();
  });
});

describe("defaultRuleSetId", () => {
  test("practice starts with the announced set, otherwise the standard set", () => {
    expect(defaultRuleSetId(nextRulesOf(arenaIn(lobby("dry-spell"), "announced")))).toBe("dry-spell");
    expect(defaultRuleSetId({ kind: "hidden" })).toBe("standard");
    expect(defaultRuleSetId({ kind: "none" })).toBe("standard");
  });
});
