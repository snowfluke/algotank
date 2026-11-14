/// <reference types="bun" />
import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { ArenaPhase, RuleSetMode } from "@game/arena";
import { RULE_SET_MODES } from "@game/arena";
import { CATALOGS } from "../i18n/catalog.ts";
import { arenaIn } from "../stream/fixtures.ts";
import { RuleSetLine } from "./RuleSetLine.tsx";

const lobby = (nextRuleSetId: "standard" | "downpour" | null): ArenaPhase => ({ kind: "lobby", nextRuleSetId, start: { kind: "waiting" } });
const pause = (nextRuleSetId: "standard" | "downpour" | null): ArenaPhase => ({ kind: "break", nextRound: 2, nextRuleSetId, start: { kind: "waiting" } });

// What the server sends per mode: the standard id, a drawn id, or null.
const NEXT_ID: Record<RuleSetMode, "standard" | "downpour" | null> = { standard: "standard", announced: "downpour", surprise: null };

describe("RuleSetLine", () => {
  const draw = { lobby, break: pause };

  for (const mode of RULE_SET_MODES) {
    for (const [phaseName, make] of Object.entries(draw)) {
      test(`${mode} mode in the ${phaseName}`, () => {
        const html = renderToStaticMarkup(<RuleSetLine arena={arenaIn(make(NEXT_ID[mode]), mode)} />);
        if (mode === "standard") expect(html).toBe("");
        if (mode === "announced") {
          expect(html).toContain("The next round uses the Downpour rules.");
          expect(html).toContain(CATALOGS.en.vocabulary.roundRules.downpour.summary.replace("'", "&#x27;"));
        }
        if (mode === "surprise") {
          expect(html).toContain(CATALOGS.en.prep.nextRules.hidden);
          expect(html).not.toContain("Downpour");
        }
      });
    }
  }

  test("a running round shows no line", () => {
    const running: ArenaPhase = {
      kind: "running",
      round: 1,
      isFinal: false,
      seed: 1,
      ruleSetId: "downpour",
      playerIds: [],
      survivorsAfterRound: 8,
    };
    expect(renderToStaticMarkup(<RuleSetLine arena={arenaIn(running, "announced")} />)).toBe("");
  });
});
