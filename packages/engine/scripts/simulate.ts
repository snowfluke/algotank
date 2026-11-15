// Measures how often each preset wins a grand final of 8, to tune the game
// toward the targets in docs/decisions and docs/specs/revamp/62-diagonal.md: no
// preset wins more than 40% of the mixed field, where pure luck is 12.5%.
//
// Usage: bun packages/engine/scripts/simulate.ts [finals=1000] [ticks=150] [matrixFinals=400] [--rules=standard] [--lineup=id,id,...] [--items=off]
//
// Items are on, as in every arena. --items=off plays the same seeds without items, so the
// two runs side by side show what the items change (docs/specs/revamp/84-items.md).
//
// Tables 1 to 4 play under one rule set: the --rules id, or "standard". Table 5
// always plays every rule set. Under "standard" the numbers are the ones the game
// was tuned with (docs/decisions).
//
// Table 1, mixed field. Every preset sits in each final. When there are fewer
// than 8 presets the extra seats are copies, and when there are more, a window of
// 8 presets plays. The window and the seats rotate with the seed, so every
// preset gets every seat id equally often. Seat ids settle selector ties
// (the lower id wins), so an unrotated seat order would favor a preset.
// "Strongest" is the preset with the highest win rate per seat.
//
// Table 2, one against seven Chargers. For each preset, one seat of that preset
// plays 7 Chargers over the same seeds, and only that seat is counted. A preset
// that does not beat 12.5% here does not beat the benchmark. The Charger row is a
// Charger among 7 Chargers, so by symmetry it must come out near 12.5%, within
// the +/- column. A larger gap points at a bias in the script, for example in
// the seat rotation.
//
// Table 3, matrix of the designed presets (every preset except the Charger and the
// random walker). The cell in row R and column C is the win rate of one seat of R
// against 7 copies of C. It shows which preset beats which, which the mixed field
// hides. It uses fewer finals (matrixFinals) because it has one cell per pair. The
// diagonal is a preset among 7 copies of itself, so like the Charger row it must be
// near 12.5%.
//
// Table 4, the shape of play in the mixed field: how many moves are turns, how
// often the winner took no hit, the mean hits each tank lands in a round, and the
// share of drives (F moves) and of throws at a bot (outcome dry, miss or hit) made
// while facing a diagonal. A field where most moves are turns, or where the winner
// is rarely touched, plays passively. A blocked F counts as a drive, because the
// bot chose it; a throw at an empty line does not count as a throw at a bot.
//
// Table 5, the preset field under each rule set. The field of Table 1 plays
// `finals` finals under every row of RULE_SETS, and the table shows the win % of each
// preset. It passes when the strongest preset differs between at least two rule sets
// and no single preset is strongest in all of them. If a prepared strategy for one
// preset won everywhere, the rule sets would not make a prepared answer weak.
// scripts/probes.ts adds the check that a bot that stands still or hides does not win.
// A second table gives the mean hits each preset lands per final under each set.
//
// Table 6, only with --lineup: the default preset alone against the server's bot
// lineup (apps/server/src/bots.ts, BOT_LINEUP, the 7 preset ids in seat order). The
// engine does not import the server, so the ids come in on the command line; pass
// the lineup exactly as bots.ts lists it. The default preset's seat rotates with the seed.
//
// DEFAULT_PRESET_ID (presets.ts) is the designed preset whose win rate in Table 1
// is closest to 12.5%: the preset that a new player starts from should be neither
// a sure win nor a sure loss. PICKER_ORDER is measured at the length of a practice round:
// pass ticks=60 for that line to name the right preset.

import { DEFAULT_PRESET_ID, PRESETS, RULE_SET_IDS, RULE_SETS, STANDARD_RULE_SET_ID, isDiagonal, isRuleSetId, runRound } from "../src/index.ts";
import type { Preset, RoundPlayer, RuleSetId, Snapshot } from "../src/index.ts";
import { FINAL_SIZE, mixedField } from "./field.ts";

const BENCHMARK_ID = "charger";
const BASELINE_ID = "random-walker";
/** No preset may win more than this share of the mixed field (62-diagonal.md, condition 2). */
const TARGET_HIGH = 40;

