/// <reference types="bun" />
import { plainTankLook } from "@game/arena";
import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { PublicArena, RuleSetMode } from "@game/arena";
import { arenaIn } from "../stream/fixtures.ts";
import { BreakScreen } from "./BreakScreen.tsx";

function breakArena(mode: RuleSetMode, next: "arms-length" | null): PublicArena {
  return {
    ...arenaIn({ kind: "break", nextRound: 2, nextRuleSetId: next, start: { kind: "waiting" } }, mode),
    players: [
      { id: "a", name: "Ana", status: { kind: "playing" }, isBot: false, ready: false, look: plainTankLook(1) },
      { id: "b", name: "Bo", status: { kind: "eliminated", inRound: 1, finalRank: 2 }, isBot: true, ready: false, look: plainTankLook(2) },
    ],
    rounds: [
      {
        round: 1,
        isFinal: false,
        seed: 1,
        ruleSetId: "downpour",
        standings: [
          { botId: "a", score: 3, rank: 1, hitsLanded: 0, hitsTaken: 0 },
          { botId: "b", score: 1, rank: 2, hitsLanded: 0, hitsTaken: 0 },
        ],
        survivors: ["a"],
      },
    ],
  };
}

describe("BreakScreen", () => {
  test("splits who went through from who is out, and says what comes next", () => {
    const html = renderToStaticMarkup(<BreakScreen arena={breakArena("standard", null)} nextRound={2} />);
    expect(html).toContain("Round 1 results<");
    expect(html).toContain("1 tank goes through to the final, and 1 tank is out.");
    expect(html).toContain("Through (1)");
    expect(html).toContain("Out (1)");
    expect(html).toContain("The next round starts when the host starts it.");
    expect(html).not.toContain("Downpour");
  });

  test("announced mode names the finished round's rules and the next ones, in the catalog's words", () => {
    const html = renderToStaticMarkup(<BreakScreen arena={breakArena("announced", "arms-length")} nextRound={2} />);
    expect(html).toContain("Round 1 results: Downpour");
    expect(html).toContain("The next round uses the Up close rules.");
  });

  test("surprise mode keeps the next rules hidden", () => {
    const html = renderToStaticMarkup(<BreakScreen arena={breakArena("surprise", null)} nextRound={2} />);
    expect(html).toContain("The rules of the next round stay secret until it starts.");
    expect(html).not.toContain("Up close");
  });
});
