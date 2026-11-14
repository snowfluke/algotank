// Shared builders for the stream tests. Not imported by the app.
import type { ArenaSettings, CompactTick, PublicArena, PublicSnapshot, PublicTick } from "@game/arena";
import { PRESETS, STANDARD_RULE_SET_ID, runRound } from "@game/engine";
import type { Decision, Snapshot } from "@game/engine";

export function snapshotAt(tick: number, ticksTotal = 100): PublicSnapshot {
  return { width: 10, height: 10, tick, ticksTotal, survivorsAfterRound: 8, ruleSetId: "standard", bots: [] };
}

/** A turn of a round without tanks in the compact form the server sends; its spawn is snapshotAt(0). */
export function emptyCompactTick(tick: number): CompactTick {
  return { tick, bots: [], moves: [], throws: [] };
}

export function decision(ruleId: string | null, modeId = "m1", nextModeId = modeId): Decision {
  return { botId: "p1", modeId, ruleId, actionId: "throw", move: "T", nextModeId };
}

export const TEST_SETTINGS: ArenaSettings = {
  name: "Test",
  kind: "presenter",
  botFill: false,
  joinPolicy: "anyone",
  ticksPerRound: 100,
  tickMs: 500,
  ruleSetMode: "standard",
  tankCount: 8,
};

export function lobbyArena(): PublicArena {
  return {
    id: "a1",
    settings: TEST_SETTINGS,
    players: [],
    phase: { kind: "lobby", nextRuleSetId: "standard", start: { kind: "waiting" } },
    rounds: [],
    game: 1,
    auto: null,
    nextGameInMs: null,
    chat: "on",
  };
}

/** A public arena in the given phase and rule set mode, for tests of the rule set line and the headings. */
export function arenaIn(
  phase: PublicArena["phase"],
  ruleSetMode: ArenaSettings["ruleSetMode"],
): PublicArena {
  return { ...lobbyArena(), settings: { ...TEST_SETTINGS, ruleSetMode }, phase };
}

/** A real engine round of `count` tanks in the public form, for tests of the compact turns. */
export function engineRound(count: number, turns: number): { spawn: PublicSnapshot; ticks: PublicTick[] } {
  const round = runRound({
    seed: 7,
    ruleSetId: STANDARD_RULE_SET_ID,
    ticksTotal: turns,
    survivorsAfterRound: null,
    players: Array.from({ length: count }, (_, i) => ({ id: `p${i + 1}`, strategy: (PRESETS[i % PRESETS.length] ?? PRESETS[0])!.strategy })),
  });
  const pub = (s: Snapshot): PublicSnapshot => ({
    width: s.width,
    height: s.height,
    tick: s.tick,
    ticksTotal: s.ticksTotal,
    survivorsAfterRound: s.survivorsAfterRound,
    ruleSetId: s.ruleSetId,
    bots: s.bots.map((b) => ({ id: b.id, x: b.x, y: b.y, direction: b.direction, score: b.score, wasHit: b.wasHit, build: b.build, hitsLanded: b.hitsLanded, hitsTaken: b.hitsTaken, water: b.water })),
  });
  return {
    spawn: pub(round.spawn),
    ticks: round.ticks.map((t) => ({ tick: t.tick, order: t.order, moves: t.decisions.map((d) => ({ botId: d.botId, move: d.move })), throws: t.throws, snapshot: pub(t.snapshot) })),
  };
}
