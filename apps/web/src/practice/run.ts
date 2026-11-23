// A practice round: the player's strategy against built-in bots, run in the
// browser with the engine. The setup rules (how many opponents, which mix,
// how a round is cut) live here, so the screen only reads and shows them.

import { ARENA_LAYOUT_IDS, changeRoundRules, createOpenRound, createRng, handicapOf, isArenaLayoutId, RULE_SET_IDS, joinRound, PRESETS, runRound, standings as standingsOf, statsOfRound, stepRound, addTurn, EMPTY_STATS, turnsOf } from "@game/engine";
import type { ArenaLayoutId, ArenaConditionId, BotId, Rng, RoundConfig, RoundPlayer, Snapshot, Standing, Strategy, TankStats, TickResult } from "@game/engine";
import { isFinalRound, survivorCount, ultimatesOn } from "@game/arena";
import type { TankInfo } from "../board/props.ts";
import { TANK_COLOURS } from "../tank/colours.ts";
import { plainTankLook, type TankLook } from "../tank/look.ts";

export const PLAYER_ID: BotId = "you";

export const OPPONENTS_MIN = 1;
export const OPPONENTS_MAX = 15;
export const OPPONENTS_DEFAULT = 7;
/** Turns per test match for each length the player can pick. The player sees the words, never the numbers. */
export const MATCH_LENGTHS = { short: 40, normal: 80, long: 160 } as const;
export type MatchLength = keyof typeof MATCH_LENGTHS;
export const MATCH_LENGTH_IDS: readonly MatchLength[] = ["short", "normal", "long"];
export const TICKS_DEFAULT = MATCH_LENGTHS.normal;

/** A play style as the engine lists it, with its id typed as a PresetId. */
export type PlayStylePreset = (typeof PRESETS)[number];

/** "eachOnce" cycles through PRESETS in table order. "only" fills every place with one preset. */
export type OpponentMix =
  | { readonly kind: "eachOnce" }
  | { readonly kind: "only"; readonly presetId: string };

export function pickOpponents(count: number, mix: OpponentMix): PlayStylePreset[] {
  if (!Number.isInteger(count) || count < OPPONENTS_MIN || count > OPPONENTS_MAX) {
    throw new Error(`Opponents must be a whole number from ${OPPONENTS_MIN} to ${OPPONENTS_MAX}.`);
  }
  if (mix.kind === "only") {
    const preset = PRESETS.find((candidate) => candidate.id === mix.presetId);
    if (preset === undefined) throw new Error(`There is no preset "${mix.presetId}".`);
    return Array.from({ length: count }, () => preset);
  }
  return Array.from({ length: count }, (_, index) => {
    const preset = PRESETS[index % PRESETS.length];
    if (preset === undefined) throw new Error("There are no presets.");
    return preset;
  });
}

/** A preset that fills more than one place gets a number, so the scoreboard rows differ. */
function opponentNames(opponents: readonly PlayStylePreset[], styleName: (preset: PlayStylePreset) => string): string[] {
  const total = new Map<string, number>();
  for (const preset of opponents) total.set(preset.id, (total.get(preset.id) ?? 0) + 1);
  const seen = new Map<string, number>();
  return opponents.map((preset) => {
    const number = (seen.get(preset.id) ?? 0) + 1;
    seen.set(preset.id, number);
    const name = styleName(preset);
    return (total.get(preset.id) ?? 0) > 1 ? `${name} ${number}` : name;
  });
}

/** Draws a seed. Call it from a click handler only: the engine never draws its own seed. */
export function drawSeed(): number {
  return crypto.getRandomValues(new Uint32Array(1))[0] ?? 0;
}

/** The share of draws of "random" that give a mixed arena: the monthly arena's first draw of a day (apps/server league-day.ts, drawCondition). */
const MIXED_ARENA_PERCENT = 20;
/**
 * "Random" draws a new condition every this many turns, so a test match of 80 to 160 turns sees the weather change one
 * to three times, as a league day does every 333 turns (RESHUFFLE_TURNS; owner, 2026-11-23: "the arena didn't change
 * mid test").
 */
export const RANDOM_CHANGE_TURNS = 40;

/** One draw of the "random" round rules: a mixed arena at the league's first-draw odds, otherwise a single condition. */
export function drawCondition(rng: Rng): ArenaConditionId {
  const list: readonly ArenaConditionId[] = rng.int(100) < MIXED_ARENA_PERCENT ? ARENA_LAYOUT_IDS : RULE_SET_IDS;
  const id = list[rng.int(list.length)];
  if (id === undefined) throw new Error("The engine has no arena condition to draw.");
  return id;
}

export interface PracticeSettings {
  readonly strategy: Strategy;
  readonly name: string;
  readonly opponents: number;
  readonly mix: OpponentMix;
  readonly ticks: number;
  readonly seed: number;
  readonly nowMs: number;
  /** A single condition, a mixed arena of the league, or "random": a new draw every RANDOM_CHANGE_TURNS turns (runOpen). */
  readonly ruleSetId: ArenaConditionId | "random";
  /** The name a bot shows, from its play style, so the names follow the page language. Default: the engine's English name. */
  readonly styleName?: (preset: PlayStylePreset) => string;
}

export interface PracticeRun {
  readonly seed: number;
  readonly ticksTotal: number;
  /** The strategy that ran, kept so sentences describe what ran even after the player edits. */
  readonly strategy: Strategy;
  readonly names: Readonly<Record<BotId, string>>;
  readonly spawn: Snapshot;
  readonly ticks: readonly TickResult[];
  readonly standings: readonly Standing[];
  readonly player: Standing;
  /** What the player's rules did, counted turn by turn from the board each turn was played from (matchStats). */
  readonly stats: TankStats;
}

