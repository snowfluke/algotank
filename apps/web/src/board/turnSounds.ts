// Which sound effects a turn on the board makes. One small table, so a turn
// with many shots stays a few sounds and the rule is tested without audio.

import type { BoardItem, BotId, ItemKind, ThrowEvent } from "@game/engine";
import type { SoundName } from "../sound/sounds.ts";

/**
 * The sounds of one turn, at most three, strongest last: the shot, then a splash
 * for a hit or the miss sound (a miss, a shot into nothing or a blocked throw), then the
 * dry sound when a tank shot with too little water.
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
export function turnSounds(throws: readonly ThrowEvent[], ownId: BotId | null, ownItem: ItemKind | null = null): SoundName[] {
  const fired = ownId === null ? throws : throws.filter((event) => event.throwerId === ownId);
  const outcomes = new Set(fired.map((event) => event.outcome));
  const hitOwn = ownId !== null && throws.some((event) => event.outcome === "hit" && event.targetId === ownId);
  const blockedOwn = ownId !== null && throws.some((event) => event.outcome === "blocked" && event.targetId === ownId);
  const sounds: SoundName[] = [];
  // A throw an umbrella blocked (84-items.md) is a shot whose water lands nowhere: the miss sound, never the splash.
  if (outcomes.has("hit") || outcomes.has("miss") || outcomes.has("empty") || outcomes.has("blocked")) sounds.push("shot");
  // The item the viewer's tank held before the turn does its job (owner, 2026-11-19): its own sound takes the
  // place of the splash or the miss, so a turn still makes one sound for its outcome.
  const itemHit = ownId !== null && outcomes.has("hit") && ownItem !== null && ownItem !== "umbrella" ? ITEM_HIT_SOUND[ownItem] : null;
  if (itemHit !== null) sounds.push(itemHit);
  else if (blockedOwn && ownItem === "umbrella") sounds.push("useUmbrella");
  else if (outcomes.has("hit") || hitOwn) sounds.push("splash");
  else if (outcomes.has("miss") || outcomes.has("empty") || outcomes.has("blocked")) sounds.push("miss");
  if (outcomes.has("dry")) sounds.push("dry");
  return sounds;
}

const ITEM_HIT_SOUND: Readonly<Record<Exclude<ItemKind, "umbrella">, SoundName>> = {
  bucket: "useBucket", pinwheel: "usePinwheel", mudBall: "useMudBall",
};

const PICKUP_SOUND: Readonly<Record<ItemKind, SoundName>> = {
  bucket: "pickBucket", umbrella: "pickUmbrella", pinwheel: "pickPinwheel", mudBall: "pickMudBall",
};

/**
 * The viewer's own tank picks up an item (owner, 2026-11-19: "Picking an item should also has sfx uniquely to
 * the item"). The board reads it from the floor: an item that lay on the square where the tank now stands is gone
 * after the turn.
 */
export function pickupSound(before: readonly BoardItem[], after: readonly BoardItem[], own: { readonly x: number; readonly y: number } | undefined): SoundName | null {
  if (own === undefined) return null;
  const taken = before.find((item) => item.x === own.x && item.y === own.y && !after.some((left) => left.x === item.x && left.y === item.y && left.kind === item.kind));
  return taken === undefined ? null : PICKUP_SOUND[taken.kind];
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
