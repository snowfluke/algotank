// Records one engine round to a JSON file in the compact turn form, so the kit's
// pane harness can replay a large round (512 tanks) without computing it in the
// browser: `/kit?show=board&pane=running&players=512&round=<url of the file>`.
// Usage: bun apps/web/scripts/record-round.ts <players> <out.json> [turns]
// The file holds { players, spawn, ticks (CompactTick[]), own (the decisions of p1) }.

import { compactTick, isFinalRound, survivorCount } from "@game/arena";
import type { PublicSnapshot, PublicTick } from "@game/arena";
import { PRESETS, STANDARD_RULE_SET_ID, runRound } from "@game/engine";
import type { Snapshot } from "@game/engine";

const [countArg, out, turnsArg] = process.argv.slice(2);
const count = Number(countArg);
const turns = Number(turnsArg ?? "90");
if (!Number.isSafeInteger(count) || count < 2 || out === undefined || !Number.isSafeInteger(turns)) {
  throw new Error("usage: bun apps/web/scripts/record-round.ts <players> <out.json> [turns]");
}

function publicSnapshot(s: Snapshot): PublicSnapshot {
  return {
    width: s.width,
    height: s.height,
    tick: s.tick,
    ticksTotal: s.ticksTotal,
    survivorsAfterRound: s.survivorsAfterRound,
    ruleSetId: s.ruleSetId,
    bots: s.bots.map((b) => ({ id: b.id, x: b.x, y: b.y, direction: b.direction, score: b.score, wasHit: b.wasHit, build: b.build, hitsLanded: b.hitsLanded, hitsTaken: b.hitsTaken, water: b.water })),
  };
}

const started = performance.now();
const round = runRound({
  seed: 2026,
  ruleSetId: STANDARD_RULE_SET_ID,
  ticksTotal: turns,
  survivorsAfterRound: isFinalRound(count) ? null : survivorCount(count),
  players: Array.from({ length: count }, (_, i) => {
    const preset = PRESETS[i % PRESETS.length];
    if (preset === undefined) throw new Error("The engine has no play styles.");
    return { id: `p${i + 1}`, strategy: preset.strategy };
  }),
});
const spawn = publicSnapshot(round.spawn);
const order = spawn.bots.map((b) => b.id);
const ticks = round.ticks.map((t) => {
  const tick: PublicTick = { tick: t.tick, order: t.order, moves: t.decisions.map((d) => ({ botId: d.botId, move: d.move })), throws: t.throws, snapshot: publicSnapshot(t.snapshot) };
  return compactTick(tick, order);
});
const own = round.ticks.map((t) => t.decisions.find((d) => d.botId === "p1") ?? null);
await Bun.write(out, JSON.stringify({ players: count, spawn, ticks, own }));
const ms = performance.now() - started;
console.log(`${count} tanks, ${ticks.length} turns, ${(ms / ticks.length).toFixed(0)} ms per turn, ${(Bun.file(out).size / 1024).toFixed(0)} KB`);
