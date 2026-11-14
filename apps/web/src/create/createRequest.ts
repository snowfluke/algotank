// The create form's choices and the body of POST /api/arenas they become. The form
// offers fixed choices (speed, round length), so every combination is a request the
// server accepts; the test checks that against ARENA_LIMITS.

import { tankCountRange, type CreateArenaRequest, type JoinPolicy, type RuleSetMode } from "@game/arena";

export type CreatableKind = CreateArenaRequest["kind"];

/** Milliseconds between turns. Normal is slow enough that a viewer can follow one tank with their eyes. */
export const GAME_SPEEDS = { relaxed: 1200, normal: 900, fast: 600 } as const;
export type GameSpeed = keyof typeof GAME_SPEEDS;
export const GAME_SPEED_IDS = ["relaxed", "normal", "fast"] as const satisfies readonly GameSpeed[];

/** Seconds of one round: 1, 1.5, 2, 3 or 5 minutes. A tournament for friends wants 5 (owner, 2026-11-13). */
export const ROUND_LENGTHS = { one: 60, oneHalf: 90, two: 120, three: 180, five: 300 } as const;
export type RoundLength = keyof typeof ROUND_LENGTHS;
export const ROUND_LENGTH_IDS = ["one", "oneHalf", "two", "three", "five"] as const satisfies readonly RoundLength[];

export interface CreateFormValues {
  readonly kind: CreatableKind;
  readonly name: string;
  readonly botFill: boolean;
  /** How many tanks a game has; TankCountControl keeps it inside tankCountRange(kind). */
  readonly tankCount: number;
  readonly speed: GameSpeed;
  readonly length: RoundLength;
  readonly ruleSetMode: RuleSetMode;
  readonly joinPolicy: JoinPolicy;
}

export function defaultValues(kind: CreatableKind, name: string): CreateFormValues {
  // A friend group wants bots to fill a small table; an event usually has enough people.
  return { kind, name, botFill: kind === "private", tankCount: tankCountRange(kind).initial, speed: "normal", length: "oneHalf", ruleSetMode: "standard", joinPolicy: "anyone" };
}

export function ticksPerRound(length: RoundLength, speed: GameSpeed): number {
  return Math.round((ROUND_LENGTHS[length] * 1000) / GAME_SPEEDS[speed]);
}

export function createRequest(values: CreateFormValues): CreateArenaRequest {
  return {
    kind: values.kind,
    settings: {
      name: values.name.trim(),
      ticksPerRound: ticksPerRound(values.length, values.speed),
      tickMs: GAME_SPEEDS[values.speed],
      ruleSetMode: values.ruleSetMode,
      botFill: values.botFill,
      joinPolicy: values.joinPolicy,
      tankCount: values.tankCount,
    },
  };
}
