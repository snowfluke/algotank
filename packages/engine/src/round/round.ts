// The round loop: spawn, step, standings.
//
// Random draw order. It is part of the rules, because the same seed must give
// the same round. All draws come from one generator:
//   createRound: for each player in config order, one spawn cell (int) and one
//                direction (int); then one tie-break number (next) per player.
//   stepRound:   the draws of decide() for each bot in snapshot order. A spin, sequence
//                step or ultimate fire skips decide and draws nothing at this point. Then the
//                shuffle of the move order; then one chance roll for each throw (including
//                the shot after a dash) that has a target and enough water or a free shot,
//                in move order. A dry throw or a throw at a dashing tank draws nothing.
//                Smoke changes the same roll.
//                Then one chance for each pinwheel or mud ball taken on the turn (its
//                backfire, items/items.ts pickUp), and, in a round with items on and only on
//                a spawn turn, one int for the item's kind and one int for its square
//                (spawnItems, once per item it adds). A round with items off has no item,
//                so it draws neither. After all these draws, fire order gives the ultimate
//                draws: Splash rolls once per smoked tank in the ring, clockwise from the front.
//   joinRound:   one spawn cell (int) among the free cells, one direction (int), one
//                tie-break number (next). leaveRound draws nothing.
//
// An open round (createOpenRound) is a round of the monthly league
// (docs/specs/revamp/77-monthly-league.md): it starts with no tank on a board sized for a
// fixed number of tanks, and tanks join and leave between turns. Tank of an open round:
// | From       | To         | Actor            | Guard                                          |
// |------------|------------|------------------|------------------------------------------------|
// | (none)     | playing    | caller: joinRound| between turns; the id is new; a free cell left |
// | playing    | (none)     | caller: leaveRound| between turns; the id is on the board         |
// A tank that leaves loses its place in a running sequence and its tie-break number. A round
// that never calls joinRound or leaveRound draws exactly what it drew before they existed.

import { DIRECTIONS } from "../types.ts";
import type {
  BotId,
  BotState,
  Build,
  Decision,
  Direction,
  Rng,
  RoundConfig,
  RoundPlayer,
  RoundState,
  Snapshot,
  Standing,
  Strategy,
  TankEffect,
  ThrowEvent,
  TickResult,
  UltimateFire,
} from "../types.ts";
import { ruleSet, type RuleSetId } from "../combat/rule-sets.ts";
import { countDown, itemHandOf, newEffect, spinDecision, spinsThisTurn } from "../items/items.ts";
import { ULTIMATE_RULES, chargeAfterTurn, ultimateDecision, ultimateEffectAfterTurn, type UltimateId } from "../ultimates/ultimates.ts";
import { decide } from "../strategy/decide.ts";
import { continueSequence, runningAfter, type RunningSequence } from "../strategy/sequence.ts";
import { allCells, arenaSize, cellKey, type Cell } from "./grid.ts";
import { createRng } from "./rng.ts";
import { resolveTick } from "./resolve.ts";
import type { Placement } from "./resolve.ts";

/**
 * The state createRound returns. The public fields are RoundState. The rest
 * stays out of the contract: the generator, the strategies, and the tie-break
 * numbers that make standings() a pure function of the state.
 */
class RoundRuntime implements RoundState {
  snapshot: Snapshot;
  /** The bots in the middle of a sequence (strategy/sequence.ts). Round state, so a replay of the config is identical. */
  readonly sequences = new Map<BotId, RunningSequence>();

  constructor(
    readonly config: RoundConfig,
    spawn: Snapshot,
    readonly rng: Rng,
    /** Changed only by joinRound and leaveRound. */
    readonly strategies: Map<BotId, Strategy>,
    /** Changed only by joinRound and leaveRound. */
    readonly tieBreaks: Map<BotId, number>,
  ) {
    this.snapshot = spawn;
  }

  get isOver(): boolean {
    return this.snapshot.tick >= this.config.ticksTotal;
  }
}

function runtimeOf(state: RoundState): RoundRuntime {
  if (!(state instanceof RoundRuntime)) throw new Error("state was not created by createRound");
  return state;
}

