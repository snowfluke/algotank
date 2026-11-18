// Compares the same 800 finals with items on, using the rotating mixed field of
// simulate.ts Table 1 (docs/specs/revamp/85-ultimates.md, Balance gates).
// Run with bun packages/engine/scripts/ultimates.ts. Pass --sweep to measure
// each first charge that can fire before a 20-turn final ends.

import { PRESETS, STANDARD_RULE_SET_ID, ULTIMATE_IDS, ULTIMATE_RULES, createRound, standings, stepRound } from "../src/index.ts";
import type { ShotProtection, UltimateId } from "../src/index.ts";
import { FINAL_SIZE, mixedField } from "./field.ts";

const FINALS = 800;
const TURNS = 60;
const ROUND_LENGTHS = [20, 40, TURNS, 160] as const;

function averageFires(turns: number, firstReadyTurn: number = ULTIMATE_RULES.firstReadyTurn): number {
  let fires = 0;
  for (let seed = 1; seed <= FINALS; seed++) {
    const players = mixedField(seed, PRESETS).map(({ strategy }, seat) => ({ id: `seat${seat}`, strategy }));
    const round = createRound({
      seed, ticksTotal: turns, survivorsAfterRound: null, ruleSetId: STANDARD_RULE_SET_ID,
      players, items: true, ultimates: true,
    });
    if (firstReadyTurn !== ULTIMATE_RULES.firstReadyTurn) {
      // Only the initial charge changes. A zero-turn charge starts ready.
      Object.assign(round, { snapshot: { ...round.snapshot, bots: round.snapshot.bots.map((bot) => ({
        ...bot,
        ultimate: firstReadyTurn === 0 ? { id: bot.ultimate!.id, kind: "ready" }
          : { id: bot.ultimate!.id, kind: "charging", turnsLeft: firstReadyTurn },
      })) } });
    }
    while (!round.isOver) fires += stepRound(round).fires?.length ?? 0;
  }
  return fires / (FINALS * FINAL_SIZE);
}

if (Bun.argv.includes("--sweep")) {
  const [shortest] = ROUND_LENGTHS;
  console.log(`${FINALS} seeded finals per first charge, ${FINAL_SIZE} tanks, ${shortest} turns, items and ultimates on.`);
  console.log("First charge\tAverage fires per tank per final");
  for (let turns = shortest - 1; turns >= 0; turns--) console.log(`${turns}\t${averageFires(shortest, turns).toFixed(4)}`);
  process.exit(0);
}

const styles = new Map(PRESETS.map(({ id }) => [id, { seats: 0, on: 0, off: 0 }]));
const ultimates = new Map<UltimateId, { turns: number; fires: number }>(
  ULTIMATE_IDS.map((id) => [id, { turns: 0, fires: 0 }]),
);
const defenses = {
  bigUmbrella: { uses: 0, saved: 0 },
  smoke: { uses: 0, saved: 0 },
  umbrella: { uses: 0, saved: 0 },
};

function tallyFor<K, V>(table: ReadonlyMap<K, V>, key: K): V {
  const tally = table.get(key);
  if (tally === undefined) throw new Error(`no tally for ${String(key)}`);
  return tally;
}

function countProtection(protection: ShotProtection | undefined): void {
  if (protection !== undefined) defenses[protection.kind].saved += protection.pointsSaved;
}

