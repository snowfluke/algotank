/// <reference types="bun" />
import { describe, expect, test } from "bun:test";
import { ACTION_IDS, ACTIONS, CONDITION_IDS, CONDITIONS, PRESETS, RULE_SET_IDS, TARGET_SELECTORS, ULTIMATE_IDS } from "@game/engine";
import type { ActionRef, ConditionRef, ParamSpec, ParamValues, Rule } from "@game/engine";
import { ACTION_GROUPS, CONDITION_GROUPS, PLAY_STYLE_MODES } from "./ids.ts";
import { en, id, type VocabularyText } from "./messages.ts";
import { actionDoneAboutText, actionGroups, actionText, conditionGroups, conditionText, fallbackText, labelParts, modeName, ruleBriefText, ruleParts, ruleText } from "./sentence.ts";

describe("labelParts", () => {
  test("splits a text at its marks", () => {
    const parts = labelParts(en.conditions.nearestEnemyAtMost.text, CONDITIONS["nearestEnemyAtMost"]!.params);
    expect(parts.map((part) => part.kind)).toEqual(["text", "param", "text"]);
  });

  test("a parameter the text does not mention goes to the end", () => {
    const parts = labelParts("Plain text", [{ kind: "int", key: "n", label: "N", min: 1, max: 5, default: 1 }]);
    expect(parts.map((part) => part.kind)).toEqual(["text", "param"]);
  });
});

const LANGUAGES: readonly (readonly [string, VocabularyText])[] = [
  ["en", en],
  ["id", id],
];

/** Engine ids that cannot be mistaken for a word: they hold a capital or a hyphen. */
const ID_SHAPED = [
  ...Object.keys(CONDITIONS),
  ...Object.keys(ACTIONS),
  ...Object.keys(TARGET_SELECTORS),
  ...PRESETS.map((preset) => preset.id),
  ...RULE_SET_IDS,
].filter((engineId) => /[A-Z-]/.test(engineId));

function expectReadable(text: string, v: VocabularyText, where: string): void {
  expect(text, where).not.toMatch(/[{}[\]]/);
  expect(text, where).not.toContain("  ");
  expect(text, where).not.toContain(v.unknown);
  expect(text.trim(), where).toBe(text);
  for (const engineId of ID_SHAPED) expect(text, `${where} shows the id ${engineId}`).not.toMatch(new RegExp(`\\b${engineId}\\b`));
}

/** Values worth trying for one parameter: the limits, 1, the default, and every option. */
function sampleValues(spec: ParamSpec): readonly (number | string)[] {
  switch (spec.kind) {
    case "int":
      return spec.options ?? [...new Set([spec.min, spec.max, spec.default, ...(spec.min <= 1 && spec.max >= 1 ? [1] : [])])];
    case "choice":
      return spec.options.map((option) => option.value);
    case "target":
      return Object.keys(TARGET_SELECTORS);
  }
}

/** Every parameter takes each of its sample values once, with the others at their defaults. */
function sampleParams(specs: readonly ParamSpec[]): ParamValues[] {
  const defaults: ParamValues = Object.fromEntries(specs.map((spec) => [spec.key, spec.default]));
  return [defaults, ...specs.flatMap((spec) => sampleValues(spec).map((value) => ({ ...defaults, [spec.key]: value })))];
}

describe("the catalog ids match the engine tables", () => {
  test("groups and the modes of the play styles", () => {
    expect<readonly string[]>(Object.values(CONDITION_GROUPS).sort()).toEqual([...new Set(Object.values(CONDITIONS).map((def) => def.group))].sort());
    expect<readonly string[]>(Object.values(ACTION_GROUPS).sort()).toEqual([...new Set(Object.values(ACTIONS).map((def) => def.group))].sort());
    const modes = PRESETS.flatMap((preset) => preset.strategy.modes.map((mode) => [mode.id, mode.name] as const));
    expect<Record<string, string>>(Object.fromEntries(modes)).toEqual(PLAY_STYLE_MODES);
  });
});

