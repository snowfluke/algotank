/// <reference types="bun" />
import { describe, expect, test } from "bun:test";
import { BUILD_BUDGET, parseStrategy, PRESETS, ruleSet } from "@game/engine";
import type { StrategyIssue } from "@game/engine";
import { addRule } from "../editor/edit.ts";
import { issuePlace } from "./issues.ts";
import { en, id, issueSentence } from "./messages.ts";
import { currentPlayStyle, movingStyle, PLAY_STYLES, traitsOf } from "./playStyles.ts";
import { neighbourLinks } from "./modes.ts";
import { stripFit } from "./RulesList.tsx";
import { benchLayout } from "./UpgradesPane.tsx";
import { emptyBuild } from "../editor/build.ts";
import { en as vocabularyEn, id as vocabularyId } from "../vocabulary/messages.ts";
import { saveView } from "./saveView.ts";
import { en as errorsEn, id as errorsId } from "../api/messages.ts";
import type { ApiFailure } from "../api/client.ts";
import { errorSentence } from "../api/errorSentences.ts";
import { saveFailureOf } from "../player/useStrategy.ts";
import { freePoints, rulesForUpgrades, socketsOf, tapMinus, tapPlus, tapSocket, upgradeNumbers, upgradeSentence } from "./upgrades.ts";

describe("play styles", () => {
  test("there are 8, and the traits of an own play style come from its rules", () => {
    expect(PLAY_STYLES).toHaveLength(8);
    const chaser = PLAY_STYLES.find((style) => style.id === "leader-chaser")!;
    expect(traitsOf(chaser.strategy)).toContain("huntsRicher");
    expect(traitsOf({ build: {}, modes: [] })).toEqual([]);
  });

  test("a preset is recognised, and a hand edit is not", () => {
    const picker = PRESETS.find((preset) => preset.id === "picker")!.strategy;
    expect(currentPlayStyle(picker)).toBe("picker");
    expect(currentPlayStyle(addRule(picker, picker.modes[0]!.id))).toBeNull();
  });

  test("one scene moves: the one under the pointer, else the focused one, else the chosen one", () => {
    expect(movingStyle("charger", "evader", "picker")).toBe("charger");
    expect(movingStyle(null, "evader", "picker")).toBe("evader");
    expect(movingStyle(null, null, "picker")).toBe("picker");
    expect(movingStyle(null, null, null)).toBeNull();
  });

  test("each sentence has at most 9 words, in both languages", () => {
    for (const text of [vocabularyEn, vocabularyId]) {
      for (const [styleId, style] of Object.entries(text.playStyles)) {
        expect(style.summary.split(" ").length, styleId).toBeLessThanOrEqual(9);
      }
    }
  });
});