for (let seed = 1; seed <= FINALS; seed++) {
  const seats = mixedField(seed, PRESETS);
  const players = seats.map(({ strategy }, seat) => ({ id: `seat${seat}`, strategy }));
  const styleByBot = new Map(seats.map(({ id }, seat) => [`seat${seat}`, id]));
  for (const { id, strategy } of seats) {
    tallyFor(styles, id).seats++;
    tallyFor(ultimates, strategy.ultimate).turns += TURNS;
  }

  for (const enabled of [false, true]) {
    const round = createRound({
      seed, ticksTotal: TURNS, survivorsAfterRound: null, ruleSetId: STANDARD_RULE_SET_ID,
      players, items: true, ultimates: enabled,
    });
    while (!round.isOver) {
      const tick = stepRound(round);
      if (tick.fires === undefined) continue;
      for (const event of tick.throws) if ("protection" in event) countProtection(event.protection);
      for (const { item } of tick.pickups) if (item === "umbrella") defenses.umbrella.uses++;
      for (const fire of tick.fires) {
        tallyFor(ultimates, fire.kind).fires++;
        if (fire.kind === "bigUmbrella" || fire.kind === "smoke") defenses[fire.kind].uses++;
        if (fire.kind === "splash") for (const square of fire.squares) countProtection(square.protection);
        // A pulled umbrella counts from acquisition, like an umbrella picked up by driving.
        if (fire.kind === "magnet") for (const { kind } of fire.items) if (kind === "umbrella") defenses.umbrella.uses++;
      }
    }
    const winner = standings(round)[0];
    if (winner === undefined) throw new Error("a final has a winner");
    tallyFor(styles, tallyFor(styleByBot, winner.botId))[enabled ? "on" : "off"]++;
  }
}

const winRows = [...styles].map(([style, { seats, on, off }]) => ({
  style, off: 100 * off / seats, on: 100 * on / seats,
}));
const fireRows = [...ultimates].map(([ultimate, { turns, fires }]) => ({
  ultimate, fires, turns, rate: 100 * fires / turns,
}));
function savedPerUse(kind: keyof typeof defenses): number {
  const { saved, uses } = defenses[kind];
  if (uses === 0) throw new Error(`no uses of ${kind} in the measured field`);
  return saved / uses;
}

console.log(`${FINALS} seeded finals per setting, ${FINAL_SIZE} tanks, ${TURNS} turns, standard rules, items on.`);
console.log("\nStyle\tOff (%)\tOn (%)\tChange (pp)");
for (const { style, off, on } of winRows) console.log(`${style}\t${off.toFixed(2)}\t${on.toFixed(2)}\t${(on - off).toFixed(2)}`);
console.log("\nUltimate\tFires\tEquipped tank-turns\tFires per tank per 100 turns");
for (const { ultimate, fires, turns, rate } of fireRows) console.log(`${ultimate}\t${fires}\t${turns}\t${rate.toFixed(3)}`);
const averageByLength = ROUND_LENGTHS.map((turns) => ({ turns, average: turns === TURNS
  ? fireRows.reduce((sum, row) => sum + row.fires, 0) / (FINALS * FINAL_SIZE)
  : averageFires(turns) }));
console.log(`\nCharge (turns)\tFirst ${ULTIMATE_RULES.firstReadyTurn}\tRecharge ${ULTIMATE_RULES.rechargeTurns}`);
console.log("Round turns\tAverage fires per tank per final");
for (const { turns, average } of averageByLength) console.log(`${turns}\t${average.toFixed(3)}`);

console.log("\nDefense (ultimates on)\tPoints saved\tFires or pickups\tPoints per fire or pickup");
for (const kind of ["bigUmbrella", "smoke", "umbrella"] as const) {
  console.log(`${kind}\t${defenses[kind].saved}\t${defenses[kind].uses}\t${savedPerUse(kind).toFixed(3)}`);
}

function gate(passed: boolean, label: string): void {
  console.log(`${passed ? "PASS" : "FAIL"}\t${label}`);
}
console.log();
gate(winRows.every(({ on }) => on < 40), "Every style wins under 40% with ultimates on");
gate(winRows.every(({ on, off }) => on <= 2 * off), "Every style stays at or below twice its off win rate");
gate(fireRows.every(({ rate }) => rate >= 1), "Every ultimate fires at least once per tank per 100 turns");
gate(savedPerUse("bigUmbrella") > savedPerUse("umbrella"), "Big umbrella saves more points per use than item umbrella");
gate(averageByLength.every(({ average }) => average >= 1), "Every measured round length averages at least one fire per tank");
