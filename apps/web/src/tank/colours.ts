// The twelve tank colours. The values live in index.css as --color-tank-N and
// --color-tank-N-dark; this file names them for code. Translated colour names are
// in the common messages (m.common.tankColours[colour]). The count, the type and the
// list come from @game/arena, which the server checks colours against.

import { TANK_COLOUR_COUNT, TANK_COLOURS, isTankColour, type TankColour } from "@game/arena";

export { TANK_COLOUR_COUNT, TANK_COLOURS, type TankColour };

/** The colour for the player at position `order` (0 for the first). Past 12 the colours repeat. */
export function tankColourByOrder(order: number): TankColour {
  const index = ((Math.trunc(order) % TANK_COLOUR_COUNT) + TANK_COLOUR_COUNT) % TANK_COLOUR_COUNT;
  return (index + 1) as TankColour;
}

/** CSS value of the colour, for `fill` or `style`. */
export function tankColourVar(colour: TankColour): string {
  return `var(--color-tank-${colour})`;
}

/** CSS value of the darker partner, for tracks and the barrel. */
export function tankColourDarkVar(colour: TankColour): string {
  return `var(--color-tank-${colour}-dark)`;
}

/** Narrows a number from outside (an API field, a form value) to a colour, or null. */
export function toTankColour(value: number): TankColour | null {
  return isTankColour(value) ? value : null;
}
