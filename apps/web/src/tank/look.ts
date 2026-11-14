// A tank's look for the web: the contract's type and validator (from @game/arena), the
// letters shown on a tank without an icon, and a random look for "Surprise me".

import {
  TANK_COLOURS,
  TANK_ICONS,
  TANK_SKINS,
  parseTankLook,
  plainTankLook,
  type TankColour,
  type TankIcon,
  type TankLook,
  type TankSkin,
} from "@game/arena";

export { TANK_ICONS, TANK_SKINS, parseTankLook, plainTankLook, type TankIcon, type TankLook, type TankSkin };

/** The first one or two letters of a name for the turret: "Ana" gives "A", "Brave Otter" gives "BO". */
export function tankLetters(name: string): string {
  const words = name.trim().split(/\s+/).filter((word) => word !== "");
  const first = words[0];
  if (first === undefined) return "";
  const second = words[1];
  return (second === undefined ? first.slice(0, 1) : `${first.slice(0, 1)}${second.slice(0, 1)}`).toUpperCase();
}

/** A number from 0 (inclusive) to 1 (exclusive); Math.random in the app, a fixed sequence in tests. */
export type Random = () => number;

function pick<T>(items: readonly T[], random: Random): T {
  const item = items[Math.floor(random() * items.length)];
  // The index is inside the list for any random() below 1; a broken source falls back to the first item.
  return item ?? (items[0] as T);
}

/**
 * The light colours (yellow, pink, sky, orange, white); the rest are dark. A pattern or plate
 * from the other group stands out against the hull, also for a colour-blind player,
 * because it differs in lightness and not only in hue. Keep in step with index.css.
 */
export const LIGHT_COLOURS: ReadonlySet<TankColour> = new Set<TankColour>([3, 6, 7, 9, 11]);

/** The colours whose lightness group differs from `colour`. */
function contrastingColours(colour: TankColour): readonly TankColour[] {
  const light = LIGHT_COLOURS.has(colour);
  return TANK_COLOURS.filter((c) => LIGHT_COLOURS.has(c) !== light);
}

/**
 * "Surprise me": a look with a pattern, a plate and an icon, so a random tank is as easy to
 * find as one a player built. The pattern and the plate come from the other lightness group
 * than the hull, so they show.
 */
export function randomLook(random: Random): TankLook {
  const colour = pick(TANK_COLOURS, random);
  const others = contrastingColours(colour);
  const second = pick(others, random);
  const plate = pick(others, random);
  const skin = pick(
    TANK_SKINS.filter((s) => s !== "plain"),
    random,
  );
  const icon = pick(TANK_ICONS, random);
  return { colour, skin, second, plate, icon };
}

/** A look whose second colour differs from a newly chosen hull, as parseTankLook requires. */
export function withColour(look: TankLook, colour: TankColour): TankLook {
  if (look.second !== colour) return { ...look, colour };
  return { ...look, colour, second: look.colour };
}

/** True when two looks draw the same tank. */
export function sameLook(a: TankLook, b: TankLook): boolean {
  return a.colour === b.colour && a.skin === b.skin && a.second === b.second && a.plate === b.plate && a.icon === b.icon;
}