const RULES_FLAG = "--rules=";
const LINEUP_FLAG = "--lineup=";
const ITEMS_OFF_FLAG = "--items=off";
const flags = process.argv.slice(2).filter((arg) => arg.startsWith("--"));
const numbers = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
const finals = Number(numbers[0] ?? 1000);
const ticksTotal = Number(numbers[1] ?? 150);
const matrixFinals = Number(numbers[2] ?? 400);
if (![finals, ticksTotal, matrixFinals].every((n) => Number.isInteger(n) && n >= 1)) {
  throw new Error("finals, ticks and matrixFinals must be positive integers");
}
const rulesArg = flags.find((flag) => flag.startsWith(RULES_FLAG))?.slice(RULES_FLAG.length) ?? STANDARD_RULE_SET_ID;
if (!isRuleSetId(rulesArg)) throw new Error(`unknown rule set "${rulesArg}". Known ids: ${RULE_SET_IDS.join(", ")}`);
if (flags.some((flag) => !flag.startsWith(RULES_FLAG) && !flag.startsWith(LINEUP_FLAG) && flag !== ITEMS_OFF_FLAG)) {
  throw new Error(`unknown option. Use ${RULES_FLAG}<id>, ${LINEUP_FLAG}<id>,<id>,... or ${ITEMS_OFF_FLAG}`);
}
const items = !flags.includes(ITEMS_OFF_FLAG);
const lineupIds = flags.find((flag) => flag.startsWith(LINEUP_FLAG))?.slice(LINEUP_FLAG.length).split(",") ?? null;
/** The rule set of Tables 1 to 4. */
const ruleSetId: RuleSetId = rulesArg;

const benchmark = PRESETS.find((preset) => preset.id === BENCHMARK_ID);
if (benchmark === undefined) throw new Error(`no preset "${BENCHMARK_ID}" to use as the benchmark`);
const designed = PRESETS.filter((preset) => preset.id !== BENCHMARK_ID && preset.id !== BASELINE_ID);

interface Tally {
  seats: number;
  wins: number;
  scoreSum: number;
  hitsSum: number;
}

function newTallies(): Map<string, Tally> {
  return new Map(PRESETS.map((p) => [p.id, { seats: 0, wins: 0, scoreSum: 0, hitsSum: 0 }]));
}

/** Counts over all finals of one table, for the shape of play. */
interface Shape {
  finals: number;
  moves: number;
  turns: number;
  /** Finals whose winner was never hit. */
  winnerUntouched: number;
  /** Bots over all finals, so hits / tanks is the mean hits a tank lands in a round. */
  tanks: number;
  hits: number;
  /** F moves, and those made while facing a diagonal. */
  drives: number;
  diagonalDrives: number;
  /** Throws that reached a bot (dry, miss or hit), and those along a diagonal. */
  shotsAtBot: number;
  diagonalShots: number;
}

function newShape(): Shape {
  return { finals: 0, moves: 0, turns: 0, winnerUntouched: 0, tanks: 0, hits: 0, drives: 0, diagonalDrives: 0, shotsAtBot: 0, diagonalShots: 0 };
}

const TURNS: ReadonlySet<string> = new Set(["L", "R", "L45", "R45"]);

function percent(part: number, whole: number): string {
  return ((100 * part) / whole).toFixed(1);
}

function shapeLine(shape: Shape): string {
  return (
    `Turns ${percent(shape.turns, shape.moves)}% of moves. Winner took 0 hits in ${percent(shape.winnerUntouched, shape.finals)}% of finals ` +
    `(${shape.winnerUntouched} of ${shape.finals}). Mean hits landed per tank per round ${(shape.hits / shape.tanks).toFixed(2)}. ` +
    `Diagonal drives ${percent(shape.diagonalDrives, shape.drives)}% (${shape.diagonalDrives} of ${shape.drives}), ` +
    `diagonal throws at a bot ${percent(shape.diagonalShots, shape.shotsAtBot)}% (${shape.diagonalShots} of ${shape.shotsAtBot}).`
  );
}

