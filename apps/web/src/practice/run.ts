// A practice round: the player's strategy against built-in bots, run in the
// browser with the engine. The setup rules (how many opponents, which mix,
// how a round is cut) live here, so the screen only reads and shows them.

import { handicapOf, PRESETS, runRound, statsOfRound } from "@game/engine";
import type { BotId, RoundConfig, RuleSetId, Snapshot, Standing, Strategy, TankStats, TickResult } from "@game/engine";
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

export interface PracticeSettings {
  readonly strategy: Strategy;
  readonly name: string;
  readonly opponents: number;
  readonly mix: OpponentMix;
  readonly ticks: number;
  readonly seed: number;
  readonly nowMs: number;
  readonly ruleSetId: RuleSetId;
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
}

export function runPractice(settings: PracticeSettings): PracticeRun {
  const opponents = pickOpponents(settings.opponents, settings.mix);
  const playerCount = opponents.length + 1;
  const config: RoundConfig = {
    seed: settings.seed,
    // The Try it match plays like an arena round, items included (84-items.md).
    items: true,
    ultimates: ultimatesOn(settings.nowMs),
    ruleSetId: settings.ruleSetId,
    ticksTotal: settings.ticks,
    // The cut-line conditions read this, so it follows the arena's own rule.
    survivorsAfterRound: isFinalRound(playerCount) ? null : survivorCount(playerCount),
    // The Try it match plays the arena's handicap of built-in styles too, so it shows what the arena would.
    players: [{ id: PLAYER_ID, strategy: settings.strategy }, ...opponents.map((preset, index) => ({ id: `bot-${index + 1}`, strategy: preset.strategy }))].map(
      (player) => {
        const handicap = handicapOf(player.strategy, "room");
        return handicap === 0 ? player : { ...player, handicap };
      },
    ),
  };
  const names: Record<BotId, string> = { [PLAYER_ID]: settings.name };
  opponentNames(opponents, settings.styleName ?? ((preset) => preset.name)).forEach((name, index) => {
    names[`bot-${index + 1}`] = name;
  });

  const { spawn, ticks, standings } = runRound(config);
  const player = standings.find((standing) => standing.botId === PLAYER_ID);
  if (player === undefined) throw new Error("The player is missing from the standings.");
  return { seed: settings.seed, ticksTotal: settings.ticks, strategy: settings.strategy, names, spawn, ticks, standings, player };
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
  return statsOfRound(run.spawn, run.ticks, PLAYER_ID);
}
