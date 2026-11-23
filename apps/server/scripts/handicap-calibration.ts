// Calibrates the league's handicap (BUILT_IN_HANDICAP.league in packages/engine/src/strategy/built-in.ts). Owner: a
// built-in style should win against good rules of a child's own only about 5% of the time and a tweaked one about 15%
// (2026-11-20, 2026-11-21), lightly, at every place (2026-11-23).
// Plays a field of strategies for whole league days on the league's own day code (bots and the game master's leader
// chase included) at one handicap per tier, plus "styles" to try a style's own extra on every tier, and prints the share of
// days each tier won (the best tank that is not a game master) and the share of days each style's best tank finished
// in the top 5 and the top 10.
// The field is a JSON array of { id, gm, strategy } and stays outside the repository: the calibrations used the live
// league's seats, which are players' private rules.
// Run: bun apps/server/scripts/handicap-calibration.ts <field.json> <handicaps.json> <turns> <days> <first-seed>
//   handicaps.json, inline, the league's values: {"builtIn":{"miss":3,"exposure":16},"builtInNewUltimate":{"miss":3,"exposure":10},
//   "tweaked":{"miss":5,"exposure":6}}
import { plainTankLook } from "@game/arena";
import { createRng, handicapClassOf, parseStrategy, type Handicap, type HandicapTier, type PresetId, type Strategy } from "@game/engine";
import { LeagueDay } from "../src/monthly/league-day.ts";

const [fieldFile, handicapsArg, turnsArg, daysArg, seedArg] = Bun.argv.slice(2);
if (fieldFile === undefined || seedArg === undefined) throw new Error("usage: <field.json> <handicaps.json> <turns> <days> <first-seed>");
const HANDICAPS = JSON.parse(handicapsArg!) as Record<HandicapTier, Handicap> & { styles?: Partial<Record<PresetId, Handicap>> };
const TURNS = Number(turnsArg);
const DAYS = Number(daysArg);
const FIRST_SEED = Number(seedArg);
const NOW = Date.parse("2026-11-21T12:00:00+07:00");
/** The top places counted per style; the owner chose the top 10 (2026-11-21), the top 5 is printed beside it. */
const TOPS = [5, 10] as const;

const entries = (await Bun.file(fieldFile).json()) as { id: string; gm: boolean; strategy: unknown }[];
const field = entries.map((entry, index) => {
  const parsed = parseStrategy(entry.strategy);
  if (!parsed.ok) throw new Error(`${entry.id}: ${parsed.errors.join("; ")}`);
  const found = handicapClassOf(parsed.strategy);
  return { entry, strategy: parsed.strategy, tier: found?.tier ?? null, style: found?.style ?? null, colour: ((index % 12) + 1) as 1 };
});
const tierOf = new Map(field.map(({ entry, tier }) => [entry.id, tier]));
const styleOf = new Map(field.map(({ entry, style }) => [entry.id, style]));
const gm = new Set(entries.filter((e) => e.gm).map((e) => e.id));
const handicap = (strategy: Strategy) => {
  const found = handicapClassOf(strategy);
  if (found === null) return undefined;
  const tier = HANDICAPS[found.tier];
  const extra = HANDICAPS.styles?.[found.style];
  return extra === undefined ? tier : { miss: tier.miss + extra.miss, exposure: tier.exposure + extra.exposure };
};

const wins: Record<HandicapTier | "own", number> = { builtIn: 0, builtInNewUltimate: 0, tweaked: 0, own: 0 };
const inTop = new Map<string, number>();
let flaggedInTop = 0;
/** Every place each style and tier finished, for the mean place. */
const ranks = new Map<string, number[]>();
for (let d = 0; d < DAYS; d++) {
  const seed = FIRST_SEED + d;
  const day = new LeagueDay(1, createRng(seed).next, () => NOW, { rng: () => createRng(90_000 + seed), handicap });
  day.start(field.map(({ entry, strategy, colour }) => ({
    tank: { id: entry.id, name: entry.id, look: plainTankLook(colour), strategy }, points: 0, counts: true, stats: undefined,
  })), TURNS);
  for (let turn = 0; turn < TURNS; turn++) if (day.step() === null) throw new Error(`day ended at ${turn}`);
  const order = day.standings().filter(({ id }) => tierOf.has(id) && !gm.has(id)).sort((a, b) => b.points - a.points);
  const best = order[0];
  if (best === undefined) throw new Error("the field has no player tank");
  wins[tierOf.get(best.id) ?? "own"]++;
  flaggedInTop += order.slice(0, 10).filter(({ id }) => tierOf.get(id) !== null).length;
  order.forEach(({ id }, rank) => {
    const key = `${styleOf.get(id) ?? "own"} ${tierOf.get(id) ?? ""}`;
    ranks.set(key, [...(ranks.get(key) ?? []), rank + 1]);
  });
  for (const n of TOPS) {
    const top = new Set(order.slice(0, n).map(({ id }) => styleOf.get(id)).filter((style) => style !== null && style !== undefined));
    for (const style of top) inTop.set(`${n} ${style}`, (inTop.get(`${n} ${style}`) ?? 0) + 1);
  }
}
const tanks = (tier: HandicapTier | null) => field.filter((t) => !gm.has(t.entry.id) && t.tier === tier).length;
const share = (n: number) => `${n}/${DAYS} (${((100 * n) / DAYS).toFixed(0)}%)`;
const styles = [...new Set(field.filter((t) => t.style !== null && !gm.has(t.entry.id)).map((t) => t.style!))].sort();
for (const n of TOPS) console.log(`top ${n}: ${styles.map((style) => `top${n}-${style} ${share(inTop.get(`${n} ${style}`) ?? 0)}`).join(", ")}`);
console.log(`flagged tanks in the top 10: ${(flaggedInTop / DAYS).toFixed(1)} a day; mean place: ${[...ranks].sort().map(([key, r]) => `${key} ${(r.reduce((a, b) => a + b, 0) / r.length).toFixed(1)}`).join(", ")}`);
console.log(`${handicapsArg}: built-in ${share(wins.builtIn)} of ${tanks("builtIn")} tanks, new ultimate ${share(wins.builtInNewUltimate)} of ${tanks("builtInNewUltimate")}, tweaked ${share(wins.tweaked)} of ${tanks("tweaked")}, own ${share(wins.own)} of ${tanks(null)}`);