/**
 * Plays one final with `seatPresets[i]` on seat i, and adds each counted seat's
 * result to its preset's tally. `countedSeat` limits the count to one seat.
 * `shape`, when given, also counts the moves and the winner of the final.
 */
function playFinal(
  seed: number,
  seatPresets: readonly Preset[],
  tallies: Map<string, Tally>,
  rules: RuleSetId,
  countedSeat?: number,
  shape?: Shape,
): void {
  const players: RoundPlayer[] = seatPresets.map((preset, seat) => ({ id: `seat${seat}`, strategy: preset.strategy }));
  const result = runRound({ seed, ticksTotal, survivorsAfterRound: null, ruleSetId: rules, players, items });
  const last = result.ticks[result.ticks.length - 1]?.snapshot;
  if (last === undefined) throw new Error("a round has at least one tick");
  const hitsOf = new Map(last.bots.map((bot) => [bot.id, bot.hitsLanded]));
  if (shape !== undefined) {
    shape.finals += 1;
    shape.tanks += last.bots.length;
    let before: Snapshot = result.spawn;
    for (const tick of result.ticks) {
      // A bot's facing during its own move is its facing before the tick: a bot that throws or drives did not turn this tick.
      const facing = new Map(before.bots.map((bot) => [bot.id, bot.direction]));
      const diagonal = (id: string): boolean => {
        const direction = facing.get(id);
        if (direction === undefined) throw new Error(`no bot ${id} before tick ${tick.tick}`);
        return isDiagonal(direction);
      };
      for (const decision of tick.decisions) {
        shape.moves += 1;
        if (TURNS.has(decision.move)) shape.turns += 1;
        if (decision.move === "F") {
          shape.drives += 1;
          if (diagonal(decision.botId)) shape.diagonalDrives += 1;
        }
      }
      for (const event of tick.throws) {
        if (event.outcome === "empty") continue;
        shape.shotsAtBot += 1;
        if (diagonal(event.throwerId)) shape.diagonalShots += 1;
        if (event.outcome === "hit") shape.hits += 1;
      }
      before = tick.snapshot;
    }
    const winnerId = result.standings.find((standing) => standing.rank === 1)?.botId;
    const winner = last.bots.find((bot) => bot.id === winnerId);
    if (winner === undefined) throw new Error("a final has a winner");
    if (winner.hitsTaken === 0) shape.winnerUntouched += 1;
  }
  for (const standing of result.standings) {
    const seat = Number(standing.botId.slice("seat".length));
    if (countedSeat !== undefined && seat !== countedSeat) continue;
    const preset = seatPresets[seat];
    const entry = preset === undefined ? undefined : tallies.get(preset.id);
    if (entry === undefined) throw new Error(`standing for unknown bot ${standing.botId}`);
    entry.seats += 1;
    entry.scoreSum += standing.score;
    entry.hitsSum += hitsOf.get(standing.botId) ?? 0;
    if (standing.rank === 1) entry.wins += 1;
  }
}

function challengerSeat(seed: number): number {
  return seed % FINAL_SIZE;
}

function oneAgainst(seed: number, challenger: Preset, others: Preset): Preset[] {
  return Array.from({ length: FINAL_SIZE }, (_, seat) => (seat === challengerSeat(seed) ? challenger : others));
}

/** The tally of one seat of `challenger` against 7 copies of `others`, over seeds 1 to `count`. */
function versus(challenger: Preset, others: Preset, count: number): Tally {
  const tallies = newTallies();
  for (let seed = 1; seed <= count; seed++) {
    playFinal(seed, oneAgainst(seed, challenger, others), tallies, ruleSetId, challengerSeat(seed));
  }
  const entry = tallies.get(challenger.id);
  if (entry === undefined) throw new Error("tally missing");
  return entry;
}

function winRate(t: Tally): number {
  return (100 * t.wins) / t.seats;
}

