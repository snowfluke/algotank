// One play style changes its ultimate. Its opponents in the rotating mixed field
// keep their defaults. Run with bun packages/engine/scripts/ultimates-cross.ts.

import { PICKER_ORDER, PRESETS, STANDARD_RULE_SET_ID, ULTIMATE_IDS, createRound, standings, stepRound } from "../src/index.ts";
import type { PresetId, UltimateId } from "../src/index.ts";
import { FINAL_SIZE, mixedField } from "./field.ts";

const FINALS = 1600;
const TURNS = 60;

function winRate(style: PresetId, ultimate: UltimateId): number {
  let wins = 0;
  let appearances = 0;
  for (let seed = 1; appearances < FINALS; seed++) {
    const seats = mixedField(seed, PRESETS);
    const styleSeat = seats.findIndex(({ id }) => id === style);
    if (styleSeat < 0) continue;
    const players = seats.map(({ strategy }, seat) => ({ id: `seat${seat}`, strategy: seat === styleSeat ? { ...strategy, ultimate } : strategy }));
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
console.log("Win rate (%). * marks the play style's default ultimate.");
console.log(["Style", ...ULTIMATE_IDS].join("\t"));
const averages = ULTIMATE_IDS.map(() => 0);
const averagedStyles = PICKER_ORDER.filter((id) => id !== "random-walker");
for (const style of PICKER_ORDER) {
  const preset = PRESETS.find(({ id }) => id === style);
  if (preset === undefined) throw new Error(`no preset ${style}`);
  const cells = ULTIMATE_IDS.map((ultimate, i) => {
    const rate = winRate(style, ultimate);
    if (style !== "random-walker") averages[i]! += rate / averagedStyles.length;
    return `${rate.toFixed(2)}${ultimate === preset.strategy.ultimate ? "*" : ""}`;
  });
  console.log([style, ...cells].join("\t"));
}
console.log(["Average (excluding random-walker)", ...averages.map((rate) => rate.toFixed(2))].join("\t"));
