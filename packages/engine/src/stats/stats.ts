// A tank's statistics (docs/specs/revamp/81-metrics.md, K2): what its rules did. The one
// place that decides what counts, used by the server's round runner, the monthly league's
// day round and the Try it match in the browser.
//
// Running totals of a fixed size: a turn adds to the numbers and to one rule's count, and
// nothing is kept per turn, so a day-long league round costs the same as a short one. The
// list of rule counts holds at most one entry per rule and per "If no rule fits" of the
// strategies that played, which LIMITS bounds.
//
// What counts:
// | Number        | One turn adds                                                              |
// |---------------|----------------------------------------------------------------------------|
// | turns         | 1                                                                          |
// | shots         | 1 for an aimed throw that could fire, including blocks and dodges           |
// | hits          | 1 for a throw that hit                                                     |
// | timesHit      | the throws of other tanks that hit this tank on this turn                  |
// | squaresMoved  | the distance between the square before the turn and after it               |
// | uses          | 1 to the rule that ran in its mode, or to the mode's "If no rule fits"     |
// | ultimateTurns | 1 for each ultimate fire, tracked outside rule uses and spin turns          |
// Statistics only read a turn's result; they never change how a round plays.

import type { BotId, BotState, Decision, Snapshot, StrategyInput, TickResult } from "../types.ts";

/** How many turns one rule ran. `ruleId` null is the mode's "If no rule fits". Rule ids are unique within a mode only. */
export interface RuleUse {
  readonly modeId: string;
  readonly ruleId: string | null;
  readonly turns: number;
}

/** The numbers of a tank's statistics, without the rules. */
export interface StatsNumbers {
  readonly turns: number;
  readonly shots: number;
  readonly hits: number;
  readonly timesHit: number;
  readonly squaresMoved: number;
  /** Turns in which no rule ran, so "If no rule fits" did. */
  readonly noRuleTurns: number;
  /** Present when the tank fired an ultimate, or defaulted to zero when read from the wire. */
  readonly ultimateTurns?: number;
}

/** The running totals of one tank. Read the numbers with statsNumbers, the rules with statsView. */
export interface TankStats {
  readonly turns: number;
  readonly shots: number;
  readonly hits: number;
  readonly timesHit: number;
  readonly squaresMoved: number;
  readonly uses: readonly RuleUse[];
  /** Present after the tank has fired an ultimate. */
  readonly ultimateTurns?: number;
}

/** What one turn did for one tank, read from the turn's result (turnsOf). */
export interface TankTurn {
  readonly decision: Decision;
  readonly shot: "hit" | "miss" | null;
  readonly timesHit: number;
  readonly squaresMoved: number;
}

/** The rules of a strategy with their counts, in the strategy's order, for a screen. */
export interface StatsView extends StatsNumbers {
  /** One entry per mode of the strategy, in order. */
  readonly modes: readonly ModeStats[];
  /** Turns a pinwheel or whirlwind spun the tank round. */
  readonly spinTurns: number;
}

export interface ModeStats {
  readonly name: string;
  /** Turns each rule of the mode ran, in the mode's order: index 0 is rule 1. */
  readonly rules: readonly number[];
  /** Turns the mode's "If no rule fits" ran. */
  readonly fallback: number;
}

export const EMPTY_STATS: TankStats = { turns: 0, shots: 0, hits: 0, timesHit: 0, squaresMoved: 0, uses: [] };
export const EMPTY_NUMBERS: StatsNumbers = { turns: 0, shots: 0, hits: 0, timesHit: 0, squaresMoved: 0, noRuleTurns: 0 };

/**
 * What the turn did for each tank of `before`, in one pass. `before` is the snapshot the
 * turn was played from (the round's snapshot just before stepRound), because the result
 * holds only the snapshot after it and a blocked step forward does not move the tank.
 */
export function turnsOf(before: Snapshot, result: TickResult): Map<BotId, TankTurn> {
  const after = result.snapshot.bots;
  if (before.bots.length !== after.length || result.decisions.length !== after.length) {
    throw new Error(`turn ${result.tick} does not line up with the snapshot it was played from`);
  }
  const shots = new Map<BotId, "hit" | "miss">();
  const hitsOn = new Map<BotId, number>();
  for (const event of result.throws) {
    if (event.outcome === "empty" || event.outcome === "dry") continue;
    // A deflected shot counts as a miss for the shooter, even when smoke hits another tank.
    shots.set(event.throwerId, event.outcome === "hit" ? "hit" : "miss");
    const hit = event.outcome === "hit" ? event.targetId
      : event.outcome === "deflected" && event.deflection === "hit" ? event.deflectedTo : undefined;
    if (hit !== undefined) hitsOn.set(hit, (hitsOn.get(hit) ?? 0) + 1);
  }
  const turns = new Map<BotId, TankTurn>();
  before.bots.forEach((was, i) => {
    const now = after[i];
    const decision = result.decisions[i];
    if (now === undefined || decision === undefined || now.id !== was.id || decision.botId !== was.id) {
      throw new Error(`turn ${result.tick} does not line up for tank "${was.id}"`);
    }
    turns.set(was.id, { decision, shot: shots.get(was.id) ?? null, timesHit: hitsOn.get(was.id) ?? 0, squaresMoved: squaresBetween(was, now) });
  });
  return turns;
}

