// Two checks on the rule sets that Table 5 of simulate.ts does not make.
//
// Part 1, bots that do not play. Under each rule set, the Statue (stands still and
// throws at whatever stands in front of it) and the Turtle (hides in a corner and
// throws only at a bot next to it) take the seat of the Charger in the preset field.
// A rule set where either wins clearly more than luck (12.5%) rewards not playing,
// which a rule set must not do.
//
// Part 2, the build. One seat of the Picker's rule list plays with another build in
// the preset field. The presets all use the build 0/3/3, so Table 5 cannot show whether
// Aim and Dodge matter. A rule set where they matter shows a larger gap between builds.
//
// Part 3, one document for every rule set. The Switcher is the preset that leads the
// most rule sets (SWITCHER_BASE_ID) with one rule per rule set that another preset
// leads; each rule switches to that preset's modes.
// It needs no knowledge of the draw. Its numbers show how much a prepared document
// keeps when the rules change, so this part reports and has no pass mark.
//
// Usage: bun packages/engine/scripts/probes.ts [finals=1000] [ticks=150] [--items=off]
// Items are on, as in every arena; --items=off plays the same seeds without them.

import { PRESETS, RULE_SET_IDS, RULE_SETS, parseStrategy, runRound } from "../src/index.ts";
import type { Build, RoundPlayer, RuleSetId, Strategy, StrategyInput } from "../src/index.ts";
import { FINAL_SIZE, mixedField } from "./field.ts";

const numbers = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
const items = !process.argv.includes("--items=off");
const finals = Number(numbers[0] ?? 1000);
const ticksTotal = Number(numbers[1] ?? 150);
if (![finals, ticksTotal].every((n) => Number.isInteger(n) && n >= 1)) {
  throw new Error("finals and ticks must be positive integers");
}
const luck = 100 / FINAL_SIZE;
/** The preset whose seat a probe takes. */
const REPLACED_ID = "charger";
const BUILD_PRESET_ID = "picker";
/** Rule sets that part 2 compares: the standard one and the one that makes Aim and Dodge count. */
const BUILD_RULE_SETS: readonly RuleSetId[] = ["standard", "sharp-eyes"];

const BUILD = { reach: 0, aim: 3, dodge: 3 };
const when = (condition: string, params: Record<string, unknown> = {}) => ({ condition, params, negate: false });
const toTarget = (action: string, target: string) => ({ action, params: { target } });
const mode = (rules: readonly unknown[], fallback: unknown) => ({ id: "m", name: "M", rules, fallback });

const PROBE_INPUTS: Readonly<Record<string, StrategyInput>> = {
  statue: { build: BUILD, ultimate: "dash", modes: [mode([], toTarget("faceTarget", "nearest"))] } as unknown as StrategyInput,
  turtle: {
    build: BUILD,
    ultimate: "dash",
    modes: [
      mode(
        [{ id: "adjacent", match: "all", conditions: [when("enemyAhead", { n: 1 })], action: { action: "throw", params: {} }, chance: 100, switchToMode: null }],
        { action: "goToPlace", params: { place: "corner" } },
      ),
    ],
  } as unknown as StrategyInput,
};

function strategyOf(input: StrategyInput, label: string): Strategy {
  const result = parseStrategy(JSON.parse(JSON.stringify(input)));
  if (!result.ok) throw new Error(`${label} is not a valid strategy: ${result.errors.join("; ")}`);
  return result.strategy;
}

function presetStrategy(id: string): Strategy {
  const preset = PRESETS.find((candidate) => candidate.id === id);
  if (preset === undefined) throw new Error(`no preset "${id}"`);
  return preset.strategy;
}

/** Win % of the seat of `replacedId` over `finals` finals of the preset field, with `replacement` playing in that seat. */
function winPercentOfReplacement(ruleSetId: RuleSetId, replacement: Strategy, replacedId: string = REPLACED_ID): number {
  let wins = 0;
  for (let seed = 1; seed <= finals; seed++) {
    const field = mixedField(seed, PRESETS);
    const players: RoundPlayer[] = field.map((preset, seat) => ({
      id: `seat${seat}`,
      strategy: preset.id === replacedId ? replacement : preset.strategy,
    }));
    const result = runRound({ seed, ticksTotal, survivorsAfterRound: null, ruleSetId, players, items });
    const winner = result.standings.find((standing) => standing.rank === 1)?.botId;
    const seat = field.findIndex((preset) => preset.id === replacedId);
    if (winner === `seat${seat}`) wins += 1;
  }
  return (100 * wins) / finals;
}