export function createRound(config: RoundConfig): RoundState {
  if (config.players.length < 2) throw new Error("a round needs at least 2 players");
  if (new Set(config.players.map((p) => p.id)).size !== config.players.length) {
    throw new Error("player ids must be unique");
  }
  if (!Number.isSafeInteger(config.ticksTotal) || config.ticksTotal < 1) {
    throw new Error(`ticksTotal must be a positive integer, got ${config.ticksTotal}`);
  }

  const rules = ruleSet(config.ruleSetId);
  const rng = createRng(config.seed);
  const { width, height } = arenaSize(config.players.length, rules);

  const freeCells = allCells({ width, height });
  const bots: BotState[] = config.players.map(({ id, strategy }) => {
    const [cell] = freeCells.splice(rng.int(freeCells.length), 1);
    const direction = DIRECTIONS[rng.int(DIRECTIONS.length)];
    const firstMode = strategy.modes[0];
    if (cell === undefined || direction === undefined || firstMode === undefined) {
      throw new Error(`could not place player "${id}"`);
    }
    return spawnedBot(id, cell, direction, firstMode.id, strategy.build, 0, rules.waterCapacity, config.ultimates ? strategy.ultimate : undefined);
  });

  const tieBreaks = new Map<BotId, number>();
  for (const bot of bots) tieBreaks.set(bot.id, rng.next());

  const spawn: Snapshot = {
    width,
    height,
    tick: 0,
    ticksTotal: config.ticksTotal,
    survivorsAfterRound: config.survivorsAfterRound,
    ruleSetId: config.ruleSetId,
    bots,
    items: [],
  };
  const strategies = new Map(config.players.map((p) => [p.id, p.strategy] as const));
  return new RoundRuntime(config, spawn, rng, strategies, tieBreaks);
}

/** A tank as it spawns: full water, nothing happened to it yet. `score` is 0 except for a tank that resumes its day (joinRound). */
function spawnedBot(id: BotId, cell: Cell, direction: Direction, modeId: string, build: Build, score: number, water: number, ultimate: UltimateId | undefined): BotState {
  // The key order is the order of every stored snapshot; keep it.
  return {
    id,
    x: cell.x,
    y: cell.y,
    direction,
    score,
    wasHit: false,
    lastHitBy: null,
    ticksSinceHit: null,
    lastMove: null,
    modeId,
    build,
    ticksInMode: 0,
    hitsLanded: 0,
    hitsTaken: 0,
    ticksSinceLandedHit: null,
    water,
    item: null,
    itemUses: 0,
    effect: null,
    ...(ultimate === undefined ? {} : { ultimate: { id: ultimate, kind: "charging", turnsLeft: ULTIMATE_RULES.firstReadyTurn }, ultimateEffect: null }),
  };
}

/** An open round: no tank at the start, a board that never changes size. See the header. */
export interface OpenRoundConfig {
  /** A safe integer. */
  readonly seed: number;
  /** The turns planned for the round; the "time left" condition reads it. */
  readonly ticksTotal: number;
  readonly ruleSetId: RuleSetId;
  /** The board is sized for this many tanks (arenaSize) and keeps that size when tanks come and go. */
  readonly boardFor: number;
  /** As RoundConfig.items. */
  readonly items: boolean;
  readonly ultimates: boolean;
}

/**
 * Creates a round that tanks join with joinRound. Its `config.players` stays empty, so it
 * cannot be replayed from its config: the joins and leaves are not part of the config.
 */
export function createOpenRound(config: OpenRoundConfig): RoundState {
  if (!Number.isSafeInteger(config.ticksTotal) || config.ticksTotal < 1) {
    throw new Error(`ticksTotal must be a positive integer, got ${config.ticksTotal}`);
  }
  const rules = ruleSet(config.ruleSetId);
  const { width, height } = arenaSize(config.boardFor, rules);
  const roundConfig: RoundConfig = { seed: config.seed, ticksTotal: config.ticksTotal, survivorsAfterRound: null, ruleSetId: config.ruleSetId, players: [], items: config.items, ultimates: config.ultimates };
  const spawn: Snapshot = { width, height, tick: 0, ticksTotal: config.ticksTotal, survivorsAfterRound: null, ruleSetId: config.ruleSetId, bots: [], items: [] };
  return new RoundRuntime(roundConfig, spawn, createRng(config.seed), new Map(), new Map());
}

/**
 * Puts a tank on a free square between two turns; it plays from the next stepRound. `score`
 * is the points it starts with: 0, or the points of today for a tank that resumes after a
 * restart. Returns the tank as placed. Throws when the id is on the board or no square is free.
 */
export function joinRound(state: RoundState, player: RoundPlayer, score = 0): BotState {
  const round = runtimeOf(state);
  if (!Number.isSafeInteger(score)) throw new Error(`score must be a whole number, got ${score}`);
  const before = round.snapshot;
  if (before.bots.some((bot) => bot.id === player.id)) throw new Error(`player "${player.id}" is already in the round`);
  // A joining tank never lands on an item: it would take it without driving there.
  const taken = new Set([...before.bots, ...before.items].map(cellKey));
  const freeCells = allCells(before).filter((cell) => !taken.has(cellKey(cell)));
  if (freeCells.length === 0) throw new Error(`no free square is left for player "${player.id}"`);
  const cell = freeCells[round.rng.int(freeCells.length)];
  const direction = DIRECTIONS[round.rng.int(DIRECTIONS.length)];
  const firstMode = player.strategy.modes[0];
  if (cell === undefined || direction === undefined || firstMode === undefined) throw new Error(`could not place player "${player.id}"`);
  // The tie-break number also settles target ties in this round (BotState.tieRank), so a join draws nothing more.
  const tieRank = round.rng.next();
  const ultimate = round.config.ultimates ? player.strategy.ultimate : undefined;
  const bot: BotState = { ...spawnedBot(player.id, cell, direction, firstMode.id, player.strategy.build, score, ruleSet(before.ruleSetId).waterCapacity, ultimate), tieRank };
  round.tieBreaks.set(player.id, tieRank);
  round.strategies.set(player.id, player.strategy);
  round.snapshot = { ...before, bots: [...before.bots, bot] };
  return bot;
}

