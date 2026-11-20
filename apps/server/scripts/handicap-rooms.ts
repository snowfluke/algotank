// Calibrates BUILT_IN_HANDICAP for rooms (see handicap-calibration.ts for the league). A public tournament fills to 16
// tanks: a 90-turn round keeps the top 8 (survivorCount), then a 90-turn final. Each tournament seats every tank of
// the field with rules of its own and fills the 16 seats with built-in styles drawn at random; there is no leader
// chaser in a room. Prints, for each handicap, the share of tournaments a built-in style won.
// Run: [ROOM_SIZE=8] bun apps/server/scripts/handicap-rooms.ts <field.json> <tournaments> <handicap>...
import { survivorCount } from "@game/arena";
import { builtInStyleOf, createRng, parseStrategy, runRound, type RoundPlayer } from "@game/engine";

const [fieldFile, countArg, ...handicapArgs] = Bun.argv.slice(2);
if (fieldFile === undefined || countArg === undefined) throw new Error("usage: <field.json> <tournaments> <handicap>...");
const entries = (await Bun.file(fieldFile).json()) as { id: string; gm: boolean; strategy: unknown }[];
const pool = entries.filter((e) => !e.gm).map((entry) => {
  const parsed = parseStrategy(entry.strategy);
  if (!parsed.ok) throw new Error(`${entry.id}: ${parsed.errors.join("; ")}`);
  return { id: entry.id, strategy: parsed.strategy, builtIn: builtInStyleOf(parsed.strategy) !== null };
});
const TURNS = 90;
/** ROOM_SIZE=8 plays a private room of 8: the final alone. */
const SIZE = Number(process.env["ROOM_SIZE"] ?? "16");

for (const handicap of handicapArgs.map(Number)) {
  let mixed = 0;
  let builtInWins = 0;
  for (let t = 0; t < Number(countArg); t++) {
    const rng = createRng(500_000 + t);
    const own = pool.filter((tank) => !tank.builtIn).slice(0, SIZE);
    const builtIn = pool.filter((tank) => tank.builtIn);
    const drawn = [...own, ...rng.shuffle(builtIn.map((_, i) => i)).slice(0, SIZE - own.length).map((i) => builtIn[i]!)];
    mixed++;
    const asPlayer = (tank: (typeof pool)[number]): RoundPlayer =>
      tank.builtIn && handicap > 0 ? { id: tank.id, strategy: tank.strategy, handicap } : { id: tank.id, strategy: tank.strategy };
    let players = drawn;
    for (let round = 1; ; round++) {
      const final = players.length <= 8;
      const { standings } = runRound({
        seed: 700_000 + t * 10 + round, ticksTotal: TURNS, survivorsAfterRound: final ? null : survivorCount(players.length),
        ruleSetId: "standard", players: players.map(asPlayer), items: true, ultimates: true,
      });
      const order = [...standings].sort((a, b) => a.rank - b.rank).map((s) => s.botId);
      if (final) {
        if (players.find((p) => p.id === order[0])?.builtIn === true) builtInWins++;
        break;
      }
      const keep = new Set(order.slice(0, survivorCount(players.length)));
      players = players.filter((p) => keep.has(p.id));
    }
  }
  console.log(`handicap ${String(handicap).padStart(2)}: built-in won ${builtInWins} of ${mixed} tournaments (${((100 * builtInWins) / mixed).toFixed(1)}%)`);
}