describe("the upgrade bench", () => {
  const full = { reach: 0, aim: 3, dodge: 3 };

  test("Range has 2 sockets of 2 points, Aim and Dodge 3 of 1, and the sockets hold the whole budget twice over at most", () => {
    expect(socketsOf("reach")).toEqual([{ level: 1, tokens: 2 }, { level: 2, tokens: 2 }]);
    expect(socketsOf("aim")).toEqual([{ level: 1, tokens: 1 }, { level: 2, tokens: 1 }, { level: 3, tokens: 1 }]);
    expect(BUILD_BUDGET).toBe(6);
  });

  test("a built-in style opens with no free point", () => {
    expect(freePoints(full)).toBe(0);
    expect(freePoints({ reach: 0, aim: 1, dodge: 3 })).toBe(2);
    // An over-budget draft shows an empty tray; its problem says what to fix.
    expect(freePoints({ reach: 2, aim: 3, dodge: 3 })).toBe(0);
  });

  test("an empty socket fills up to its level when the points allow, and says what it needs when they do not", () => {
    expect(tapSocket({ reach: 0, aim: 1, dodge: 3 }, "aim", 3)).toEqual({ kind: "set", level: 3 });
    expect(tapSocket(full, "reach", 1)).toEqual({ kind: "blocked", need: 2, have: 0 });
    expect(tapSocket({ reach: 0, aim: 2, dodge: 3 }, "reach", 1)).toEqual({ kind: "blocked", need: 2, have: 1 });
    expect(tapSocket({ reach: 0, aim: 0, dodge: 0 }, "reach", 2)).toEqual({ kind: "set", level: 2 });
  });

  test("a filled socket empties itself and every socket after it", () => {
    expect(tapSocket(full, "aim", 3)).toEqual({ kind: "set", level: 2 });
    expect(tapSocket(full, "aim", 1)).toEqual({ kind: "set", level: 0 });
  });

  test("plus and minus: blocked when the points run out, nothing at the ends", () => {
    expect(tapPlus(full, "aim")).toEqual({ kind: "none" });
    expect(tapPlus(full, "reach")).toEqual({ kind: "blocked", need: 2, have: 0 });
    expect(tapPlus({ reach: 0, aim: 1, dodge: 3 }, "reach")).toEqual({ kind: "set", level: 1 });
    expect(tapMinus(full, "reach")).toEqual({ kind: "none" });
    expect(tapMinus(full, "dodge")).toEqual({ kind: "set", level: 2 });
  });

  test("Take all out frees every point", () => {
    const strategy = PRESETS[0]!.strategy;
    const empty = emptyBuild(strategy);
    expect(freePoints(empty.build)).toBe(BUILD_BUDGET);
    expect(empty.modes).toBe(strategy.modes);
  });

  test("the numbers come from the next round's rules, and none when they are secret", () => {
    const build = { reach: 1, aim: 2, dodge: 0 };
    const known = upgradeNumbers(rulesForUpgrades({ kind: "known", ruleSetId: "sharp-eyes", rules: ruleSet("sharp-eyes") }), build);
    expect(known).toEqual({ range: 4, fromDistance: 1, perLevel: 12 });
    expect(upgradeNumbers(rulesForUpgrades({ kind: "hidden" }), build)).toBeNull();
    expect(upgradeNumbers(rulesForUpgrades({ kind: "none" }), build)?.range).toBe(4);
    expect(upgradeNumbers(ruleSet("arms-length"), { reach: 0, aim: 3, dodge: 3 })?.range).toBe(1);
  });

  test("each card's sentence says what the upgrade does now", () => {
    const numbers = { range: 4, fromDistance: 2, perLevel: 6 };
    const e = en.upgrades.effects;
    expect(upgradeSentence(e, "reach", 1, numbers)).toBe("Your shot reaches 4 squares.");
    expect(upgradeSentence(e, "reach", 0, { ...numbers, range: 3 })).toBe("Range is still empty, so your shot reaches 3 squares.");
    expect(upgradeSentence(e, "aim", 2, numbers)).toBe("Your shots hit 12% more often.");
    expect(upgradeSentence(e, "dodge", 1, numbers)).toBe("Shots at you hit 6% less often.");
    expect(upgradeSentence(e, "dodge", 0, numbers)).toBe(e.dodgeEmpty);
    expect(upgradeSentence(e, "reach", 2, null)).toBe("Your shot reaches 2 squares farther than usual.");
    expect(upgradeSentence(id.upgrades.effects, "aim", 3, null)).toBe("Tembakanmu lebih sering kena.");
    for (const attribute of ["reach", "aim", "dodge"] as const) {
      for (const level of [0, 1, 2, 3]) {
        for (const text of [en, id]) expect(upgradeSentence(text.upgrades.effects, attribute, level, numbers).split(" ").length).toBeLessThanOrEqual(12);
      }
    }
  });

  test("the tray says how many points lie free, and one sentence when all are placed", () => {
    expect(en.upgrades.free(2)).toBe("You have 2 points to place.");
    expect(en.upgrades.allPlaced(6)).toBe("All 6 points are placed, so take one out to move it.");
    expect(en.upgrades.blocked(2, 1)).toBe("You need 2 points and have 1, so take a point out of another upgrade first.");
  });
});

describe("modes", () => {
  test("the arrows between neighbouring chips follow the rules that switch modes", () => {
    const ambusher = PRESETS.find((preset) => preset.id === "ambusher")!.strategy;
    expect(neighbourLinks(ambusher)).toEqual(["both"]);
    const evader = PRESETS.find((preset) => preset.id === "evader")!.strategy;
    expect(neighbourLinks(evader)).toEqual([]);
    const oneWay = { ...ambusher, modes: ambusher.modes.map((mode, i) => (i === 1 ? { ...mode, rules: mode.rules.map((rule) => ({ ...rule, switchToMode: null })) } : mode)) };
    expect(neighbourLinks(oneWay)).toEqual(["forward"]);
  });
});

