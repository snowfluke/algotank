/// <reference types="bun" />
import { describe, expect, test } from "bun:test";
import type { StatsView } from "@game/engine";
import { renderToStaticMarkup } from "react-dom/server";
import { I18nProvider } from "../i18n/I18nProvider.tsx";
import { createLanguageStore } from "../i18n/language.ts";
import { cardRows, hitRate, quietRules } from "./statsCard.ts";
import { StatsCard } from "./StatsCard.tsx";

const oneMode: StatsView = { turns: 90, shots: 40, hits: 12, timesHit: 8, squaresMoved: 54, noRuleTurns: 47, modes: [{ name: "Only", rules: [12, 31, 0], fallback: 47 }] };
// The tank never entered "Hide", so its rules had no chance to run.
const twoModes: StatsView = {
  ...oneMode,
  modes: [
    { name: "Attack", rules: [12, 0], fallback: 40 },
    { name: "Hide", rules: [0, 0], fallback: 0 },
  ],
};

describe("the card's rules", () => {
  test("a rule that never ran in a mode the tank played is named; one in a mode it never entered is not", () => {
    expect(quietRules(oneMode)).toEqual([{ mode: 0, modeName: "Only", rule: 3 }]);
    expect(quietRules(twoModes)).toEqual([{ mode: 0, modeName: "Attack", rule: 2 }]);
  });

  test("rows list each rule and the mode's fallback, with mode headings only for several modes", () => {
    expect(cardRows(oneMode).map((row) => row.kind)).toEqual(["rule", "rule", "rule", "fallback"]);
    expect(cardRows(twoModes).map((row) => row.kind)).toEqual(["mode", "rule", "rule", "fallback", "mode", "rule", "rule", "fallback"]);
    expect(cardRows(oneMode).filter((row) => row.kind === "rule" && row.neverRan)).toHaveLength(1);
  });

  test("the hit rate is a whole percent, and there is none without a shot", () => {
    expect(hitRate({ shots: 40, hits: 12 })).toBe(30);
    expect(hitRate({ shots: 0, hits: 0 })).toBeNull();
  });
});

describe("StatsCard", () => {
  const indonesian = (view: StatsView) =>
    renderToStaticMarkup(
      <I18nProvider store={createLanguageStore({ store: null, initial: "id" })}>
        <StatsCard heading="Ronde 2" numbers={view} rules={view} />
      </I18nProvider>,
    );

  test("shows the three main numbers, each rule's turns and the sentence about the rule that never ran, in Indonesian", () => {
    const html = indonesian(oneMode);
    expect(html).toContain("Tembakan");
    expect(html).toContain("30% dari tembakan");
    expect(html).toContain("Aturan 2 jalan 31 giliran.");
    expect(html).toContain("Aturan 3 tidak pernah jalan, jadi coba periksa syaratnya.");
    expect(html).toContain("Kalau tidak ada aturan yang cocok");
  });

  test("names the mode of a quiet rule when the strategy has modes, in English", () => {
    const html = renderToStaticMarkup(<StatsCard heading="Round 2" numbers={twoModes} rules={twoModes} />);
    expect(html).toContain("Rule 2 in Attack never ran, so look at its condition.");
    expect(html).not.toContain("in Hide never ran");
  });

  test("says nothing about quiet rules when every rule ran", () => {
    const busy: StatsView = { ...oneMode, modes: [{ name: "Only", rules: [12, 31, 1], fallback: 46 }] };
    expect(indonesian(busy)).not.toContain("tidak pernah jalan");
  });
});