describe.each(LANGUAGES)("sentences in %s", (_language, v) => {
  test("every rule and fallback of every play style reads as a sentence", () => {
    for (const preset of PRESETS) {
      for (const mode of preset.strategy.modes) {
        for (const rule of mode.rules) {
          const text = ruleText(v, rule, preset.strategy.modes);
          expectReadable(text, v, `${preset.id} ${rule.id}: ${text}`);
          expect(text).toMatch(/^\p{Lu}/u);
          expect(text).toEndWith(".");
        }
        expectReadable(fallbackText(v, mode.fallback), v, `${preset.id} fallback`);
        expectReadable(modeName(v, mode), v, `${preset.id} mode`);
      }
    }
  });

  test("every condition reads well for every sampled value, negated or not", () => {
    for (const def of Object.values(CONDITIONS)) {
      for (const params of sampleParams(def.params)) {
        for (const negate of [false, true]) {
          const ref: ConditionRef = { condition: def.id, params, negate };
          expectReadable(conditionText(v, ref), v, `${def.id} ${JSON.stringify(params)}`);
        }
      }
    }
  });

  test("every action reads well for every sampled value", () => {
    for (const def of Object.values(ACTIONS)) {
      for (const params of sampleParams(def.params)) {
        const ref: ActionRef = { action: def.id, params };
        expectReadable(actionText(v, ref), v, `${def.id} ${JSON.stringify(params)}`);
      }
    }
  });

  test("the pickers list every condition and action once, under a group name; \"wait\" is offered only as a step", () => {
    expect<readonly string[]>(conditionGroups(v, "splash").flatMap((group) => group.items.map((item) => item.id)).sort()).toEqual([...CONDITION_IDS].sort());
    expect<readonly string[]>(actionGroups(v).flatMap((group) => group.items.map((item) => item.id)).sort()).toEqual(ACTION_IDS.filter((id) => id !== "wait").sort());
    for (const group of [...conditionGroups(v, "splash"), ...actionGroups(v)]) expectReadable(group.name, v, "group");
  });

  test("ultimate picks follow the current style and only rules offer the action", () => {
    for (const ultimate of ULTIMATE_IDS) {
      const group = conditionGroups(v, ultimate).find(({ name }) => name === v.conditionGroups.ultimate);
      const ids = group?.items.map(({ id }) => id);
      expect(ids).toEqual(
        ["dash", "splash", "mudBomb", "whirlwind"].includes(ultimate)
          ? ["ultimateReady", "ultimateCharged", "ultimateCatches"] : ["ultimateReady", "ultimateCharged"],
      );
    }
    expect(actionGroups(v).find(({ name }) => name === v.actionGroups.ultimate)?.items.map(({ id }) => id)).toEqual(["useUltimate"]);
    expect(actionGroups(v, true).flatMap(({ items }) => items).some(({ id }) => id === "useUltimate")).toBe(false);
  });

  test("a negated condition names the same parameters as the plain one, so the editor and the sentence agree", () => {
    const keys = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();
    for (const [conditionId, phrase] of Object.entries(v.conditions)) expect(keys(phrase.not), conditionId).toEqual(keys(phrase.text));
  });

  test("an unknown id reads as the unknown phrase, so a stale draft does not break the page", () => {
    expect(conditionText(v, { condition: "gone", params: {}, negate: false })).toBe(v.unknown);
  });

  test("a negated comparison reads as its exact opposite, which differs from the plain sentence", () => {
    const opposite = { atLeast: "fewerThan", fewerThan: "atLeast", atMost: "moreThan", moreThan: "atMost" } as const;
    for (const [compare, flipped] of Object.entries(opposite)) {
      const negated = conditionText(v, { condition: "myWater", params: { compare, n: 3 }, negate: true });
      expect(negated).toBe(conditionText(v, { condition: "myWater", params: { compare: flipped, n: 3 }, negate: false }));
      expect(negated).not.toBe(conditionText(v, { condition: "myWater", params: { compare, n: 3 }, negate: false }));
    }
  });
});

describe("a negated comparison in English", () => {
  test("says the opposite instead of 'not'", () => {
    expect(conditionText(en, { condition: "myWater", params: { compare: "atLeast", n: 3 }, negate: true })).toBe("my water is less than 3");
    expect(conditionText(en, { condition: "timeLeft", params: { compare: "moreThan", n: 50 }, negate: true })).toBe("the time left in the round is at most 50%");
  });

  test("keeps 'not' for a chosen tank, which may be missing", () => {
    expect(conditionText(en, { condition: "targetWater", params: { target: "nearest", compare: "atMost", n: 2 }, negate: true })).toBe("the nearest tank does not have at most 2 water");
    expect(conditionText(en, { condition: "targetDistance", params: { target: "nearest", compare: "atMost", n: 2 }, negate: true })).toBe("the nearest tank is missing or more than 2 squares away");
  });
});

/** Words that make a target phrase speak as the tank itself. */
const FIRST_PERSON = { en: /\b(me|my|I)\b/, id: /(ku\b|\baku\b)/ } as const;

describe("third-person targets", () => {
  test("no target phrase about the tank speaks as the tank", () => {
    for (const phrase of Object.values(en.targetsThirdPerson)) expect(phrase).not.toMatch(FIRST_PERSON.en);
    for (const phrase of Object.values(id.targetsThirdPerson)) expect(phrase).not.toMatch(FIRST_PERSON.id);
  });

  test("what the tank did reads in the third person", () => {
    const ref: ActionRef = { action: "moveToward", params: { target: "nearestWithLessWater" } };
    expect(actionDoneAboutText(en, ref)).toBe("moved toward the nearest tank with less water than it");
    expect(actionDoneAboutText(id, ref)).toBe("mendekati tank terdekat yang airnya lebih sedikit darinya");
  });
});

describe("play styles", () => {
  test("each English sentence is one sentence of at most 9 words", () => {
    for (const [presetId, style] of Object.entries(en.playStyles)) {
      expect(style.summary.split(" ").length, presetId).toBeLessThanOrEqual(9);
      expect(style.summary.match(/[.!?]/g), presetId).toEqual(["."]);
    }
  });
});

