// Plays one monthly league day with N seated tanks through the real LeagueDay and writes the
// stream a viewer would get: the `state` message and one compact tick per turn. The web
// harness replays the file (apps/web/src/monthly/MonthlyHarness.tsx, `stream=<url>`), so the
// board's cost is measured on real engine turns. It also prints the server's side: the time of
// one engine step and the bytes of one turn on the wire.
//
//   bun apps/server/scripts/perf-stream.ts --tanks=512 --turns=80 --out=/path/stream.json [--flags=rs,bo,mx,es] [--seed=1]
//
// `--flags` gives every tank one of these countries' flags, in turn. The numbers are for the machine
// it runs on; compare two runs on the same machine in the same minute.

import { FLAG_COUNTRIES, MONTHLY_BOARD_MIN_TANKS, TANK_COLOURS, TANK_ICONS, TANK_SKINS, isFlagCountry, type CompactTick, type FlagCountry, type LeagueLive, type TankLook } from "@game/arena";
import { PRESETS } from "@game/engine";
import { writeFileSync } from "node:fs";
import { toCompactTick } from "../src/public-tick.ts";
import { LeagueDay, type DayTank } from "../src/monthly/league-day.ts";

function option(name: string): string | undefined {
  return process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
}

const tanks = Number(option("tanks") ?? 512);
const turns = Number(option("turns") ?? 80);
const out = option("out");
const flags = (option("flags") ?? "").split(",").filter((code) => code !== "");
const countries: FlagCountry[] = flags.map((code) => {
  if (!isFlagCountry(code)) throw new Error(`"${code}" is not one of the ${FLAG_COUNTRIES.length} flag countries.`);
  return code;
});

/** mulberry32: the same seed gives the same league, so two runs play the same turns. */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function lookOf(i: number): TankLook {
  const colour = TANK_COLOURS[i % TANK_COLOURS.length] as TankLook["colour"];
  return {
    colour,
    skin: TANK_SKINS[i % TANK_SKINS.length] as TankLook["skin"],
    second: TANK_COLOURS[(i + 5) % TANK_COLOURS.length] as TankLook["second"],
    plate: i % 3 === 0 ? null : (TANK_COLOURS[(i + 2) % TANK_COLOURS.length] as TankLook["colour"]),
    icon: i % 4 === 2 ? null : (TANK_ICONS[i % TANK_ICONS.length] ?? null),
    country: countries.length === 0 ? null : (countries[i % countries.length] ?? null),
  };
}

// Keep the benchmark on the same pre-release rules as its fixture.
const day = new LeagueDay(1, seeded(Number(option("seed") ?? 1)), () => 0);
const seats: DayTank[] = Array.from({ length: tanks }, (_, i) => ({
  id: `seat-${i + 1}`,
  name: `Tank ${i + 1}`,
  look: lookOf(i),
  strategy: (PRESETS[i % PRESETS.length] as (typeof PRESETS)[number]).strategy,
}));
day.start(seats.map((tank) => ({ tank, points: 0, counts: true, stats: undefined })), 96_000);
const view = day.view(96_000);
const state: LeagueLive = { league: 1, month: "2026-11", day: "2026-11-16", dayEndsInMs: 5 * 3600 * 1000, tickMs: 900, phase: day.phase(), tanks: view.tanks, board: toPublicBoard(view.board), activity: [] };

function toPublicBoard(board: typeof view.board): LeagueLive["board"] {
  return { ...board, bots: board.bots.map(({ id, x, y, direction, score, wasHit, build, hitsLanded, hitsTaken, water, item, effect }) => ({ id, x, y, direction, score, wasHit, build, hitsLanded, hitsTaken, water, item, effect })) };
}

const encoder = new TextEncoder();
const stepMs: number[] = [];
const encodeMs: number[] = [];
const tickBytes: number[] = [];
const ticks: CompactTick[] = [];
for (let i = 0; i < turns; i++) {
  const t0 = performance.now();
  const result = day.step();
  const t1 = performance.now();
  if (result === null) throw new Error("The round stopped early.");
  const compact = toCompactTick(result);
  const bytes = encoder.encode(`event: tick\ndata: ${JSON.stringify({ type: "tick", tick: compact, own: null })}\n\n`).length;
  const t2 = performance.now();
  stepMs.push(t1 - t0);
  encodeMs.push(t2 - t1);
  tickBytes.push(bytes);
  ticks.push(compact);
}

function stats(values: readonly number[]): string {
  const sorted = [...values].sort((a, b) => a - b);
  const at = (p: number) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] as number;
  const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
  return `mean ${mean.toFixed(2)}  p50 ${at(0.5).toFixed(2)}  p95 ${at(0.95).toFixed(2)}  max ${at(1).toFixed(2)}`;
}

const stateBytes = encoder.encode(`event: state\ndata: ${JSON.stringify({ type: "state", state })}\n\n`).length;
// One ranking answer (GET /api/monthly/leagues/:league/ranking): 512 rows of today and of the month. An estimate in the server's shape.
const ranking = {
  league: 1,
  month: state.month,
  day: state.day,
  today: state.tanks.map((tank, i) => ({ rank: i + 1, seatId: tank.id, name: tank.name, look: tank.look, points: 0, counts: true, seated: true, livePoints: true, gm: false })),
  thisMonth: state.tanks.map((tank, i) => ({ rank: i + 1, seatId: tank.id, name: tank.name, look: tank.look, score: 18.4, countedDays: 9 })),
};
console.log(`tanks ${view.board.bots.length} (seated ${tanks}, board ${view.board.width} x ${view.board.height}, minimum ${MONTHLY_BOARD_MIN_TANKS}), rules ${view.board.ruleSetId}, ${turns} turns`);
console.log(`engine step ms:  ${stats(stepMs)}`);
console.log(`encode ms:       ${stats(encodeMs)}`);
console.log(`tick bytes:      ${stats(tickBytes)}  (one viewer, one turn, SSE text before gzip)`);
console.log(`state bytes:     ${stateBytes}  (sent to each viewer on connect and after every join or quit)`);
const rankingJson = JSON.stringify(ranking);
console.log(`ranking bytes:   ${rankingJson.length}  (one answer; the page reads it every 5 s and after every state message)`);
// What a proxy that compresses would send: one tick, the state and the ranking, gzipped.
const gz = (text: string) => Bun.gzipSync(encoder.encode(text)).length;
const lastTick = JSON.stringify({ type: "tick", tick: ticks[ticks.length - 1], own: null });
console.log(`gzip bytes:      tick ${gz(lastTick)}  state ${gz(JSON.stringify({ type: "state", state }))}  ranking ${gz(rankingJson)}`);
const t3 = performance.now();
for (let i = 0; i < 20; i++) JSON.stringify(ranking);
console.log(`ranking stringify ms: ${((performance.now() - t3) / 20).toFixed(2)}  (the JSON only; the server also builds the 512 rows and the month ranking for each request)`);
if (out !== undefined) {
  writeFileSync(out, JSON.stringify({ state, ticks }));
  console.log(`wrote ${out}`);
}
