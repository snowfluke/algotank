// Calibrates BUILT_IN_HANDICAP.league (packages/engine/src/strategy/built-in.ts). Owner: a built-in style should win
// against good rules of a child's own only about 5% of the time and a tweaked one about 15% (2026-11-20, 2026-11-21).
// Plays a field of strategies for whole league days on the league's own day code (bots and the game master's leader
// chase included) at one handicap per tier, and prints the share of days each tier won (the best tank that is not a
// game master).
// The field is a JSON array of { id, gm, strategy } and stays outside the repository: the calibrations used the live
// league's seats, which are players' private rules.
// Run: bun apps/server/scripts/handicap-calibration.ts <field.json> <handicaps.json> <turns> <days> <first-seed>
//   handicaps.json, inline: {"builtIn":{"miss":3,"exposure":16},"builtInNewUltimate":{"miss":3,"exposure":10},"tweaked":{"miss":4,"exposure":4}}
import { plainTankLook } from "@game/arena";
import { createRng, handicapTierOf, parseStrategy, type Handicap, type HandicapTier, type Strategy } from "@game/engine";
import { LeagueDay } from "../src/monthly/league-day.ts";

const [fieldFile, handicapsArg, turnsArg, daysArg, seedArg] = Bun.argv.slice(2);
if (fieldFile === undefined || seedArg === undefined) throw new Error("usage: <field.json> <handicaps.json> <turns> <days> <first-seed>");
const HANDICAPS = JSON.parse(handicapsArg!) as Record<HandicapTier, Handicap>;
const TURNS = Number(turnsArg);
const DAYS = Number(daysArg);
const FIRST_SEED = Number(seedArg);
const NOW = Date.parse("2026-11-21T12:00:00+07:00");

const entries = (await Bun.file(fieldFile).json()) as { id: string; gm: boolean; strategy: unknown }[];
const field = entries.map((entry, index) => {
  const parsed = parseStrategy(entry.strategy);
  if (!parsed.ok) throw new Error(`${entry.id}: ${parsed.errors.join("; ")}`);
  return { entry, strategy: parsed.strategy, tier: handicapTierOf(parsed.strategy), colour: ((index % 12) + 1) as 1 };
});
const tierOf = new Map(field.map(({ entry, tier }) => [entry.id, tier]));
const gm = new Set(entries.filter((e) => e.gm).map((e) => e.id));
const handicap = (strategy: Strategy) => {
  const tier = handicapTierOf(strategy);
  return tier === null ? undefined : HANDICAPS[tier];
};

const wins: Record<HandicapTier | "own", number> = { builtIn: 0, builtInNewUltimate: 0, tweaked: 0, own: 0 };
for (let d = 0; d < DAYS; d++) {
  const seed = FIRST_SEED + d;
  const day = new LeagueDay(1, createRng(seed).next, () => NOW, { rng: () => createRng(90_000 + seed), handicap });
  day.start(field.map(({ entry, strategy, colour }) => ({
    tank: { id: entry.id, name: entry.id, look: plainTankLook(colour), strategy }, points: 0, counts: true, stats: undefined,
  })), TURNS);
  for (let turn = 0; turn < TURNS; turn++) if (day.step() === null) throw new Error(`day ended at ${turn}`);
  const best = day.standings().filter(({ id }) => tierOf.has(id) && !gm.has(id)).sort((a, b) => b.points - a.points)[0];
  if (best === undefined) throw new Error("the field has no player tank");
  wins[tierOf.get(best.id) ?? "own"]++;
}
const tanks = (tier: HandicapTier | null) => field.filter((t) => !gm.has(t.entry.id) && t.tier === tier).length;
const share = (n: number) => `${n}/${DAYS} (${((100 * n) / DAYS).toFixed(0)}%)`;
console.log(`${handicapsArg}: built-in ${share(wins.builtIn)} of ${tanks("builtIn")} tanks, new ultimate ${share(wins.builtInNewUltimate)} of ${tanks("builtInNewUltimate")}, tweaked ${share(wins.tweaked)} of ${tanks("tweaked")}, own ${share(wins.own)} of ${tanks(null)}`);
