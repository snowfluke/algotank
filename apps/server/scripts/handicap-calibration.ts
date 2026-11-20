// Calibrates BUILT_IN_HANDICAP (packages/engine/src/strategy/built-in.ts). Owner, 2026-11-20: a built-in style should
// win against good rules of a child's own only about 5% of the time. Plays a field of strategies for whole league days
// on the league's own day code (bots and the game master's leader chase included) at one handicap, and writes each
// day's points with whether each tank plays a built-in style.
// The field is a JSON array of { id, gm, strategy } and stays outside the repository: the calibration of 2026-11-20
// used the live league's seats, which are players' private rules.
// Run: bun apps/server/scripts/handicap-calibration.ts <field.json> <handicap> <turns> <days> <first-seed> <out.json>
import { plainTankLook } from "@game/arena";
import { builtInStyleOf, createRng, parseStrategy, type Strategy } from "@game/engine";
import { LeagueDay } from "../src/monthly/league-day.ts";

const [fieldFile, handicapArg, turnsArg, daysArg, seedArg, out] = Bun.argv.slice(2);
if (fieldFile === undefined || out === undefined) throw new Error("usage: <field.json> <handicap> <turns> <days> <first-seed> <out.json>");
const HANDICAP = Number(handicapArg);
const TURNS = Number(turnsArg);
const DAYS = Number(daysArg);
const FIRST_SEED = Number(seedArg);
const NOW = Date.parse("2026-11-21T12:00:00+07:00");

const entries = (await Bun.file(fieldFile).json()) as { id: string; gm: boolean; strategy: unknown }[];
const field = entries.map((entry, index) => {
  const parsed = parseStrategy(entry.strategy);
  if (!parsed.ok) throw new Error(`${entry.id}: ${parsed.errors.join("; ")}`);
  return { entry, strategy: parsed.strategy, builtIn: builtInStyleOf(parsed.strategy), colour: ((index % 12) + 1) as 1 };
});
const builtInOf = new Map(field.map(({ entry, builtIn }) => [entry.id, builtIn]));
const handicap = (strategy: Strategy) => (HANDICAP === 0 || builtInStyleOf(strategy) === null ? 0 : HANDICAP);

const days: { day: number; tanks: { id: string; gm: boolean; builtIn: string | null; points: number }[] }[] = [];
for (let d = 0; d < DAYS; d++) {
  const seed = FIRST_SEED + d;
  const day = new LeagueDay(1, createRng(seed).next, () => NOW, { rng: () => createRng(90_000 + seed), handicap });
  day.start(field.map(({ entry, strategy, colour }) => ({
    tank: { id: entry.id, name: entry.id, look: plainTankLook(colour), strategy }, points: 0, counts: true, stats: undefined,
  })), TURNS);
  const started = performance.now();
  for (let turn = 0; turn < TURNS; turn++) if (day.step() === null) throw new Error(`day ended at ${turn}`);
  const gm = new Set(entries.filter((e) => e.gm).map((e) => e.id));
  days.push({
    day: d,
    tanks: day.standings().filter(({ id }) => builtInOf.has(id)).map(({ id, points }) => ({ id, gm: gm.has(id), builtIn: builtInOf.get(id) ?? null, points })),
  });
  console.error(`handicap ${HANDICAP} day ${d + 1}/${DAYS} in ${Math.round((performance.now() - started) / 1000)}s`);
}
await Bun.write(out, JSON.stringify({ handicap: HANDICAP, turns: TURNS, days }));