console.log(`${finals} finals of ${FINAL_SIZE}, ${ticksTotal} ticks each. Pure luck is ${luck.toFixed(1)}% per seat.`);
console.log(`\nPart 1: win % of a probe in the seat of the ${REPLACED_ID} in the preset field. Each must stay below luck.`);
const probeTable: Record<string, Record<string, number>> = {};
for (const [name, input] of Object.entries(PROBE_INPUTS)) {
  const strategy = strategyOf(input, name);
  probeTable[name] = {};
  for (const id of RULE_SET_IDS) (probeTable[name] as Record<string, number>)[id] = Number(winPercentOfReplacement(id, strategy).toFixed(1));
}
console.table(probeTable);
const tooStrong = Object.entries(probeTable).flatMap(([name, row]) =>
  Object.entries(row).filter(([, percent]) => percent >= luck).map(([id, percent]) => `${name} under ${id} at ${percent}%`),
);
console.log(tooStrong.length === 0 ? "No probe reaches luck: PASS." : `At or above luck: ${tooStrong.join(", ")}: FAIL.`);

console.log(`\nPart 2: win % of one seat of the ${BUILD_PRESET_ID} rule list with each build, in the seat of the ${REPLACED_ID}.`);
const builds: Readonly<Record<string, Build>> = {
  "0/0/0 (Reach/Aim/Dodge)": { reach: 0, aim: 0, dodge: 0 },
  "0/3/3": { reach: 0, aim: 3, dodge: 3 },
  "2/1/1": { reach: 2, aim: 1, dodge: 1 },
};
const base = presetStrategy(BUILD_PRESET_ID);
const buildTable: Record<string, Record<string, number>> = {};
for (const [label, build] of Object.entries(builds)) {
  const input = { ...base, build };
  const strategy = strategyOf(input, `${BUILD_PRESET_ID} with build ${label}`);
  buildTable[label] = {};
  for (const id of BUILD_RULE_SETS) (buildTable[label] as Record<string, number>)[RULE_SETS[id].id] = Number(winPercentOfReplacement(id, strategy).toFixed(1));
}
console.table(buildTable);

/** The rule sets in which another preset than the base leads, and that preset. From Table 5 of simulate.ts (eight directions, 90 ticks). */
const SWITCHER_BASE_ID = "ambusher";
const SWITCHER_BRANCHES: readonly { readonly ruleSetId: RuleSetId; readonly presetId: string }[] = [
  { ruleSetId: "dry-spell", presetId: "dry-hunter" },
  { ruleSetId: "downpour", presetId: "leader-chaser" },
];

function switcherStrategy(): Strategy {
  const base = presetStrategy(SWITCHER_BASE_ID);
  const [firstMode, ...otherModes] = base.modes;
  if (firstMode === undefined) throw new Error(`the ${SWITCHER_BASE_ID} has no mode`);
  const branches = SWITCHER_BRANCHES.map(({ ruleSetId, presetId }) => {
    const modes = presetStrategy(presetId).modes;
    const entry = modes[0];
    if (entry === undefined) throw new Error(`the ${presetId} has no mode`);
    // The switch rule spends one tick on a throw, which is the cost of adapting.
    const rule = { id: `to-${presetId}`, match: "all", conditions: [when("ruleSet", { set: ruleSetId })], action: { action: "throw", params: {} }, chance: 100, switchToMode: entry.id };
    return { rule, modes };
  });
  const input = {
    ...base,
    modes: [{ ...firstMode, rules: [...branches.map((branch) => branch.rule), ...firstMode.rules] }, ...otherModes, ...branches.flatMap((branch) => branch.modes)],
  } as unknown as StrategyInput;
  return strategyOf(input, "switcher");
}

const leadPresetOf = (ruleSetId: RuleSetId): string =>
  SWITCHER_BRANCHES.find((branch) => branch.ruleSetId === ruleSetId)?.presetId ?? SWITCHER_BASE_ID;

console.log("\nPart 3: win % of the Switcher (one document with a branch per rule set), in two seats of the preset field.");
const switcher = switcherStrategy();
const besideLead = `beside the lead preset (seat of the ${REPLACED_ID})`;
const insteadOfLead = "in place of the lead preset";
const switcherTable: Record<string, Record<string, number>> = { [besideLead]: {}, [insteadOfLead]: {} };
for (const id of RULE_SET_IDS) {
  (switcherTable[besideLead] as Record<string, number>)[id] = Number(winPercentOfReplacement(id, switcher).toFixed(1));
  (switcherTable[insteadOfLead] as Record<string, number>)[id] = Number(winPercentOfReplacement(id, switcher, leadPresetOf(id)).toFixed(1));
}
console.table(switcherTable);
for (const [label, row] of Object.entries(switcherTable)) {
  const values = Object.values(row);
  console.log(`${label}: lowest ${Math.min(...values).toFixed(1)}%, mean ${(values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(1)}%. Luck is ${luck.toFixed(1)}%.`);
}