describe("sample sentences", () => {
  const rule: Rule = {
    id: "r",
    match: "all",
    conditions: [{ condition: "myWater", params: { compare: "atLeast", n: 6 }, negate: false }],
    action: { action: "moveToward", params: { target: "nearestWithLessWater" } },
    chance: 100,
    switchToMode: null,
  };

  test("a rule reads as one sentence in each language", () => {
    expect(ruleText(en, rule, [])).toBe("When my water is at least 6, move toward the nearest tank with less water than me.");
    expect(ruleText(id, rule, [])).toBe("Kalau airku minimal 6, dekati tank terdekat yang airnya lebih sedikit dariku.");
  });

  test("the list's short form names the first of 3 or more conditions and counts the rest", () => {
    const water = rule.conditions[0]!;
    const three = { ...rule, conditions: [water, water, water] };
    expect(ruleBriefText(en, rule, [])).toBe(ruleText(en, rule, []));
    expect(ruleBriefText(en, three, [])).toBe("When my water is at least 6 and 2 more conditions, move toward the nearest tank with less water than me.");
    expect(ruleBriefText(id, { ...three, match: "any" }, [])).toBe("Kalau airku minimal 6 atau salah satu dari 2 syarat lain, dekati tank terdekat yang airnya lebih sedikit dariku.");
  });

  test("one square and one point are singular in English", () => {
    const near = { condition: "nearestEnemyAtMost", params: { n: 1 }, negate: false };
    expect(conditionText(en, near)).toBe("the nearest tank is at most 1 square away");
    expect(conditionText(en, { ...near, params: { n: 3 } })).toBe("the nearest tank is at most 3 squares away");
    expect(conditionText(id, near)).toBe("tank terdekat ada dalam jarak 1 petak");
  });

  test("two conditions join with the words for all or any, and the chance and the switch follow", () => {
    const two: Rule = {
      ...rule,
      match: "any",
      conditions: [...rule.conditions, { condition: "enemyInRange", params: {}, negate: true }],
      chance: 40,
      switchToMode: "rest",
    };
    const modes = [{ id: "rest", name: "Rest", rules: [], fallback: { action: "throw", params: {} } }];
    expect(ruleText(en, two, modes)).toBe(
      "When my water is at least 6 or no tank in my line of fire is within my range, move toward the nearest tank with less water than me. Do this 40% of the time. Then switch to the “Rest” mode.",
    );
    expect(ruleText(id, two, modes)).toBe(
      "Kalau airku minimal 6 atau tidak ada tank di garis tembakku dalam jangkauanku, dekati tank terdekat yang airnya lebih sedikit dariku. Lakukan ini kira-kira 40 dari 100 kali. Lalu pindah ke mode “Istirahat”.",
    );
  });

  test("a rule card's parts: one block per condition, the joining word, the action with its id, the switch and the chance", () => {
    const two: Rule = { ...rule, match: "any", conditions: [...rule.conditions, { condition: "enemyInRange", params: {}, negate: true }], chance: 40, switchToMode: "rest" };
    const modes = [{ id: "rest", name: "Rest", rules: [], fallback: { action: "throw", params: {} } }];
    expect(ruleParts(id, two, modes)).toEqual({
      conditions: ["airku minimal 6", "tidak ada tank di garis tembakku dalam jangkauanku"],
      joiner: "atau",
      action: { kind: "one", id: "moveToward", text: "dekati tank terdekat yang airnya lebih sedikit dariku" },
      switchTo: "Istirahat",
      chance: 40,
    });
    expect(ruleParts(en, rule, [])).toMatchObject({ joiner: "and", switchTo: null, chance: null });
  });

  test("a card shows at most 3 condition blocks; the last one counts the rest", () => {
    const water = rule.conditions[0]!;
    const four = { ...rule, conditions: [water, water, water, water] };
    expect(ruleParts(en, four, []).conditions).toEqual(["my water is at least 6", "my water is at least 6", "2 more conditions"]);
    expect(ruleParts(en, { ...four, conditions: [water, water, water] }, []).conditions).toHaveLength(3);
    expect(ruleParts(en, { ...rule, action: { action: "fly", params: {} } }, []).action).toMatchObject({ kind: "one", id: null });
  });

  test("a play style mode the player renamed keeps the new name", () => {
    expect(modeName(id, { id: "rest", name: "Tidur" })).toBe("Tidur");
  });
});

test("area conditions show the chosen condition and target in both languages", () => {
  const self = { condition: "myArea", params: { set: "dry-spell" }, negate: false };
  const target = { condition: "targetArea", params: { target: "nearest", set: "downpour" }, negate: false };
  expect(conditionText(en, self)).toBe("I stand in a Dry spell area");
  expect(conditionText(id, self)).toBe("aku berada di area Musim kering");
  expect(conditionText(en, target)).toBe("the target (the nearest tank) stands in a Downpour area");
  expect(conditionText(id, target)).toBe("target (tank terdekat) berada di area Hujan deras");
});
