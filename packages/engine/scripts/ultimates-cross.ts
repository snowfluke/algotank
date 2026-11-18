// One play style changes its ultimate. Its opponents in the rotating mixed field
// keep their defaults. Pass --rules to run each cell both ways (85-ultimates.md).

import { PICKER_ORDER, PRESETS, STANDARD_RULE_SET_ID, ULTIMATE_IDS, createRound, parseStrategy, ruleSet, standings, stepRound } from "../src/index.ts";
import type { ConditionRef, PresetId, Rule, Strategy, UltimateId } from "../src/index.ts";
import { FINAL_SIZE, mixedField } from "./field.ts";

const FINALS = 1600;
const TURNS = 60;

const compareRules = Bun.argv.includes("--rules");
const { waterPerThrow } = ruleSet(STANDARD_RULE_SET_ID);

// One hand-written firing condition per ultimate, prepended to every mode so the
// comparison measures its timing across the same play styles and seeds.
const firingConditions: Readonly<Record<UltimateId, ConditionRef>> = {
  dash: { condition: "ultimateCatches", params: { n: 1 }, negate: false },
  smoke: { condition: "hitWithin", params: { n: 2 }, negate: false },
  splash: { condition: "ultimateCatches", params: { n: 3 }, negate: false },
  fullTank: { condition: "myWater", params: { compare: "fewerThan", n: waterPerThrow }, negate: false },
  mudBomb: { condition: "ultimateCatches", params: { n: 2 }, negate: false },
  whirlwind: { condition: "ultimateCatches", params: { n: 3 }, negate: false },
  bigUmbrella: { condition: "aimedAtMe", params: { k: 2 }, negate: false },
  magnet: { condition: "myItem", params: { item: "any" }, negate: true },
};

function withFiringRule(strategy: Strategy): Strategy {
  const rule: Rule = {
    id: "balance-use-ultimate",
    match: "all",
    conditions: [firingConditions[strategy.ultimate]],
    action: { action: "useUltimate", params: {} },
    chance: 100,
    switchToMode: null,
  };
  const parsed = parseStrategy({ ...strategy, modes: strategy.modes.map((mode) => ({ ...mode, rules: [rule, ...mode.rules] })) });
  if (!parsed.ok) throw new Error(parsed.errors.join("\n"));
  return parsed.strategy;
}

function winRate(style: PresetId, variant: Strategy): number {
  let wins = 0;
  let appearances = 0;
  for (let seed = 1; appearances < FINALS; seed++) {
    const seats = mixedField(seed, PRESETS);
    const styleSeat = seats.findIndex(({ id }) => id === style);
    if (styleSeat < 0) continue;
    const players = seats.map(({ strategy }, seat) => ({ id: `seat${seat}`, strategy: seat === styleSeat ? variant : strategy }));
    const round = createRound({
      seed, ticksTotal: TURNS, survivorsAfterRound: null, ruleSetId: STANDARD_RULE_SET_ID,
      players, items: true, ultimates: true,
    });
    while (!round.isOver) stepRound(round);
    if (standings(round)[0]?.botId === players[styleSeat]?.id) wins++;
    appearances++;
  }
  return 100 * wins / appearances;
}

console.log(`${FINALS} finals and appearances per cell, ${FINAL_SIZE} tanks, ${TURNS} turns, standard rules, items and ultimates on.`);
console.log(compareRules ? "Win rate (%), automatic / by rules. * marks the default ultimate." : "Win rate (%). * marks the play style's default ultimate.");
console.log(["Style", ...ULTIMATE_IDS].join("\t"));
const averages = ULTIMATE_IDS.map(() => ({ automatic: 0, byRules: 0 }));
const averagedStyles = PICKER_ORDER.filter((id) => id !== "random-walker");

function cell(automatic: number, byRules: number): string {
  return compareRules ? `${automatic.toFixed(2)} / ${byRules.toFixed(2)}` : automatic.toFixed(2);
}

for (const style of PICKER_ORDER) {
  const preset = PRESETS.find(({ id }) => id === style);
  if (preset === undefined) throw new Error(`no preset ${style}`);
  const cells = ULTIMATE_IDS.map((ultimate, i) => {
    const variant = { ...preset.strategy, ultimate };
    const automatic = winRate(style, variant);
    const byRules = compareRules ? winRate(style, withFiringRule(variant)) : 0;
    const average = averages[i]!;
    if (style !== "random-walker") {
      average.automatic += automatic / averagedStyles.length;
      average.byRules += byRules / averagedStyles.length;
    }
    return `${cell(automatic, byRules)}${ultimate === preset.strategy.ultimate ? "*" : ""}`;
  });
  console.log([style, ...cells].join("\t"));
}
console.log(["Average (excluding random-walker)", ...averages.map(({ automatic, byRules }) => cell(automatic, byRules))].join("\t"));
