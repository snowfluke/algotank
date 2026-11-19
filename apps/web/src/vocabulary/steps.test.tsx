/// <reference types="bun" />
// Steps in order (76-email-and-sequences.md, S3): the rule's sentence, the blocks a card
// draws and the row on screen, in both languages.

import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { parseStrategy } from "@game/engine";
import type { Rule } from "@game/engine";
import { StepRow } from "../prep/StepRow.tsx";
import { en, id } from "./messages.ts";
import { conditionText, ruleBriefText, ruleParts, ruleText, stepBlocks } from "./sentence.ts";
import { STEP_KINDS, stepKindOf, stepRefOf } from "./steps.ts";

/** The owner's example: "if I get shot, I move forward, turn left, move forward". */
const shot: Rule = {
  id: "r1",
  match: "all",
  conditions: [{ condition: "hitWithin", params: { n: 1 }, negate: false }],
  action: { steps: [stepRefOf("forward"), stepRefOf("left"), stepRefOf("forward")] },
  chance: 100,
  switchToMode: null,
};

test("attribute conditions read with Camouflage in both languages", () => {
  const target = { condition: "targetBuild", params: { target: "nearest", attribute: "camouflage", level: 1 }, negate: false };
  const field = { condition: "fieldTrait", params: { percent: 50, attribute: "camouflage", level: 2 }, negate: false };
  expect(conditionText(en, target)).toBe("the nearest tank has Camouflage at level 1 or higher");
  expect(conditionText(id, target)).toBe("tank terdekat punya Kamuflase level 1 atau lebih");
  expect(conditionText(en, field)).toBe("at least 50% of the other tanks have Camouflage at level 2 or higher");
  expect(conditionText(id, field)).toBe("minimal 50% tank lain punya Kamuflase level 2 atau lebih");
});

describe("a rule with steps in order", () => {
  test("reads as one sentence with the steps in order, in English", () => {
    expect(ruleText(en, shot, [])).toBe(`When ${en.conditions.hitWithin.text.replace("{n}", "1 turn")}, move one square forward, then turn left, then move one square forward.`);
  });

  test("reads as one sentence with the steps in order, in Indonesian", () => {
    expect(ruleText(id, shot, [])).toMatch(/^Kalau .+, maju satu petak, lalu belok kiri, lalu maju satu petak\.$/);
  });

  test("the short form on a card keeps every step", () => {
    expect(ruleBriefText(en, shot, [])).toBe(ruleText(en, shot, []));
  });

  test("a card draws one block per step, with its kind for the icon and a short label", () => {
    expect(ruleParts(en, shot, []).action).toEqual({
      kind: "steps",
      steps: [
        { kind: "forward", name: "Forward" },
        { kind: "left", name: "Turn left" },
        { kind: "forward", name: "Forward" },
      ],
    });
    expect(ruleParts(id, shot, []).action).toEqual({
      kind: "steps",
      steps: [
        { kind: "forward", name: "Maju" },
        { kind: "left", name: "Belok kiri" },
        { kind: "forward", name: "Maju" },
      ],
    });
  });

  test("the row shows the blocks in order joined by arrows, and fills in the running one", () => {
    for (const v of [en, id]) {
      const steps = stepBlocks(v, [stepRefOf("forward"), stepRefOf("left"), stepRefOf("shoot"), stepRefOf("wait")]);
      const html = renderToStaticMarkup(<StepRow steps={steps} layout="row" current={2} />);
      const labels = [...html.matchAll(/data-step-block="(\d)"[^>]*>(?:<svg[\s\S]*?<\/svg>)?<span[^>]*>([^<]+)<\/span>/g)].map((m) => [m[1], m[2]]);
      expect(labels).toEqual([
        ["0", v.steps.forward.name],
        ["1", v.steps.left.name],
        ["2", v.steps.shoot.name],
        ["3", v.steps.wait.name],
      ]);
      expect(html.match(/lucide-arrow-right/g)).toHaveLength(3);
      expect(html.match(/data-step-running/g)).toHaveLength(1);
      expect(html).toMatch(/data-step-block="2" data-step-running/);
    }
  });
});

describe("step kinds", () => {
  test("every kind is a step the engine accepts, and reads back as the same kind", () => {
    for (const kind of STEP_KINDS) {
      expect(stepKindOf(stepRefOf(kind))).toBe(kind);
    }
    const all = { ...shot, action: { steps: STEP_KINDS.slice(0, 4).map(stepRefOf) } };
    const result = parseStrategy({ ultimate: "dash", modes: [{ id: "m", name: "Main", rules: [all], fallback: { action: "throw", params: {} } }], build: { reach: 0, aim: 0, dodge: 0 } });
    expect(result.ok).toBe(true);
  });

  test("a step this version cannot draw has no kind, and its label is its action's words", () => {
    const odd = { action: "moveToward", params: { target: "nearest" } };
    expect(stepKindOf(odd)).toBeNull();
    expect(stepBlocks(en, [odd])).toEqual([{ kind: null, name: "move toward the nearest tank" }]);
  });
});
