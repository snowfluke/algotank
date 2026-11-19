// Which sound effects a turn on the board makes. One small table, so a turn
// with many shots stays a few sounds and the rule is tested without audio.

import type { BoardItem, BotId, ItemKind, ThrowEvent, UltimateFire, UltimateId } from "@game/engine";
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
export function turnSounds(throws: readonly ThrowEvent[], ownId: BotId | null): SoundName[] {
  const fired = ownId === null ? throws : throws.filter((event) => event.throwerId === ownId);
  const outcomes = new Set(fired.map((event) => event.outcome));
  const hitOwn = ownId !== null && throws.some((event) => event.outcome === "hit" && event.targetId === ownId);
  const sounds: SoundName[] = [];
  // A throw an umbrella blocked (84-items.md) is a shot whose water lands nowhere: the miss sound, never the splash.
  if (outcomes.has("hit") || outcomes.has("miss") || outcomes.has("empty") || outcomes.has("blocked")) sounds.push("shot");
  if (outcomes.has("hit") || hitOwn) sounds.push("splash");
  else if (outcomes.has("miss") || outcomes.has("empty") || outcomes.has("blocked")) sounds.push("miss");
  if (outcomes.has("dry")) sounds.push("dry");
  return sounds;
}

/**
 * The ultimate sounds of one turn (owner, 2026-11-19: "if your tank triggering a ulti or affected by others, it
 * should spawn a sound effect"). At most two, after the shot sounds:
 *
 * | Viewer (`ownId`)  | Event                                                   | Sound    |
 * |-------------------|---------------------------------------------------------|----------|
 * | a tank            | its own tank fires any ultimate                         | ultimate |
 * | a tank            | another tank's Dash rams it                             | ram      |
 * | a tank            | another tank's Splash ring hits it                      | splash   |
 * | a tank            | a Mud bomb sticks it                                    | mud      |
 * | a tank            | a Whirlwind catches it                                  | wind     |
 * | no tank (null)    | any tank fires                                          | ultimate, once per turn |
 *
 * Without a tank the viewer watches up to 512 tanks, so one cue per turn says "an ultimate went off" without noise.
 */
const ULTIMATE_SOUND: Readonly<Record<UltimateId, SoundName>> = {
  dash: "dash", smoke: "smoke", splash: "splashRing", fullTank: "fullTank",
  mudBomb: "mudBomb", whirlwind: "whirlwind", bigUmbrella: "bigUmbrella", magnet: "magnet",
};

export function ultimateSounds(fires: readonly UltimateFire[], ownId: BotId | null): SoundName[] {
  const [first] = fires;
  if (first === undefined) return [];
  // The shared cue, then the ultimate's own sound (owner, 2026-11-19), for the first fire only.
  if (ownId === null) return ["ultimate", ULTIMATE_SOUND[first.kind]];
  const sounds = new Set<SoundName>();
  for (const fire of fires) {
    if (fire.botId === ownId) {
      sounds.add("ultimate");
      sounds.add(ULTIMATE_SOUND[fire.kind]);
      continue;
    }
    if (fire.kind === "dash" && fire.shot.outcome === "hit" && fire.shot.targetId === ownId) sounds.add("ram");
    if (fire.kind === "splash" && fire.squares.some((square) => square.outcome === "hit" && square.targetId === ownId)) sounds.add("splash");
    if (fire.kind === "mudBomb" && fire.affected.includes(ownId)) sounds.add("mud");
    if (fire.kind === "whirlwind" && fire.affected.includes(ownId)) sounds.add("wind");
  }
  return [...sounds].slice(0, 3);
}

const PICKUP_SOUND: Readonly<Record<ItemKind, SoundName>> = {
  bucket: "pickBucket", umbrella: "pickUmbrella", pinwheel: "pickPinwheel", mudBall: "pickMudBall",
};

/**
 * The viewer's own tank picks up an item (owner, 2026-11-19: "Picking an item should also has sfx uniquely to
 * the item"). The board reads it from the floor: an item that lay on the square where the tank now stands is gone
 * after the turn. A magnet pull takes items from other squares, so it makes no pickup sound.
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
