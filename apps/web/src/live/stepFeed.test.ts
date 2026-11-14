/// <reference types="bun" />
// The live "My tank" feed on a turn of a rule's steps in order (76-email-and-sequences.md, S3):
// it names the step and the rule in both languages, gives the reason only on step 1 (the
// later steps read no rule), and names the mode switch after the last step.

import { describe, expect, test } from "bun:test";
import type { Decision, StrategyInput } from "@game/engine";
import { describeDecision } from "../player/feed.ts";
import { en as vocabularyEn, id as vocabularyId } from "../vocabulary/messages.ts";
import { en as liveEn, id as liveId } from "./messages.ts";

const strategy: StrategyInput = {
  build: {},
  modes: [
    {
      id: "m1",
      name: "Chase",
      rules: [
        { id: "r1", match: "all", conditions: [{ condition: "enemyInRange", negate: false, params: {} }], chance: 100, switchToMode: null, action: { action: "throw", params: {} } },
        {
          id: "r2",
          match: "all",
          conditions: [{ condition: "hitWithin", negate: false, params: { n: 1 } }],
          chance: 100,
          switchToMode: "m2",
          action: { steps: [{ action: "stepForward", params: {} }, { action: "turn", params: { way: "left" } }, { action: "wait", params: {} }] },
        },
      ],
      fallback: { action: "throw", params: {} },
    },
    { id: "m2", name: "Flee", rules: [], fallback: { action: "throw", params: {} } },
  ],
};

const turn = (index: number, actionId: string, move: Decision["move"], nextModeId = "m1"): Decision => ({
  botId: "p",
  modeId: "m1",
  ruleId: "r2",
  actionId,
  move,
  nextModeId,
  step: { index, count: 3 },
});

const line = (d: Decision, lang: "en" | "id") =>
  describeDecision({ tick: 4, decision: d, throwEvent: null }, strategy, lang === "en" ? vocabularyEn : vocabularyId, lang === "en" ? liveEn.feed : liveId.feed).text;

describe("the feed on a turn of steps in order", () => {
  test("step 1 gives the reason, then names the step and the rule", () => {
    expect(line(turn(1, "stepForward", "F"), "en")).toBe(
      "Moved one square forward, or waited when that square was taken, because I was hit in the last 1 turn. This was step 1 of 3 of rule 2.",
    );
    expect(line(turn(1, "stepForward", "F"), "id")).toMatch(/^Maju satu petak, .+, karena .+\. Ini langkah 1 dari 3 di aturan 2\.$/);
  });

  test("a later step names what the tank did and the step, without a reason", () => {
    expect(line(turn(2, "turn", "L"), "en")).toBe("Turned left. This was step 2 of 3 of rule 2.");
    expect(line(turn(2, "turn", "L"), "id")).toBe("Berbelok kiri. Ini langkah 2 dari 3 di aturan 2.");
  });

  test("the last step names the mode switch after it", () => {
    expect(line(turn(3, "wait", "W", "m2"), "en")).toBe("Waited. This was step 3 of 3 of rule 2. Then I switched to the “Flee” mode.");
    expect(line(turn(3, "wait", "W", "m2"), "id")).toBe("Menunggu. Ini langkah 3 dari 3 di aturan 2. Lalu aku pindah ke mode “Flee”.");
  });
});
