// The landing page's demo: one tank with three rules plays the game's bots, and the
// visitor reorders the rules. Every order is a real engine round, recorded at build
// time, so the page shows what the game would do and runs no engine in the browser.
//
// The rules teach one idea: the tank does the first rule from the top that fits. With
// "shoot" on top the tank shoots with an empty tank and stays in the line of fire; with
// another rule above it, the tank refills or steps aside first. Across 400 seeds the
// shoot-first orders average about 5th place and the others about 3rd (measured when
// this file was written), so the build picks the first seed that shows the same story
// and stops when no seed does, for example after the engine is retuned.

import { PRESETS, STANDARD_RULE_SET_ID, parseStrategy, runRound } from "@game/engine";
import type { ActionRef, Rule, RoundPlayer, Snapshot, Strategy, TickResult } from "@game/engine";
import { BOT_LINEUP } from "../../server/src/bots.ts";

export type DemoRuleKey = "shoot" | "refill" | "dodge";
export type DemoOrder = readonly [DemoRuleKey, DemoRuleKey, DemoRuleKey];

export const YOU = "you";
export const DEMO_TICKS = 60;
/** The order the page starts with: the one most players write first, and one that loses. */
export const START_ORDER: DemoOrder = ["shoot", "refill", "dodge"];
/** The demo searches seeds 1 to this number for one that tells the story. */
const MAX_SEED = 2000;
/** A shoot-first order must finish at this place or lower, of 8. */
const SHOOT_FIRST_AT_BEST = 6;
/** Every other order must finish at this place or higher. */
const GUARDED_AT_WORST = 3;

function rule(id: DemoRuleKey, condition: string, params: Rule["conditions"][number]["params"], action: ActionRef): Rule {
  return { id, match: "all", conditions: [{ condition, params, negate: false }], action, chance: 100, switchToMode: null };
}

export const DEMO_RULES: Readonly<Record<DemoRuleKey, Rule>> = {
  shoot: rule("shoot", "enemyInRange", {}, { action: "throw", params: {} }),
  refill: rule("refill", "myWater", { compare: "fewerThan", n: 3 }, { action: "moveAway", params: { target: "nearest" } }),
  dodge: rule("dodge", "aimedAtMe", { k: 1 }, { action: "stepOutOfLine", params: {} }),
};

export const DEMO_FALLBACK: ActionRef = { action: "moveToward", params: { target: "nearest" } };

/** Reach 1 (2 points), Aim 2 and Dodge 2 (1 point each): the whole budget of 6. */
const DEMO_BUILD = { reach: 1, aim: 2, dodge: 2 } as const;

export const DEMO_ORDERS: readonly DemoOrder[] = [
  ["shoot", "refill", "dodge"],
  ["shoot", "dodge", "refill"],
  ["refill", "shoot", "dodge"],
  ["refill", "dodge", "shoot"],
  ["dodge", "shoot", "refill"],
  ["dodge", "refill", "shoot"],
];

export function orderKey(order: readonly DemoRuleKey[]): string {
  return order.join("-");
}

export interface DemoRound {
  readonly order: DemoOrder;
  readonly spawn: Snapshot;
  readonly ticks: readonly TickResult[];
  /** The demo tank's final place, 1 to 8. */
  readonly rank: number;
}

export interface DemoRecording {
  readonly seed: number;
  readonly rounds: readonly DemoRound[];
}

function demoStrategy(order: DemoOrder): Strategy {
  const parsed = parseStrategy({
    modes: [{ id: "main", name: "Main", rules: order.map((key) => DEMO_RULES[key]), fallback: DEMO_FALLBACK }],
    build: DEMO_BUILD,
  });
  if (!parsed.ok) throw new Error(`The demo strategy is not valid: ${parsed.errors.join(" ")}`);
  return parsed.strategy;
}

/** The game's own bots, in the order the server seats them (apps/server/src/bots.ts). */
export function botPlayers(): RoundPlayer[] {
  return BOT_LINEUP.map((slot, index) => {
    const preset = PRESETS.find((p) => p.id === slot.presetId);
    if (preset === undefined) throw new Error(`The bot lineup names the preset "${slot.presetId}", which the engine does not have.`);
    return { id: `bot${index + 1}`, strategy: preset.strategy };
  });
}

function playOrder(order: DemoOrder, seed: number, bots: readonly RoundPlayer[]): DemoRound {
  const round = runRound({
    seed,
    ticksTotal: DEMO_TICKS,
    survivorsAfterRound: null,
    ruleSetId: STANDARD_RULE_SET_ID,
    players: [{ id: YOU, strategy: demoStrategy(order) }, ...bots],
  });
  const own = round.standings.find((standing) => standing.botId === YOU);
  if (own === undefined) throw new Error("The demo tank is missing from the standings.");
  return { order, spawn: round.spawn, ticks: round.ticks, rank: own.rank };
}

/** True when every shoot-first order loses and every other order finishes near the top, one of them first. */
export function tellsTheStory(rounds: readonly Pick<DemoRound, "order" | "rank">[]): boolean {
  const shootFirst = rounds.filter((round) => round.order[0] === "shoot");
  const guarded = rounds.filter((round) => round.order[0] !== "shoot");
  return (
    shootFirst.length > 0 &&
    guarded.length > 0 &&
    shootFirst.every((round) => round.rank >= SHOOT_FIRST_AT_BEST) &&
    guarded.every((round) => round.rank <= GUARDED_AT_WORST) &&
    guarded.some((round) => round.rank === 1)
  );
}

export function recordDemo(): DemoRecording {
  const bots = botPlayers();
  for (let seed = 1; seed <= MAX_SEED; seed++) {
    const rounds = DEMO_ORDERS.map((order) => playOrder(order, seed, bots));
    if (tellsTheStory(rounds)) return { seed, rounds };
  }
  throw new Error(
    `No seed from 1 to ${MAX_SEED} shows that the rule order matters, so the landing demo would mislead. Check the demo rules in apps/web/landing/demo-round.ts against the engine.`,
  );
}