function squaresBetween(a: Pick<BotState, "x" | "y">, b: Pick<BotState, "x" | "y">): number {
  // A diagonal step is one square, as everywhere in the game (Chebyshev).
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}

/** The totals after one more turn. */
export function addTurn(stats: TankStats, turn: TankTurn): TankStats {
  const { modeId, ruleId } = turn.decision;
  const at = stats.uses.findIndex((use) => use.modeId === modeId && use.ruleId === ruleId);
  const fired = turn.decision.ultimate !== undefined;
  const ultimateTurns = (stats.ultimateTurns ?? 0) + (fired ? 1 : 0);
  // Whole-turn totals count spins and ultimate fires separately from rule uses.
  // ponytail: Rule-fired ultimates carry a rule id (85-ultimates.md, owner 2026-11-19).
  // Showing them under both the rule and the ultimate needs the totals to account for the overlap.
  const uses =
    turn.decision.spin === true || fired
      ? stats.uses
      : at === -1
      ? [...stats.uses, { modeId, ruleId, turns: 1 }]
      : stats.uses.map((use, i) => (i === at ? { ...use, turns: use.turns + 1 } : use));
  return {
    turns: stats.turns + 1,
    shots: stats.shots + (turn.shot === null ? 0 : 1),
    hits: stats.hits + (turn.shot === "hit" ? 1 : 0),
    timesHit: stats.timesHit + turn.timesHit,
    squaresMoved: stats.squaresMoved + turn.squaresMoved,
    uses,
    ...(ultimateTurns === 0 ? {} : { ultimateTurns }),
  };
}

/** The totals of a whole round played by `botId`, from its spawn and its turns (the Try it match, tests). */
export function statsOfRound(spawn: Snapshot, ticks: readonly TickResult[], botId: BotId): TankStats {
  let stats = EMPTY_STATS;
  let before = spawn;
  for (const tick of ticks) {
    const turn = turnsOf(before, tick).get(botId);
    if (turn === undefined) throw new Error(`turn ${tick.tick} has no tank "${botId}"`);
    stats = addTurn(stats, turn);
    before = tick.snapshot;
  }
  return stats;
}

export function statsNumbers(stats: TankStats): StatsNumbers {
  const noRuleTurns = stats.uses.reduce((sum, use) => sum + (use.ruleId === null ? use.turns : 0), 0);
  return {
    turns: stats.turns, shots: stats.shots, hits: stats.hits, timesHit: stats.timesHit, squaresMoved: stats.squaresMoved, noRuleTurns,
    ...(stats.ultimateTurns === undefined ? {} : { ultimateTurns: stats.ultimateTurns }),
  };
}

/** The sum of two sets of numbers: a game's numbers over its rounds. */
export function addNumbers(a: StatsNumbers, b: StatsNumbers): StatsNumbers {
  const ultimateTurns = (a.ultimateTurns ?? 0) + (b.ultimateTurns ?? 0);
  return {
    turns: a.turns + b.turns,
    shots: a.shots + b.shots,
    hits: a.hits + b.hits,
    timesHit: a.timesHit + b.timesHit,
    squaresMoved: a.squaresMoved + b.squaresMoved,
    noRuleTurns: a.noRuleTurns + b.noRuleTurns,
    ...(ultimateTurns === 0 ? {} : { ultimateTurns }),
  };
}

/**
 * The totals as a screen shows them: the numbers, and each rule of `strategy` (the one that
 * played) by its place in its mode. A count of a rule the strategy no longer has is left out
 * of the rows; it still counts in the numbers.
 */
export function statsView(stats: TankStats, strategy: StrategyInput): StatsView {
  const turnsOfRule = (modeId: string, ruleId: string | null): number =>
    stats.uses.find((use) => use.modeId === modeId && use.ruleId === ruleId)?.turns ?? 0;
  return {
    ...statsNumbers(stats),
    modes: strategy.modes.map((mode) => ({
      name: mode.name,
      rules: mode.rules.map((rule) => turnsOfRule(mode.id, rule.id)),
      fallback: turnsOfRule(mode.id, null),
    })),
    spinTurns: stats.turns - (stats.ultimateTurns ?? 0) - stats.uses.reduce((sum, use) => sum + use.turns, 0),
  };
}