/** Takes a tank off the board between two turns, with its running sequence. Throws when the id is not on the board. */
export function leaveRound(state: RoundState, id: BotId): void {
  const round = runtimeOf(state);
  const before = round.snapshot;
  if (!before.bots.some((bot) => bot.id === id)) throw new Error(`player "${id}" is not in the round`);
  round.snapshot = { ...before, bots: before.bots.filter((bot) => bot.id !== id) };
  round.strategies.delete(id);
  round.tieBreaks.delete(id);
  round.sequences.delete(id);
}

/**
 * Gives a tank on the board new rules between two turns. It keeps its square, facing, points,
 * water, item, effects, ultimate and hit history, so new rules are never a way out of danger or a refill
 * (monthly "Ubah aturan", owner 2026-11-16). It starts in the new strategy's first mode, with the
 * new strategy's upgrades and no running step sequence. Throws when the id is not on the board.
 */
export function replaceStrategy(state: RoundState, id: BotId, strategy: Strategy): BotState {
  const round = runtimeOf(state);
  const before = round.snapshot;
  const old = before.bots.find((bot) => bot.id === id);
  const firstMode = strategy.modes[0];
  if (old === undefined) throw new Error(`player "${id}" is not in the round`);
  if (firstMode === undefined) throw new Error(`the strategy of player "${id}" has no mode`);
  const bot: BotState = { ...old, modeId: firstMode.id, ticksInMode: 0, build: strategy.build };
  round.strategies.set(id, strategy);
  round.sequences.delete(id);
  round.snapshot = { ...before, bots: before.bots.map((b) => (b.id === id ? bot : b)) };
  return bot;
}

/** What an open round holds per tank, so a test can check that nothing grows turn by turn. Not part of the engine's interface. */
export function roundHoldings(state: RoundState): { readonly tanks: number; readonly strategies: number; readonly tieBreaks: number; readonly sequences: number } {
  const round = runtimeOf(state);
  return { tanks: round.snapshot.bots.length, strategies: round.strategies.size, tieBreaks: round.tieBreaks.size, sequences: round.sequences.size };
}

/** Advances the round by one tick and returns what happened. It throws when the round is over. */
export function stepRound(state: RoundState): TickResult {
  const round = runtimeOf(state);
  if (round.isOver) throw new Error("the round is over");
  const before = round.snapshot;

  // 1. Every bot decides from the snapshot taken before this tick.
  const decisions: Decision[] = before.bots.map((bot) => {
    const strategy = round.strategies.get(bot.id);
    if (strategy === undefined) throw new Error(`no strategy for bot "${bot.id}"`);
    const ctx = { self: bot, snapshot: before };
    const running = round.sequences.get(bot.id);
    // A spinning tank checks no rule and draws nothing; its running sequence ends (runningAfter sees no step).
    const decision = spinsThisTurn(bot) ? spinDecision(bot)
      : running !== undefined ? continueSequence(ctx, running, round.rng)
      : ultimateDecision(before, bot) ?? decide(ctx, strategy, round.rng);
    const after = runningAfter(decision, strategy);
    if (after === null) round.sequences.delete(bot.id);
    else round.sequences.set(bot.id, after);
    return decision;
  });

  // 2. A random order decides who moves first.
  const order = round.rng.shuffle(before.bots.map((bot) => bot.id));

  // 3. Moves, then item draws, then the queued Splash rolls.
  const { placements, throws, inflicted, fires, items, pickups, backfires } = resolveTick(before, decisions, order, round.rng,
    { items: before.items, tick: before.tick, spawn: round.config.items });

  // 4. Next snapshot.
  const hits = tallyHits(throws, fires);
  const ends = before.tick + 1 >= round.config.ticksTotal;
  const next: Snapshot = {
    ...before,
    tick: before.tick + 1,
    // A backfire from a pickup replaces an effect given during the moves.
    bots: before.bots.map((bot, i) => {
      const backfire = backfires.get(bot.id);
      const effect = backfire === undefined ? inflicted.get(bot.id) ?? null : newEffect(backfire, bot.ultimate !== undefined);
      return nextBotState(bot, placements[i], decisions[i], hits, effect, ends);
    }),
    items,
  };
  round.snapshot = next;

  return { tick: before.tick, order, decisions, throws, pickups, ...(round.config.ultimates ? { fires } : {}), snapshot: next };
}

