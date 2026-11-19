// Monthly field for 87-hybrid-arenas.md. Run with bun apps/server/scripts/hybrid-balance.ts.
// Keep the condition for each day so the measured points belong to that layout.
// LeagueDay still runs the production weather draws, fresh starts, items and statistics.

import { plainTankLook } from "@game/arena";
import { ARENA_LAYOUT_IDS, createRng, PRESETS, type ArenaConditionId } from "@game/engine";
import { LeagueDay } from "../src/monthly/league-day.ts";

const PRESET_IDS = ["ambusher", "item-hunter", "dry-hunter", "backstabber", "leader-chaser", "picker", "evader"] as const;
const COPIES = 4;
const TURNS = 96_000;
// These seating seeds each shuffle the field differently and then draw zero bots.
const DAYS = [
  { round: 87_001, seating: 87_002 },
  { round: 87_002, seating: 87_004 },
  { round: 87_003, seating: 87_006 },
  { round: 87_004, seating: 87_007 },
] as const;
const field = PRESET_IDS.flatMap((id) => {
  const preset = PRESETS.find((entry) => entry.id === id);
  if (preset === undefined) throw new Error(`Missing preset ${id}.`);
  return Array.from({ length: COPIES }, (_, i) => ({
    tank: { id: `${id}-${i + 1}`, name: preset.name, look: plainTankLook(1), strategy: preset.strategy },
    points: 0,
    counts: true,
    stats: undefined,
  }));
});

function measure(condition: ArenaConditionId, days: readonly (typeof DAYS)[number][]) {
  const totals = new Map<string, number>();
  for (const { round, seating } of days) {
    const day = new LeagueDay(1, createRng(seating).next, () => 0, { seed: () => round, conditions: [condition] });
    day.start(field, TURNS);
    if (day.holdings().onBoard !== field.length) throw new Error("The field drew an extra bot.");
    for (let turn = 0; turn < TURNS; turn++) {
      if (day.step() === null) throw new Error(`The day ended on turn ${turn}.`);
    }
    for (const { id, points } of day.standings()) totals.set(id, (totals.get(id) ?? 0) + points);
    console.error(`${condition}, seed ${round} finished`);
  }
  const mean = [...totals.values()].reduce((sum, points) => sum + points, 0) / (field.length * days.length);
  const values = PRESET_IDS.map((id) => {
    let points = 0;
    for (let i = 1; i <= COPIES; i++) points += totals.get(`${id}-${i}`) ?? 0;
    const perTank = points / (COPIES * days.length);
    const difference = perTank - mean;
    return `${perTank.toFixed(1)} (${difference > 0 ? "+" : ""}${difference.toFixed(1)})`;
  });
  return [condition, days.length, mean.toFixed(1), ...values];
}

const rows = [...ARENA_LAYOUT_IDS.map((id) => measure(id, DAYS)), measure("standard", DAYS.slice(0, 1))];
const header = ["Condition", "Days", "Field mean", ...PRESET_IDS];
console.log([header, header.map(() => "---"), ...rows].map((row) => `| ${row.join(" | ")} |`).join("\n"));
