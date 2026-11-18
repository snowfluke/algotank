// Large rounds for the speed work of docs/specs/revamp/63-large-arenas.md: every
// play style in equal shares, seat ids that sort in seat order.
//
// Usage:
//   bun packages/engine/scripts/large-round.ts bench [players=512] [ticks=90] [rounds=1] [--rules=standard]
//     Mean and worst time of one turn of runRound.
//   bun packages/engine/scripts/large-round.ts record
//     Writes the digests of 20 seeds of a 64-player round to large-round.fixture.json
//     (src/round). Run it only to accept a deliberate change of game behaviour; the
//     test round/large-round.test.ts compares every engine change against the file.

import { PRESETS, RULE_SET_IDS, STANDARD_RULE_SET_ID, createRound, isRuleSetId, standings, stepRound } from "../src/index.ts";
import type { RoundConfig, RuleSetId, Standing, TickResult } from "../src/index.ts";

export const FIXTURE_PLAYERS = 64;
export const FIXTURE_TICKS = 90;
export const FIXTURE_SEEDS: readonly number[] = Array.from({ length: 20 }, (_, i) => 1000 + i * 7919);

/**
 * The play styles of the recording, in the order PRESETS had then. Play styles added later
 * stay out, so the recorded rounds keep their seats.
 */
export const RECORDED_STYLES = ["evader", "leader-chaser", "dry-hunter", "ambusher", "picker", "backstabber", "charger", "random-walker"] as const;
const recordedPresets = RECORDED_STYLES.map((id) => {
  const preset = PRESETS.find((p) => p.id === id);
  if (preset === undefined) throw new Error(`no play style ${id}`);
  return preset;
});

/** The recorded play styles in equal shares; seat i plays style i mod their number. */
export function largeRoundConfig(players: number, ticks: number, seed: number, ruleSetId: RuleSetId, items = false): RoundConfig {
  return {
    seed,
    ticksTotal: ticks,
    survivorsAfterRound: Math.max(8, Math.ceil(players / 2)),
    ruleSetId,
    // The fixture of large-round.test.ts was recorded before items, so it plays without them and keeps checking
    // that such a round draws the same. The bench passes --items to time a round as the arenas play it.
    items,
    ultimates: false,
    players: Array.from({ length: players }, (_, i) => {
      const preset = recordedPresets[i % recordedPresets.length];
      if (preset === undefined) throw new Error("no presets");
      return { id: `seat-${String(i).padStart(3, "0")}`, strategy: preset.strategy };
    }),
  };
}

/**
 * The keys that items added (docs/specs/revamp/84-items.md) with the value a round with items
 * off always gives them. The digest leaves them out, so a digest recorded before items still
 * proves that such a round draws and plays exactly as it did.
 */
const ITEM_KEYS_WHEN_OFF: Readonly<Record<string, string>> = { items: "[]", pickups: "[]", item: "null", effect: "null" };

/** JSON with sorted keys, so a digest does not depend on the order in which the engine builds an object. */
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([key, v]) => ITEM_KEYS_WHEN_OFF[key] === undefined || JSON.stringify(v) !== ITEM_KEYS_WHEN_OFF[key])
      .sort(([a], [b]) => (a < b ? -1 : 1));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export interface RoundDigest {
  readonly seed: number;
  readonly ruleSetId: RuleSetId;
  /** sha256 of every TickResult in canonical JSON: decisions, order, throws and snapshots. */
  readonly ticksSha256: string;
  readonly standings: readonly Standing[];
}

/** The seed picks the rule set too, so the 20 seeds cover every rule set. */
export function fixtureDigest(seed: number, index: number): RoundDigest {
  const ruleSetId = RULE_SET_IDS[index % RULE_SET_IDS.length] as RuleSetId;
  const state = createRound(largeRoundConfig(FIXTURE_PLAYERS, FIXTURE_TICKS, seed, ruleSetId));
  const hasher = new Bun.CryptoHasher("sha256");
  hasher.update(canonical(state.snapshot));
  while (!state.isOver) hasher.update(canonical(stepRound(state) satisfies TickResult));
  return { seed, ruleSetId, ticksSha256: hasher.digest("hex"), standings: standings(state) };
}

export const FIXTURE_PATH = new URL("../src/round/large-round.fixture.json", import.meta.url).pathname;

function bench(args: readonly string[]): void {
  const numbers = args.filter((a) => !a.startsWith("--")).map(Number);
  const [players = 512, ticks = 90, rounds = 1] = numbers;
  const rulesArg = args.find((a) => a.startsWith("--rules="))?.slice("--rules=".length) ?? STANDARD_RULE_SET_ID;
  if (!isRuleSetId(rulesArg)) throw new Error(`unknown rule set "${rulesArg}"`);
  const times: number[] = [];
  for (let r = 0; r < rounds; r++) {
    const state = createRound(largeRoundConfig(players, ticks, 42 + r, rulesArg, args.includes("--items")));
    while (!state.isOver) {
      const start = Bun.nanoseconds();
      stepRound(state);
      times.push((Bun.nanoseconds() - start) / 1e6);
    }
  }
  const mean = times.reduce((a, b) => a + b, 0) / times.length;
  const sorted = [...times].sort((a, b) => a - b);
  const p95 = sorted[Math.floor(sorted.length * 0.95)] ?? Number.NaN;
  console.log(
    `${players} players, ${ticks} turns, ${rounds} round(s), ${rulesArg}: mean ${mean.toFixed(2)} ms per turn, p95 ${p95.toFixed(2)} ms, worst ${(sorted.at(-1) ?? Number.NaN).toFixed(2)} ms, total ${(mean * times.length / 1000).toFixed(2)} s`,
  );
}

if (import.meta.main) {
  const [command, ...rest] = Bun.argv.slice(2);
  if (command === "bench") bench(rest);
  else if (command === "record") {
    const digests = FIXTURE_SEEDS.map(fixtureDigest);
    await Bun.write(FIXTURE_PATH, `${JSON.stringify(digests, null, 1)}\n`);
    console.log(`wrote ${digests.length} digests to ${FIXTURE_PATH}`);
  } else {
    console.error("usage: large-round.ts bench [players] [ticks] [rounds] [--rules=id] [--items] | record");
    process.exit(1);
  }
}
