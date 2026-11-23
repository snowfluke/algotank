/// <reference types="bun" />
import { describe, expect, test } from "bun:test";
import { PRESETS, isSequence } from "@game/engine";
import type { Decision, StrategyInput, ThrowEvent } from "@game/engine";
import { en as liveEn, id as liveId } from "../live/messages.ts";
import { en as vocabularyEn, id as vocabularyId } from "../vocabulary/messages.ts";
import { describeDecision } from "./feed.ts";

const strategy: StrategyInput = {
  ultimate: "dash",
  build: {},
  modes: [
    {
      id: "m1",
      name: "Chase",
      rules: [
        { id: "r1", match: "all", conditions: [], chance: 100, switchToMode: null, action: { action: "stepForward", params: {} } },
        {
          id: "r2",
          match: "all",
          conditions: [{ condition: "enemyInRange", negate: false, params: {} }],
          chance: 100,
          switchToMode: "m2",
          action: { action: "throw", params: {} },
        },
      ],
      fallback: { action: "moveAway", params: { target: "nearest" } },
    },
    { id: "m2", name: "Flee", rules: [], fallback: { action: "throw", params: {} } },
  ],
};

const decision = (over: Partial<Omit<Decision, "ultimate">>): Decision => ({
  botId: "p",
  modeId: "m1",
  ruleId: "r2",
  actionId: "throw",
  move: "T",
  nextModeId: "m1",
  ...over,
});

const say = (d: Decision, throwEvent: ThrowEvent | null = null, tick = 11) =>
  describeDecision({ tick, decision: d, throwEvent }, strategy, vocabularyEn, liveEn.feed);

