// Calibrates BUILT_IN_HANDICAP.room (see handicap-calibration.ts for the league). A public tournament fills to 16
// tanks: a 90-turn round keeps the top 8 (survivorCount), then a 90-turn final. Each tournament seats every tank of
// the field with rules of its own and fills the 16 seats with tanks of one tier drawn at random; there is no leader
// chaser in a room. Prints, for each handicap, the share of tournaments a tank of that tier won.
// The field is ordered best first, and OWN_TANKS (6) of its own tanks sit in each room, as the calibration of
// 2026-11-20. The field has few tweaked tanks, so each built-in style with every condition number moved by one fills
// the tweaked tier too.
// Run: [ROOM_SIZE=8] [OWN_TANKS=6] bun apps/server/scripts/handicap-rooms.ts <field.json> <tournaments> <tier> <handicap.json>...
//   handicap.json, inline: {"miss":10,"exposure":30}
import { survivorCount } from "@game/arena";
import { createRng, handicapTierOf, parseStrategy, PRESETS, runRound, type Handicap, type HandicapTier, type RoundPlayer } from "@game/engine";

const [fieldFile, countArg, tierArg, ...handicapArgs] = Bun.argv.slice(2);
const TIERS: readonly HandicapTier[] = ["builtIn", "builtInNewUltimate", "tweaked"];
const TIER = TIERS.find((tier) => tier === tierArg);
if (fieldFile === undefined || countArg === undefined || TIER === undefined) throw new Error(`usage: <field.json> <tournaments> <${TIERS.join("|")}> <handicap.json>...`);
const entries = (await Bun.file(fieldFile).json()) as { id: string; gm: boolean; strategy: unknown }[];
const pool = [
  ...entries.filter((e) => !e.gm).map((entry) => {
    const parsed = parseStrategy(entry.strategy);
    if (!parsed.ok) throw new Error(`${entry.id}: ${parsed.errors.join("; ")}`);
    return { id: entry.id, strategy: parsed.strategy };
  }),
  // The bots a room fills with are built-in styles too.
  ...PRESETS.map((preset) => ({ id: `bot-${preset.id}`, strategy: preset.strategy })),
  ...PRESETS.flatMap((preset) => {
    const moved = structuredClone(preset.strategy) as unknown as { modes: { rules: { conditions: { params: Record<string, unknown> }[] }[] }[] };
    for (const mode of moved.modes) for (const rule of mode.rules) for (const c of rule.conditions) {
      for (const [key, value] of Object.entries(c.params)) if (typeof value === "number") c.params[key] = value > 1 ? value - 1 : value + 1;
    }
    const parsed = parseStrategy(moved);
    return parsed.ok ? [{ id: `moved-${preset.id}`, strategy: parsed.strategy }] : [];
  }),
].map((tank) => ({ ...tank, tier: handicapTierOf(tank.strategy) }));
const TURNS = 90;
/** ROOM_SIZE=8 plays a private room of 8: the final alone. */
const SIZE = Number(process.env["ROOM_SIZE"] ?? "16");
const own = pool.filter((tank) => tank.tier === null).slice(0, Math.min(SIZE, Number(process.env["OWN_TANKS"] ?? "6")));
const fill = pool.filter((tank) => tank.tier === TIER);
if (fill.length < SIZE - own.length) throw new Error(`the field has ${fill.length} tanks of tier ${TIER}, fewer than the ${SIZE - own.length} seats to fill`);

for (const arg of handicapArgs) {
  const handicap = JSON.parse(arg) as Handicap;
  let wins = 0;
  const count = Number(countArg);
  for (let t = 0; t < count; t++) {
    const rng = createRng(500_000 + t);
    const drawn = [...own, ...rng.shuffle(fill.map((_, i) => i)).slice(0, SIZE - own.length).map((i) => fill[i]!)];
    const asPlayer = (tank: (typeof pool)[number]): RoundPlayer => (tank.tier === null ? { id: tank.id, strategy: tank.strategy } : { id: tank.id, strategy: tank.strategy, handicap });
    let players = drawn;
    for (let round = 1; ; round++) {
      const final = players.length <= 8;
      const { standings } = runRound({
        seed: 700_000 + t * 10 + round, ticksTotal: TURNS, survivorsAfterRound: final ? null : survivorCount(players.length),
        ruleSetId: "standard", players: players.map(asPlayer), items: true, ultimates: true,
      });
      const order = [...standings].sort((a, b) => a.rank - b.rank).map((s) => s.botId);
      if (final) {
        if (players.find((p) => p.id === order[0])?.tier === TIER) wins++;
        break;
      }
      const keep = new Set(order.slice(0, survivorCount(players.length)));
      players = players.filter((p) => keep.has(p.id));
    }
  }
  console.log(`${TIER} ${arg}: won ${wins} of ${count} (${((100 * wins) / count).toFixed(1)}%), ${own.length} own and ${SIZE - own.length} ${TIER}`);
}
