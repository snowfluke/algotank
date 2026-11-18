/// <reference types="bun" />
import { describe, expect, test } from "bun:test";
import { PRESETS, parseStrategy } from "@game/engine";
import type { Decision, Snapshot, StrategyInput, ThrowEvent, TickResult } from "@game/engine";
import { renderToStaticMarkup } from "react-dom/server";
import { I18nProvider } from "../i18n/I18nProvider.tsx";
import { createLanguageStore } from "../i18n/language.ts";
import { MatchResult } from "./MatchResult.tsx";
import { en, id } from "./messages.ts";
import { PLAYER_ID, TICKS_DEFAULT, matchTanks, runPractice } from "./run.ts";
import { summarise, summaryTips, type MatchSummary } from "./summary.ts";

const snapshot = {} as Snapshot;

const rule = (action: string) => ({ id: action, match: "all" as const, conditions: [], chance: 100, switchToMode: null, action: { action, params: { target: "nearest" } } });

/** The player's strategy: one rule per action the turns below name, each rule with the action's id as its own. */
const strategy: StrategyInput = {
  ultimate: "dash",
  build: {},
  modes: [{ id: "m", name: "Only", rules: [rule("attack"), rule("moveAway")], fallback: { action: "throw", params: {} } }],
};

function turn(tick: number, actionId: string, throws: ThrowEvent[]): TickResult {
  const decision: Decision = { botId: PLAYER_ID, modeId: "m", ruleId: actionId, actionId, move: "F", nextModeId: "m" } as Decision;
  return { tick, order: [PLAYER_ID], decisions: [decision], throws, pickups: [], snapshot };
}

describe("summarise", () => {
  test("takes the shots, hits and hits taken from the engine's count, counts the dry shots and finds the most used action", () => {
    const ticks = [
      turn(0, "attack", [{ throwerId: PLAYER_ID, outcome: "hit", targetId: "b", distance: 1, hitChance: 90 }]),
      turn(1, "attack", [{ throwerId: PLAYER_ID, outcome: "miss", targetId: "b", distance: 2, hitChance: 60 }]),
      turn(2, "attack", [{ throwerId: PLAYER_ID, outcome: "dry", targetId: "b", distance: 1 }]),
      turn(3, "moveAway", [
        { throwerId: "b", outcome: "hit", targetId: PLAYER_ID, distance: 1, hitChance: 90 },
        { throwerId: "c", outcome: "hit", targetId: "b", distance: 1, hitChance: 90 },
        { throwerId: PLAYER_ID, outcome: "empty" },
      ]),
    ];
    expect(summarise(ticks, PLAYER_ID, strategy, { shots: 2, hits: 1, timesHit: 1 })).toEqual({
      turns: 4,
      shots: 2,
      hits: 1,
      dryShots: 1,
      timesHit: 1,
      topAction: { action: { action: "attack", params: { target: "nearest" } }, turns: 3 },
    });
  });

  test("a turn without the player's decision is an error, not a silent zero", () => {
    const broken: TickResult = { tick: 0, order: [], decisions: [], throws: [], pickups: [], snapshot };
    expect(() => summarise([broken], PLAYER_ID, strategy, { shots: 0, hits: 0, timesHit: 0 })).toThrow();
  });
});

describe("summaryTips", () => {
  const base: MatchSummary = { turns: 80, shots: 10, hits: 5, dryShots: 0, timesHit: 2, topAction: null };

  test("a tank that never shot is told to shoot", () => {
    expect(summaryTips({ ...base, shots: 0, hits: 0 })[0]).toBe("noShots");
  });

  test("dry shots, many misses and being hit more than hitting each give their tip, two at most", () => {
    expect(summaryTips({ ...base, dryShots: 3 })).toEqual(["oftenDry"]);
    expect(summaryTips({ ...base, hits: 2 })).toEqual(["manyMisses"]);
    expect(summaryTips({ ...base, timesHit: 9 })).toEqual(["hitMoreThanHitting"]);
    expect(summaryTips({ ...base, dryShots: 4, hits: 1, timesHit: 9 })).toHaveLength(2);
    expect(summaryTips(base)).toEqual([]);
  });
});

