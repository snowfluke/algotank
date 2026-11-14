// Which sound effects a turn on the board makes. One small table, so a turn
// with many shots stays a few sounds and the rule is tested without audio.

import type { BotId, ThrowEvent } from "@game/engine";
import type { SoundName } from "../sound/sounds.ts";

/**
 * The sounds of one turn, at most three, strongest last: the shot, then a splash
 * for a hit or the miss sound, then the dry sound when a tank shot with too little water.
 *
 * Whose events count (60-no-scroll.md, "Sound only for the viewer's own tank"):
 *
 * | Viewer (`ownId`)                     | Sounds for                                                     |
 * |--------------------------------------|----------------------------------------------------------------|
 * | a tank in the round (its id)         | its own shot, miss or dry shot, and a splash when it lands a hit or is hit |
 * | no tank in the round (null)          | every tank                                                     |
 *
 * A player who hears every tank cannot tell which sound is theirs, so a player hears only their tank.
 */
export function turnSounds(throws: readonly ThrowEvent[], ownId: BotId | null): SoundName[] {
  const fired = ownId === null ? throws : throws.filter((event) => event.throwerId === ownId);
  const outcomes = new Set(fired.map((event) => event.outcome));
  const hitOwn = ownId !== null && throws.some((event) => event.outcome === "hit" && event.targetId === ownId);
  const sounds: SoundName[] = [];
  if (outcomes.has("hit") || outcomes.has("miss") || outcomes.has("empty")) sounds.push("shot");
  if (outcomes.has("hit") || hitOwn) sounds.push("splash");
  else if (outcomes.has("miss") || outcomes.has("empty")) sounds.push("miss");
  if (outcomes.has("dry")) sounds.push("dry");
  return sounds;
}

/**
 * A turn makes its sounds only when it follows the turn shown before. A board that
 * opens in the middle of a round, or a replay that jumps, stays silent.
 */
export function playsTurnSounds(previousTick: number | null, tick: number): boolean {
  return previousTick !== null && tick === previousTick + 1;
}

/** The sound for a change of the countdown: a beep for each new number, and the start sound when it ends. */
export function countdownSound(previous: number | null, next: number | null): SoundName | null {
  const was = previous ?? 0;
  const now = next ?? 0;
  if (now > 0 && now !== was) return "countdown";
  if (was > 0 && now <= 0) return "roundStart";
  return null;
}