/** What the throws of one tick did to each bot. A bot can be hit more than once in a tick. */
interface HitTally {
  readonly landed: ReadonlyMap<BotId, number>;
  readonly taken: ReadonlyMap<BotId, number>;
  /** The thrower of the last hit on each bot this tick, in resolution order. */
  readonly lastHitBy: ReadonlyMap<BotId, BotId>;
}

function tallyHits(throws: readonly ThrowEvent[], fires: readonly UltimateFire[]): HitTally {
  const landed = new Map<BotId, number>();
  const taken = new Map<BotId, number>();
  const lastHitBy = new Map<BotId, BotId>();
  function add(throwerId: BotId, targetId: BotId): void {
    landed.set(throwerId, (landed.get(throwerId) ?? 0) + 1);
    taken.set(targetId, (taken.get(targetId) ?? 0) + 1);
    lastHitBy.set(targetId, throwerId);
  }
  for (const event of throws) if (event.outcome === "hit") add(event.throwerId, event.targetId);
  for (const fire of fires) {
    if (fire.kind !== "splash") continue;
    for (const square of fire.squares) if (square.outcome === "hit") add(fire.botId, square.targetId);
  }
  return { landed, taken, lastHitBy };
}

function nextBotState(
  bot: BotState,
  placement: Placement | undefined,
  decision: Decision | undefined,
  hits: HitTally,
  inflicted: TankEffect | null,
  ends: boolean,
): BotState {
  if (placement === undefined || decision === undefined || placement.id !== bot.id || decision.botId !== bot.id) {
    throw new Error(`tick results do not line up for bot "${bot.id}"`);
  }
  const hitter = hits.lastHitBy.get(bot.id);
  const wasHit = hitter !== undefined;
  const landedNow = hits.landed.get(bot.id) ?? 0;
  const { ultimate, ultimateEffect: _previousUltimateEffect, itemsWaiting: _previousQueue, ...withoutUltimate } = bot;
  return {
    ...withoutUltimate,
    x: placement.x,
    y: placement.y,
    direction: placement.direction,
    score: placement.score,
    water: placement.water,
    wasHit,
    lastHitBy: hitter ?? bot.lastHitBy,
    // 0 on the tick after a hit, so wasHit is true exactly when this is 0.
    ticksSinceHit: wasHit ? 0 : bot.ticksSinceHit === null ? null : bot.ticksSinceHit + 1,
    lastMove: decision.move,
    modeId: decision.nextModeId,
    ticksInMode: decision.nextModeId === bot.modeId ? bot.ticksInMode + 1 : 0,
    hitsLanded: bot.hitsLanded + landedNow,
    hitsTaken: bot.hitsTaken + (hits.taken.get(bot.id) ?? 0),
    // 0 on the tick after a landed hit, like ticksSinceHit.
    ticksSinceLandedHit:
      landedNow > 0 ? 0 : bot.ticksSinceLandedHit === null ? null : bot.ticksSinceLandedHit + 1,
    ...itemHandOf(placement),
    itemUses: placement.itemUses,
    // The effect from before the tick counts down; a hit on this tick starts a new one in its place.
    effect: inflicted ?? countDown(bot.effect),
    ...(ultimate === undefined || ends ? {} : {
      ultimate: chargeAfterTurn(ultimate, decision.ultimate),
      ultimateEffect: ultimateEffectAfterTurn(placement.ultimateEffect ?? null),
    }),
  };
}

export function runRound(config: RoundConfig): { spawn: Snapshot; ticks: TickResult[]; standings: Standing[] } {
  const state = createRound(config);
  const spawn = state.snapshot;
  const ticks: TickResult[] = [];
  while (!state.isOver) ticks.push(stepRound(state));
  return { spawn, ticks, standings: standings(state) };
}

/**
 * Highest score first. A tie goes to the bot with more hits landed, then to the
 * lower tie-break number drawn in createRound.
 */
export function standings(state: RoundState): Standing[] {
  const round = runtimeOf(state);
  const tieBreak = (id: BotId): number => {
    const value = round.tieBreaks.get(id);
    if (value === undefined) throw new Error(`no tie-break number for bot "${id}"`);
    return value;
  };
  return [...round.snapshot.bots]
    .sort((a, b) => b.score - a.score || b.hitsLanded - a.hitsLanded || tieBreak(a.id) - tieBreak(b.id))
    .map((bot, i) => ({ botId: bot.id, score: bot.score, rank: i + 1, hitsLanded: bot.hitsLanded, hitsTaken: bot.hitsTaken }));
}