function rows(tallies: ReadonlyMap<string, Tally>) {
  return [...tallies.entries()]
    .map(([id, t]) => {
      const rate = winRate(t);
      return {
        preset: id,
        seats: t.seats,
        wins: t.wins,
        "win % per seat": Number(rate.toFixed(1)),
        "+/- (1 sd)": Number((100 * Math.sqrt((rate / 100) * (1 - rate / 100) / t.seats)).toFixed(1)),
        "mean score": Number((t.scoreSum / t.seats).toFixed(2)),
        "mean hits landed": Number((t.hitsSum / t.seats).toFixed(1)),
      };
    })
    .sort((a, b) => b["win % per seat"] - a["win % per seat"]);
}

/** The result of `finals` finals of the mixed field under one rule set. */
interface FieldRun {
  readonly tallies: Map<string, Tally>;
  readonly shape: Shape;
}

const fieldRuns = new Map<RuleSetId, FieldRun>();

/** Plays the mixed field once per rule set and keeps the result, so Table 1 and Table 5 do not play the same finals twice. */
function runMixedField(rules: RuleSetId): FieldRun {
  const cached = fieldRuns.get(rules);
  if (cached !== undefined) return cached;
  const run: FieldRun = { tallies: newTallies(), shape: newShape() };
  for (let seed = 1; seed <= finals; seed++) {
    playFinal(seed, mixedField(seed, PRESETS), run.tallies, rules, undefined, run.shape);
  }
  fieldRuns.set(rules, run);
  return run;
}

const { tallies: mixed, shape: mixedShape } = runMixedField(ruleSetId);
const versusChargers = new Map<string, Tally>();
for (const preset of PRESETS) versusChargers.set(preset.id, versus(preset, benchmark, finals));

const luck = 100 / FINAL_SIZE;
console.log(`${finals} finals of ${FINAL_SIZE}, ${ticksTotal} ticks each, rule set "${ruleSetId}". Pure luck is ${luck.toFixed(1)}% per seat.`);
console.log("\nTable 1: mixed field, every preset in each final.");
const mixedRows = rows(mixed);
console.table(mixedRows);

console.log("\nTable 2: one seat of the preset against 7 Chargers (the charger row checks the script: it must be near 12.5%).");
console.table(rows(versusChargers));

console.log(
  `\nTable 3: designed presets, win % of one seat of the row preset against 7 copies of the column preset (${matrixFinals} finals per cell, +/- ${(100 * Math.sqrt((luck / 100) * (1 - luck / 100) / matrixFinals)).toFixed(1)} at 12.5%). The diagonal must be near 12.5%.`,
);
const matrix: Record<string, Record<string, number>> = {};
for (const row of designed) {
  matrix[row.id] = {};
  for (const column of designed) {
    (matrix[row.id] as Record<string, number>)[column.id] = Number(winRate(versus(row, column, matrixFinals)).toFixed(1));
  }
}
console.table(matrix);

console.log("\nTable 4: shape of play in the mixed field of Table 1.");
console.log(shapeLine(mixedShape));

const strongest = mixedRows[0];
const walker = mixedRows.find((row) => row.preset === BASELINE_ID);
if (strongest === undefined || walker === undefined) throw new Error("the mixed table needs rows");
const underCap = strongest["win % per seat"] <= TARGET_HIGH;
console.log(
  `\nStrongest in the mixed field: ${strongest.preset} at ${strongest["win % per seat"]}% (at most ${TARGET_HIGH}%): ${underCap ? "PASS" : "FAIL"}.`,
);
const designedRows = mixedRows.filter((row) => designed.some((preset) => preset.id === row.preset));
const behindWalker = designedRows.filter((row) => row["win % per seat"] < walker["win % per seat"]);
console.log(
  behindWalker.length === 0
    ? `Every designed preset wins at least as often as the ${BASELINE_ID} (${walker["win % per seat"]}%).`
    : `Designed presets that win less often than the ${BASELINE_ID} (${walker["win % per seat"]}%): ${behindWalker.map((row) => row.preset).join(", ")}.`,
);
const closest = [...designedRows].sort((a, b) => Math.abs(a["win % per seat"] - luck) - Math.abs(b["win % per seat"] - luck))[0];
if (closest === undefined) throw new Error("the mixed table needs designed rows");
console.log(`Designed preset closest to ${luck.toFixed(1)}%: ${closest.preset} at ${closest["win % per seat"]}%. DEFAULT_PRESET_ID should name it.`);

