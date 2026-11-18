import { describe, expect, mock, test } from "bun:test";
import { assignUltimate, matchUltimate, PRESETS, type PresetId, type StrategyInput, type UltimateId } from "../index.ts";

const DEFAULTS: Readonly<Record<PresetId, UltimateId>> = {
  "leader-chaser": "dash",
  charger: "dash",
  evader: "smoke",
  "random-walker": "splash",
  backstabber: "fullTank",
  ambusher: "mudBomb",
  picker: "whirlwind",
  "dry-hunter": "bigUmbrella",
  "item-hunter": "magnet",
};

function editedPreset(id: PresetId, editedRuleId: string): Omit<StrategyInput, "ultimate"> {
  const { modes, build } = PRESETS.find((preset) => preset.id === id)!.strategy;
  return {
    build,
    modes: modes.map((mode) => ({
      ...mode,
      rules: mode.rules.map((rule) => rule.id === editedRuleId ? { ...rule, chance: 80 } : rule),
    })),
  };
}

describe("assignUltimate", () => {
  test.each(PRESETS)("the unedited preset $id supplies its ultimate", ({ id, strategy: { modes, build, ultimate } }) => {
    const random = mock(() => 0.99);
    expect(ultimate).toBe(DEFAULTS[id]);
    expect(assignUltimate({ modes, build: { dodge: build["dodge"]!, aim: build["aim"]!, reach: build["reach"]! } }, random)).toBe(ultimate);
    expect(random).not.toHaveBeenCalled();
  });

  test("renaming a mode still matches the preset's rules and build exactly", () => {
    const { modes, build } = PRESETS.find((preset) => preset.id === "ambusher")!.strategy;
    const renamed = { modes: modes.map((mode) => ({ ...mode, name: "Mine" })), build };
    expect(matchUltimate(renamed)).toEqual({ kind: "exact", ultimate: "mudBomb" });
  });

  test("Dry hunter keeps its ultimate after a shared rule is edited", () => {
    const input = editedPreset("dry-hunter", "dodge");
    const random = mock(() => 0.99);
    expect(matchUltimate(input)).toEqual({ kind: "overlap", ultimate: "bigUmbrella" });
    expect(assignUltimate(input, random)).toBe("bigUmbrella");
    expect(random).not.toHaveBeenCalled();
  });

  test.each([
    ["ambusher", "dodge", "mudBomb"],
    ["picker", "dodge", "whirlwind"],
    ["dry-hunter", "free-hit", "bigUmbrella"],
  ] as const)("an edited %s keeps its own ultimate when its %s rule changes", (id, rule, ultimate) => {
    // Ambusher's rules are all inside Backstabber and Item hunter, and Picker's inside Dry hunter. Similarity over
    // all distinct rule ids puts the preset without extra rules first, and a changed rule keeps its id.
    const random = mock(() => 0.99);
    expect(assignUltimate(editedPreset(id, rule), random)).toBe(ultimate);
    expect(random).not.toHaveBeenCalled();
  });

  test("a style that matches two presets with different ultimates equally draws once", () => {
    // Only "loaded" and "spent" stay, both edited: Ambusher and Picker have the same 4 rule ids, so they tie.
    const { build, modes } = editedPreset("ambusher", "");
    const input = {
      build,
      modes: modes.map((mode) => ({
        ...mode,
        rules: mode.rules.filter((rule) => rule.id === "loaded" || rule.id === "spent").map((rule) => ({ ...rule, chance: 80 })),
      })),
    };
    const random = mock(() => 0.125);
    expect(matchUltimate(input)).toEqual({ kind: "random" });
    expect(assignUltimate(input, random)).toBe("smoke");
    expect(random).toHaveBeenCalledTimes(1);
  });

  test("a strategy without preset rules draws once", () => {
    const { build, modes } = editedPreset("evader", "evade");
    const input = {
      build,
      modes: modes.map((mode) => ({ ...mode, rules: mode.rules.map((rule) => ({ ...rule, id: `my-${rule.id}` })) })),
    };
    const random = mock(() => 0.25);
    expect(assignUltimate(input, random)).toBe("splash");
    expect(random).toHaveBeenCalledTimes(1);
  });
});
