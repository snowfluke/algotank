// The numbers of the two public arenas, as data in one place (docs/specs/revamp/67-public-arenas.md,
// table "The three arenas"; the monthly arena became a league, apps/server/src/monthly/). The
// capacities (8, 64) and the bot fill (8, 16) live in the arena package (maxPlayersOf,
// botFillSizeOf), because the reducer and the stored form check them.
//
// |                      | practice       | tournament     |
// |----------------------|----------------|----------------|
// | One round            | 60 turns, 0.9 s| 90 turns, 0.9 s|
// | Countdown after the  | 30 s           | 60 s           |
// | first human arrives  |                |                |
// | When every human is  | 3 s            | 5 s            |
// | ready                |                |                |
// | Between two rounds   | (never: 8 play | 20 s           |
// |                      | one final)     |                |
// | Result shown         | 20 s           | 30 s           |
// | An extra room with   | 104 s          | (never: one    |
// | no human closes      | (gameMsOf)     | room for good) |
// | after                |                |                |
//
// Presence (one rule each, unscaled by PUBLIC_TIME_DIVISOR so a scripted run prunes as in play):
// | Moment             | A human is removed when their stream has been closed for |
// |--------------------|-----------------------------------------------------------|
// | A game starts      | 20 s (PUBLIC_START_ABSENT_MS): they do not play           |
// | The reset (lobby)  | 3 min (PUBLIC_ABSENT_MS)                                  |
// A human who never opened a stream counts from the moment they joined.

import type { Arena, ArenaSettings, PublicKind } from "@game/arena";

export interface PublicKindRules {
  readonly settings: ArenaSettings;
  /** The lobby countdown, from the moment a human is in the lobby. */
  readonly countdownMs: number;
  /** The countdown once every human in the lobby is ready, when that is sooner. */
  readonly readyCountdownMs: number;
  /** The pause between two rounds of one game, after which the server starts the next round. */
  readonly breakMs: number;
  /** How long the result stays before the reset. */
  readonly resultMs: number;
}

export type PublicRules = Readonly<Record<PublicKind, PublicKindRules>>;

// The practice countdown is 30 s, not shorter, because a first-timer lands there and must have
// time to read the lobby. A player who wants a quick restart taps "I'm ready" (3 s).
/** One turn of a public arena. The landing page's demo plays at this speed too. */
export const PUBLIC_TICK_MS = 900;

function settingsOf(kind: PublicKind, ticksPerRound: number): ArenaSettings {
  return { name: "", kind, ticksPerRound, tickMs: PUBLIC_TICK_MS, ruleSetMode: "standard", botFill: true, joinPolicy: "anyone", tankCount: null };
}

export const PUBLIC_RULES: PublicRules = {
  // The practice result is 20 s, raised from 12 s on 2026-11-12, because its text needs 17 to 28 s
  // of reading; a player who wants to go on taps "I'm ready" on it.
  practice: { settings: settingsOf("practice", 60), countdownMs: 30_000, readyCountdownMs: 3_000, breakMs: 20_000, resultMs: 20_000 },
  tournament: { settings: settingsOf("tournament", 90), countdownMs: 60_000, readyCountdownMs: 5_000, breakMs: 20_000, resultMs: 30_000 },
};

/** A human whose stream has been closed this long is removed at the next reset. */
export const PUBLIC_ABSENT_MS = 3 * 60 * 1000;

/**
 * A human whose stream has been closed this long when a game starts does not play and is
 * removed, so a closed browser does not hold a seat (first-timer test, 2026-11-12). Long
 * enough for a phone that reconnects after a network change.
 */
export const PUBLIC_START_ABSENT_MS = 20 * 1000;

/**
 * The length of one whole game of a one-round kind: the lobby countdown, the round and the
 * result. An extra practice room that holds no human this long closes.
 */
export function gameMsOf(rules: PublicKindRules): number {
  return rules.countdownMs + rules.settings.ticksPerRound * rules.settings.tickMs + rules.resultMs;
}

/** The shortest turn the reducer accepts (ARENA_LIMITS.tickMsMin). */
const TICK_MS_FLOOR = 100;
export const PUBLIC_TIME_DIVISOR_MAX = 9;

/** A turn length divided by PUBLIC_TIME_DIVISOR, never below 100 ms. The monthly league's turn uses it too. */
export function scaledTickMs(tickMs: number, divisor: number): number {
  return Math.max(TICK_MS_FLOOR, Math.round(tickMs / divisor));
}

/**
 * PUBLIC_RULES with every wait and the turn length divided by `divisor`, for a scripted run
 * that must not take minutes (PUBLIC_TIME_DIVISOR). 1 gives the real numbers. The turn count
 * stays, so a game keeps its shape; the absent time stays, so pruning behaves as in play.
 */
export function scaledPublicRules(divisor: number): PublicRules {
  if (!Number.isInteger(divisor) || divisor < 1 || divisor > PUBLIC_TIME_DIVISOR_MAX) {
    throw new Error(`The public time divisor must be a whole number from 1 to ${PUBLIC_TIME_DIVISOR_MAX}.`);
  }
  const scale = (rules: PublicKindRules): PublicKindRules => ({
    settings: { ...rules.settings, tickMs: scaledTickMs(rules.settings.tickMs, divisor) },
    countdownMs: Math.round(rules.countdownMs / divisor),
    readyCountdownMs: Math.round(rules.readyCountdownMs / divisor),
    breakMs: Math.round(rules.breakMs / divisor),
    resultMs: Math.round(rules.resultMs / divisor),
  });
  return { practice: scale(PUBLIC_RULES.practice), tournament: scale(PUBLIC_RULES.tournament) };
}

/**
 * True when the arena has humans and every one of them tapped "I'm ready". In the lobby the
 * countdown then drops to readyCountdownMs; on the result the next lobby will start that way,
 * because the reset keeps who is ready.
 */
export function everyHumanReady(arena: Arena): boolean {
  const humans = arena.players.filter((p) => !p.isBot);
  return humans.length > 0 && humans.every((p) => p.ready);
}