// --- Table 5 ----------------------------------------------------------------

console.log(`\nTable 5: win % of each preset in the preset field under each rule set (${finals} finals of ${FINAL_SIZE} per rule set).`);
const winPercent: Record<string, Record<string, number>> = {};
const hitsPerFinal: Record<string, Record<string, number>> = {};
for (const preset of PRESETS) {
  winPercent[preset.id] = {};
  hitsPerFinal[preset.id] = {};
}
const topPresets: string[] = [];
for (const id of RULE_SET_IDS) {
  const { tallies, shape } = runMixedField(id);
  for (const preset of PRESETS) {
    const tally = tallies.get(preset.id);
    if (tally === undefined) throw new Error(`no tally for ${preset.id}`);
    (winPercent[preset.id] as Record<string, number>)[id] = Number(winRate(tally).toFixed(1));
    (hitsPerFinal[preset.id] as Record<string, number>)[id] = Number((tally.hitsSum / tally.seats).toFixed(1));
  }
  const ranked = rows(tallies);
  const [first, second] = ranked;
  if (first === undefined || second === undefined) throw new Error("a field has two presets or more");
  topPresets.push(first.preset);
  const defaultTally = tallies.get(DEFAULT_PRESET_ID);
  if (defaultTally === undefined) throw new Error(`no tally for the default preset "${DEFAULT_PRESET_ID}"`);
  console.log(
    `${id}: top ${first.preset} at ${first["win % per seat"]}%, ${(first["win % per seat"] - second["win % per seat"]).toFixed(1)} points ahead of ${second.preset}. ` +
      `${shapeLine(shape)} ${DEFAULT_PRESET_ID} landed ${(defaultTally.hitsSum / defaultTally.seats).toFixed(1)} hits per final. ${RULE_SETS[id].name}: ${RULE_SETS[id].summary}`,
  );
}
console.table(winPercent);
console.log("Mean hits each preset landed per final, per rule set:");
console.table(hitsPerFinal);
const distinctTops = new Set(topPresets);
const passed = distinctTops.size >= 2;
console.log(
  `Top preset per rule set: ${RULE_SET_IDS.map((id, i) => `${id} ${topPresets[i]}`).join(", ")}. ` +
    (passed
      ? `${distinctTops.size} different presets lead, and none leads in all ${RULE_SET_IDS.length}: PASS.`
      : `One preset (${[...distinctTops].join("")}) leads in every rule set: FAIL.`),
);

// --- Table 6 ----------------------------------------------------------------

if (lineupIds !== null) {
  const lineup = lineupIds.map((id) => {
    const preset = PRESETS.find((candidate) => candidate.id === id);
    if (preset === undefined) throw new Error(`--lineup names "${id}", which is not a preset`);
    return preset;
  });
  if (lineup.length !== FINAL_SIZE - 1) throw new Error(`--lineup needs ${FINAL_SIZE - 1} preset ids, got ${lineup.length}`);
  const challenger = PRESETS.find((preset) => preset.id === DEFAULT_PRESET_ID);
  if (challenger === undefined) throw new Error(`no default preset "${DEFAULT_PRESET_ID}"`);
  const tallies = newTallies();
  for (let seed = 1; seed <= finals; seed++) {
    const seat = challengerSeat(seed);
    const seats = [...lineup.slice(0, seat), challenger, ...lineup.slice(seat)];
    playFinal(seed, seats, tallies, ruleSetId, seat);
  }
  const tally = tallies.get(challenger.id);
  if (tally === undefined) throw new Error("tally missing");
  const rate = winRate(tally);
  console.log(
    `\nTable 6: ${DEFAULT_PRESET_ID} (the default) alone against the lineup ${lineupIds.join(", ")}, ${finals} finals under "${ruleSetId}": ` +
      `wins ${rate.toFixed(1)}% +/- ${(100 * Math.sqrt((rate / 100) * (1 - rate / 100) / tally.seats)).toFixed(1)}, ` +
      `mean score ${(tally.scoreSum / tally.seats).toFixed(2)}, mean hits landed ${(tally.hitsSum / tally.seats).toFixed(1)}. At least 12% passes.`,
  );
}