describe("practice texts", () => {
  test("the English place uses ordinals", () => {
    expect(en.result(1, 8)).toBe("Your tank finished 1st of 8 in this test.");
    expect(en.result(3, 8)).toBe("Your tank finished 3rd of 8 in this test.");
    expect(en.result(12, 16)).toBe("Your tank finished 12th of 16 in this test.");
  });
});

describe("MatchResult", () => {
  const preset = PRESETS[0];
  if (preset === undefined) throw new Error("no presets");
  const run = runPractice({ strategy: preset.strategy, name: "Ayu", opponents: 7, mix: { kind: "eachOnce" }, ticks: TICKS_DEFAULT, seed: 7, ruleSetId: "standard" });

  test("states the place, what the tank did and the luck line", () => {
    const html = renderToStaticMarkup(<MatchResult run={run} />);
    // The engine's place, which breaks ties, so it is unique.
    expect(html).toContain(en.result(run.player.rank, run.standings.length));
    expect(html).toContain("What your tank did most");
    expect(html).toMatch(/Your tank most often [a-z]/);
    expect(html).toContain("some luck in it");
  });

  test("reads in Indonesian", () => {
    const html = renderToStaticMarkup(
      <I18nProvider store={createLanguageStore({ store: null, initial: "id" })}>
        <MatchResult run={run} />
      </I18nProvider>,
    );
    expect(html).toContain("Tank kamu dapat peringkat ");
    expect(html).toContain(`dari ${run.standings.length} tank dalam uji coba ini.`);
  });

  test("names the tank's target in the third person, because the sentence starts with “Your tank”", () => {
    // Every turn runs the fallback, so the most used action is this one.
    const chaser = parseStrategy({
      ultimate: "dash",
      build: { reach: 0, aim: 0, dodge: 0 },
      modes: [{ id: "m", name: "Only", rules: [], fallback: { action: "moveToward", params: { target: "nearestWithLessWater" } } }],
    });
    if (!chaser.ok) throw new Error(chaser.errors.join("\n"));
    const chase = runPractice({ strategy: chaser.strategy, name: "Ayu", opponents: 3, mix: { kind: "eachOnce" }, ticks: TICKS_DEFAULT, seed: 7, ruleSetId: "standard" });
    expect(renderToStaticMarkup(<MatchResult run={chase} />)).toContain("Your tank most often moved toward the nearest tank with less water than it,");
    const idHtml = renderToStaticMarkup(
      <I18nProvider store={createLanguageStore({ store: null, initial: "id" })}>
        <MatchResult run={chase} />
      </I18nProvider>,
    );
    expect(idHtml).toContain("Tank kamu paling sering mendekati tank terdekat yang airnya lebih sedikit darinya,");
  });
});

describe("matchTanks", () => {
  test("the player keeps its look and no plain bot shares its colour before the other eleven are used", () => {
    const ids = [PLAYER_ID, ...Array.from({ length: 12 }, (_, i) => `bot-${i + 1}`)];
    const look = { colour: 4, skin: "waves", second: 1, plate: 3, icon: "fish", country: null } as const;
    const tanks = matchTanks(ids, look);
    expect(tanks.get(PLAYER_ID)).toEqual({ look });
    const botColours = ids.slice(1, 12).map((botId) => tanks.get(botId)?.look.colour);
    expect(botColours).not.toContain(4);
    expect(new Set(botColours).size).toBe(11);
    expect(tanks.get("bot-1")?.look.skin).toBe("plain");
    expect(tanks.get("bot-1")?.isBot).toBe(true);
  });
});

describe("the points sentence", () => {
  test("a score below zero says what it means, in both languages", () => {
    expect(en.points(-11)).toBe("Other tanks took more points from it than it took from them, so it ended 11 points below zero.");
    expect(id.points(-11)).toContain("mengambil lebih banyak poin");
    expect(id.points(-11)).toContain("minus 11");
    expect(en.points(4)).toBe("It ended with 4 points.");
  });
});