describe("issues", () => {
  test("each issue has a place and a sentence in both languages", () => {
    const result = parseStrategy({
      modes: [{ id: "m", name: "", rules: [{ id: "r", match: "all", conditions: [], action: { action: "throw", params: {} }, chance: 0, switchToMode: null }], fallback: { action: "fly", params: {} } }],
      build: { reach: 2, aim: 3, dodge: 3 },
    });
    if (result.ok) throw new Error("expected problems");
    const places = result.issues.map((issue: StrategyIssue) => issuePlace(issue).kind);
    expect(places).toEqual(["mode", "rule", "rule", "fallback", "upgrades"]);
    for (const issue of result.issues) {
      for (const text of [en, id]) {
        const sentence = issueSentence(text, issue);
        expect(sentence).toMatch(/\.$/);
        expect(sentence).not.toMatch(/modes|params|undefined/);
      }
    }
  });
});

describe("save line", () => {
  const base = { save: { kind: "idle" } as const, dirty: false, pending: false, valid: true };

  test("saved, waiting and saving", () => {
    expect(saveView(base, en, errorsEn).kind).toBe("saved");
    expect(saveView({ ...base, dirty: true, pending: true }, en, errorsEn).kind).toBe("saving");
    expect(saveView({ ...base, save: { kind: "saving" } }, en, errorsEn).kind).toBe("saving");
  });

  test("an invalid draft says to fix it and offers no Retry", () => {
    expect(saveView({ ...base, dirty: true, valid: false }, en, errorsEn)).toEqual({
      kind: "notSaved",
      problem: "invalid",
      reason: en.save.invalid,
      canRetry: false,
    });
  });

  test("a round in progress and a lost connection are said in words, with Retry", () => {
    const round = saveView({ ...base, dirty: true, save: { kind: "failed", reason: "roundRunning", describe: () => ({ sentence: "x", details: [] }) } }, id, errorsId);
    expect(round).toMatchObject({ kind: "notSaved", reason: id.save.roundRunning, canRetry: true });
    const offline = saveView({ ...base, dirty: true, save: { kind: "failed", reason: "offline", describe: () => ({ sentence: "x", details: [] }) } }, en, errorsEn);
    expect(offline).toMatchObject({ reason: en.save.offline, canRetry: true });
  });

  test("any other failure is worded in the language shown now, so a language switch changes it", () => {
    const apiFailure: ApiFailure = { ok: false, status: 500, error: { error: "x" }, code: null };
    const handle = { ...base, dirty: true, save: { kind: "failed" as const, ...saveFailureOf(apiFailure, "saveStrategy") } };
    const english = saveView(handle, en, errorsEn);
    const indonesian = saveView(handle, id, errorsId);
    expect(english).toMatchObject({ reason: errorSentence(apiFailure, "saveStrategy", errorsEn) });
    expect(indonesian).toMatchObject({ reason: errorSentence(apiFailure, "saveStrategy", errorsId) });
    expect(english).not.toEqual(indonesian);
  });
});

describe("layouts that follow the pane", () => {
  test("the bench: three columns on a wide pane, rows below that, the drawing on top on a phone, and no drawing last", () => {
    expect(benchLayout(960, 0)).toBe("columns");
    expect(benchLayout(776, 0)).toBe("rows");
    expect(benchLayout(358, 0)).toBe("stacked");
    expect(benchLayout(358, 4)).toBe("rows");
    expect(benchLayout(960, 5)).toBe("plain");
  });

  test("the mode strip: beside the label when it fits, else on its own line, and +N only for many modes that do not fit", () => {
    expect(stripFit({ strip: 900, beside: 700, withArrows: 260, withoutArrows: 230 }, 2)).toBe("inlineArrows");
    // A 390 px phone with Rest and Strike: not beside the label, but on its own line with the arrow.
    expect(stripFit({ strip: 358, beside: 160, withArrows: 260, withoutArrows: 230 }, 2)).toBe("belowArrows");
    expect(stripFit({ strip: 200, beside: 100, withArrows: 260, withoutArrows: 230 }, 2)).toBe("below");
    expect(stripFit({ strip: 358, beside: 160, withArrows: 2000, withoutArrows: 1800 }, 6)).toBe("chosen");
  });
});