export function runPractice(settings: PracticeSettings): PracticeRun {
  const opponents = pickOpponents(settings.opponents, settings.mix);
  const playerCount = opponents.length + 1;
  // The Try it match plays the arena's handicap of built-in styles too, so it shows what the arena would.
  const players: RoundPlayer[] = [{ id: PLAYER_ID, strategy: settings.strategy }, ...opponents.map((preset, index) => ({ id: `bot-${index + 1}`, strategy: preset.strategy }))].map(
    (player) => {
      const handicap = handicapOf(player.strategy, "room");
      return handicap === undefined ? player : { ...player, handicap };
    },
  );
  const names: Record<BotId, string> = { [PLAYER_ID]: settings.name };
  opponentNames(opponents, settings.styleName ?? ((preset) => preset.name)).forEach((name, index) => {
    names[`bot-${index + 1}`] = name;
  });
  const condition = settings.ruleSetId;
  const { spawn, ticks, standings, stats } = condition === "random" || isArenaLayoutId(condition) ? runOpen(settings, condition, players) : runSingle(singleConfig(settings, condition, players, playerCount));
  const player = standings.find((standing) => standing.botId === PLAYER_ID);
  if (player === undefined) throw new Error("The player is missing from the standings.");
  return { seed: settings.seed, ticksTotal: settings.ticks, strategy: settings.strategy, names, spawn, ticks, standings, player, stats };
}

/**
 * A mixed arena exists only in the league's open rounds (createOpenRound), and only an open round changes its condition
 * between turns (changeRoundRules), so these matches are one: seeded from the match's seed, every tank joined before the
 * first turn, and no cut line, as in the league. "Random" draws from its own seeded source, so a seed is the same match.
 */
type PlayedMatch = { spawn: Snapshot; ticks: TickResult[]; standings: Standing[]; stats: TankStats };

/** A single condition: one seeded round, whose turns follow each other, so the statistics read them in a row. */
function runSingle(config: RoundConfig): PlayedMatch {
  const { spawn, ticks, standings } = runRound(config);
  return { spawn, ticks, standings, stats: statsOfRound(spawn, ticks, PLAYER_ID) };
}

function runOpen(settings: PracticeSettings, condition: ArenaLayoutId | "random", players: readonly RoundPlayer[]): PlayedMatch {
  const draws = createRng(settings.seed ^ 0x5eed);
  const round = createOpenRound({
    rng: createRng(settings.seed), ticksTotal: settings.ticks, ruleSetId: condition === "random" ? drawCondition(draws) : condition, boardFor: players.length,
    items: true, ultimates: ultimatesOn(settings.nowMs), waitWhenDry: true, waitWhenNoTarget: true,
  });
  for (const player of players) joinRound(round, player);
  const spawn = round.snapshot;
  const ticks: TickResult[] = [];
  let stats = EMPTY_STATS;
  while (!round.isOver) {
    const before = round.snapshot;
    const tick = stepRound(round);
    // Counted from the board the turn was played from: after a change of weather that is not the last turn's end.
    const turn = turnsOf(before, tick).get(PLAYER_ID);
    if (turn === undefined) throw new Error(`Turn ${tick.tick} has no turn of the player.`);
    stats = addTurn(stats, turn);
    if (condition === "random" && !round.isOver && round.snapshot.tick % RANDOM_CHANGE_TURNS === 0) {
      changeRoundRules(round, drawCondition(draws), players.length);
      // The change can move tanks and reorder the board, so the replay shows the board after it as this turn's end.
      ticks.push({ ...tick, snapshot: round.snapshot });
    } else {
      ticks.push(tick);
    }
  }
  return { spawn, ticks, standings: standingsOf(round), stats };
}

function singleConfig(settings: PracticeSettings, ruleSetId: Exclude<ArenaConditionId, ArenaLayoutId>, players: readonly RoundPlayer[], playerCount: number): RoundConfig {
  return {
    seed: settings.seed,
    // The Try it match plays like an arena round, items included (84-items.md).
    items: true,
    ultimates: ultimatesOn(settings.nowMs),
    waitWhenDry: true,
    waitWhenNoTarget: true,
    ruleSetId,
    ticksTotal: settings.ticks,
    // The cut-line conditions read this, so it follows the arena's own rule.
    survivorsAfterRound: isFinalRound(playerCount) ? null : survivorCount(playerCount),
    players,
  };
}

/**
 * Looks for a test match: the player's tank keeps its look, and the bots are plain in
 * the other colours in order, as bots are in an arena, so no bot has the player's hull
 * colour before all eleven other colours are used.
 */
export function matchTanks(botIds: readonly BotId[], playerLook: TankLook): ReadonlyMap<BotId, TankInfo> {
  const others = TANK_COLOURS.filter((colour) => colour !== playerLook.colour);
  const tanks = new Map<BotId, TankInfo>();
  let next = 0;
  for (const botId of botIds) {
    if (botId === PLAYER_ID) {
      tanks.set(botId, { look: playerLook });
    } else {
      tanks.set(botId, { look: plainTankLook(others[next % others.length] ?? playerLook.colour), isBot: true });
      next += 1;
    }
  }
  return tanks;
}

/** The player's statistics of the match, counted by the engine as the server counts a round (stats/stats.ts). */
export function matchStats(run: PracticeRun): TankStats {
  return run.stats;
}
