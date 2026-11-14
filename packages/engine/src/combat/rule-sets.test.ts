import { describe, expect, test } from "bun:test";
import { RULE_SETS, RULE_SET_IDS, STANDARD_RULE_SET_ID, isRuleSetId, ruleSet, rulesOf } from "./rule-sets.ts";

describe("RULE_SETS", () => {
  test("is keyed by the id of each row, and the standard set is one of them", () => {
    expect(RULE_SET_IDS.length).toBeGreaterThanOrEqual(5);
    expect(RULE_SET_IDS.length).toBeLessThanOrEqual(6);
    expect(Object.keys(RULE_SETS).sort()).toEqual([...RULE_SET_IDS].sort());
    for (const id of RULE_SET_IDS) expect(RULE_SETS[id].id).toBe(id);
    expect(STANDARD_RULE_SET_ID).toBe("standard");
    expect(RULE_SET_IDS).toContain(STANDARD_RULE_SET_ID);
  });

  test("no two sets share a name", () => {
    const names = RULE_SET_IDS.map((id) => RULE_SETS[id].name);
    expect(new Set(names).size).toBe(names.length);
  });

  test("a row cannot change after load", () => {
    const standard = RULE_SETS.standard as unknown as { waterPerThrow: number; baseHitChance: number[] };
    expect(() => {
      standard.waterPerThrow = 1;
    }).toThrow();
    expect(() => {
      standard.baseHitChance[1] = 1;
    }).toThrow();
    expect(ruleSet("standard").waterPerThrow).toBe(3);
  });

  test("the sets differ where the design needs them to: range or hit table, grid density, and skill from 1 cell", () => {
    const others = RULE_SET_IDS.filter((id) => id !== STANDARD_RULE_SET_ID).map((id) => RULE_SETS[id]);
    const standard = RULE_SETS[STANDARD_RULE_SET_ID];
    expect(others.some((rules) => rules.baseRange !== standard.baseRange)).toBe(true);
    expect(others.some((rules) => rules.gridFillRatio !== standard.gridFillRatio)).toBe(true);
    expect(others.some((rules) => rules.firstDistanceWithSkill === 1 && rules.hitChancePerLevel > standard.hitChancePerLevel)).toBe(true);
  });
});

describe("ruleSet", () => {
  test("returns the row of a known id", () => {
    for (const id of RULE_SET_IDS) expect(ruleSet(id)).toBe(RULE_SETS[id]);
  });

  test("throws on an unknown id, including names that exist on every object", () => {
    for (const id of ["", "nope", "Standard", "constructor", "__proto__", "toString"]) {
      expect(() => ruleSet(id), id).toThrow(/unknown rule set/);
    }
  });

  test("isRuleSetId accepts the ids and nothing else", () => {
    for (const id of RULE_SET_IDS) expect(isRuleSetId(id)).toBe(true);
    for (const value of ["nope", "constructor", "", 1, null, undefined, {}]) expect(isRuleSetId(value)).toBe(false);
  });

  test("rulesOf reads the id of a snapshot", () => {
    expect(rulesOf({ ruleSetId: "downpour" })).toBe(RULE_SETS.downpour);
    expect(() => rulesOf({ ruleSetId: "nope" })).toThrow();
  });
});