describe("describeDecision", () => {
  test("a fire is a single line in the tank's voice, named in its language", () => {
    const fired: Decision = { ...decision({ actionId: "ultimate", ruleId: null }), move: "W", ultimate: "mudBomb" };
    const entry = { tick: 7, decision: fired, throwEvent: null };
    expect(describeDecision(entry, strategy, vocabularyEn, liveEn.feed)).toEqual({ turn: 8, text: "I used Mud bomb." });
    expect(describeDecision(entry, strategy, vocabularyId, liveId.feed)).toEqual({ turn: 8, text: "Aku memakai jurus Bom lumpur." });
  });

  test("a fallback says no rule fits, with the action's words and the 1-based turn", () => {
    const line = say(decision({ ruleId: null, actionId: "moveAway", move: "F" }));
    expect(line.turn).toBe(12);
    expect(line.text).toBe("Moved away from the nearest tank, because no rule fit.");
  });

  test("a rule gives its conditions as the reason", () => {
    expect(say(decision({})).text).toBe("Shot, because a tank is in my line of fire and within my range.");
  });

  test("a rule without conditions always fits", () => {
    expect(say(decision({ ruleId: "r1", actionId: "stepForward" })).text).toBe(
      "Moved one square forward, or waited when that square was taken, because this rule always fits.",
    );
  });

  test("the shot's outcome follows, and a dry shot says the water was too low", () => {
    const hit: ThrowEvent = { throwerId: "p", outcome: "hit", targetId: "q", distance: 1, hitChance: 90 };
    const dry: ThrowEvent = { throwerId: "p", outcome: "dry", targetId: "q", distance: 1 };
    expect(say(decision({}), hit).text).toEndWith("My shot hit.");
    expect(say(decision({}), dry).text).toEndWith("My water was too low, so nothing came out.");
  });

  test("the shooter sees that smoke deflected the shot in both languages", () => {
    const throwEvent: ThrowEvent = {
      throwerId: "p", outcome: "deflected", targetId: "q", distance: 1, hitChance: 22,
      deflectedTo: "r", deflectedTurn: 2, deflection: "hit",
    };
    expect(say(decision({}), throwEvent).text).toEndWith("Smoke deflected my shot.");
    expect(describeDecision({ tick: 0, decision: decision({}), throwEvent }, strategy, vocabularyId, liveId.feed).text)
      .toEndWith("Kabut membelokkan tembakanku.");
  });

  test("an item's part in the turn is said: a blocked shot, a bucket hit, and a dizzy tank's bottom-up reading", () => {
    const blocked: ThrowEvent = { throwerId: "p", outcome: "blocked", targetId: "q", distance: 1, hitChance: 90 };
    const bucket: ThrowEvent = { throwerId: "p", outcome: "hit", targetId: "q", distance: 1, hitChance: 90, bucket: true };
    expect(say(decision({}), blocked).text).toEndWith("An umbrella stopped my shot.");
    expect(say(decision({}), bucket).text).toEndWith("My bucket shot hit, worth 2 points.");
    // "Go to an item" at a tank on the next square shoots instead, like every step toward a tank.
    expect(say(decision({ ruleId: null, actionId: "goToItem", move: "T" })).text).toContain("My way was blocked, so I shot instead.");
    expect(say(decision({ ruleId: null, actionId: "goToItem", move: "W" })).text).toContain("I could not do it, so I waited.");
    expect(say(decision({ dizzy: true })).text).toBe("Shot, because a tank is in my line of fire and within my range. I was dizzy, so I checked my rules from the bottom up.");
    // A pinwheel's spin ran no rule and no fallback, so the feed names the spin and nothing else.
    expect(say(decision({ ruleId: null, actionId: "turn", move: "R", dizzy: true, spin: true })).text).toBe("A pinwheel spun me round, so I checked no rule this turn.");
  });

  test("a mode switch is part of the text", () => {
    expect(say(decision({ nextModeId: "m2" })).text).toEndWith("Then I switched to the “Flee” mode.");
  });

  test("a step that turned into a shot says so in plain words", () => {
    const stuck = decision({ ruleId: null, actionId: "moveAway", move: "T" });
    expect(say(stuck).text).toBe("Tried to move away from the nearest tank, because no rule fit. My way was blocked, so I shot instead.");
    const idLine = describeDecision({ tick: 0, decision: stuck, throwEvent: null }, strategy, vocabularyId, liveId.feed);
    expect(idLine.text).toBe("Mencoba menjauhi tank terdekat, karena tidak ada aturan yang cocok. Jalanku terhalang, jadi aku menembak.");
    // A shot is what "shoot" does, so it is not a blocked step.
    expect(say(decision({ move: "T" })).text).not.toContain("could not move");
  });

  test("a whole line stays in the tank's own voice, in both languages", () => {
    // A blocked step with a shot, an outcome and a mode switch uses every follow-on sentence.
    const chase: StrategyInput = {
      ultimate: "dash",
      build: {},
      modes: [
        {
          id: "m1",
          name: "Chase",
          rules: [
            {
              id: "r1",
              match: "all",
              conditions: [{ condition: "enemyInRange", negate: false, params: {} }],
              chance: 100,
              switchToMode: "m2",
              action: { action: "moveAway", params: { target: "nearestWithLessWater" } },
            },
          ],
          fallback: { action: "throw", params: {} },
        },
        { id: "m2", name: "Flee", rules: [], fallback: { action: "throw", params: {} } },
      ],
    };
    const full = decision({ ruleId: "r1", actionId: "moveAway", move: "T", nextModeId: "m2" });
    const shot: ThrowEvent = { throwerId: "p", outcome: "miss", targetId: "q", distance: 2, hitChance: 50 };
    const en = describeDecision({ tick: 0, decision: full, throwEvent: shot }, chase, vocabularyEn, liveEn.feed).text;
    const id = describeDecision({ tick: 0, decision: full, throwEvent: shot }, chase, vocabularyId, liveId.feed).text;
    expect(en).toBe(
      "Tried to move away from the nearest tank with less water than me, because a tank is in my line of fire and within my range. My way was blocked, so I shot instead. My shot missed. Then I switched to the “Flee” mode.",
    );
    expect(id).toBe(
      "Mencoba menjauhi tank terdekat yang airnya lebih sedikit dariku, karena ada tank di garis tembakku dalam jangkauanku. Jalanku terhalang, jadi aku menembak. Tembakanku meleset. Lalu aku pindah ke mode “Flee”.",
    );
  });

  test("Indonesian reads from the Indonesian catalogs", () => {
    const line = describeDecision({ tick: 0, decision: decision({ ruleId: null, actionId: "moveAway", move: "F" }), throwEvent: null }, strategy, vocabularyId, liveId.feed);
    expect(line.text).toBe("Menjauhi tank terdekat, karena tidak ada aturan yang cocok.");
  });

  test("no preset sentence shows a placeholder, an engine id or the unknown word", () => {
    for (const preset of PRESETS) {
      for (const mode of preset.strategy.modes) {
        for (const rule of [...mode.rules, null]) {
          const d = decision({ modeId: mode.id, ruleId: rule?.id ?? null, actionId: (rule === null || isSequence(rule.action) ? mode.fallback : rule.action).action, nextModeId: mode.id });
          const text = describeDecision({ tick: 0, decision: d, throwEvent: null }, preset.strategy, vocabularyEn, liveEn.feed).text;
          expect(text).not.toContain("{");
          expect(text).not.toContain(vocabularyEn.unknown);
        }
      }
    }
  });
});
