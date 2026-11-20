// Ids the message catalog is keyed by that the engine does not type: the group
// headings, the play styles' own mode names and the values of choice parameters.
// The ids of conditions, actions, targets, play styles (presets) and round rules
// come from @game/engine as literal unions, so a new engine id without a text
// fails the type check of vocabulary/messages.ts.

/** The engine's group headings, by the id the catalog uses for each. */
export const CONDITION_GROUPS = {
  otherTanks: "Other bots",
  oneTank: "The target",
  me: "About me",
  walls: "Walls and space",
  round: "The round",
  items: "Items",
  ultimate: "Ultimate",
} as const;
export type ConditionGroupId = keyof typeof CONDITION_GROUPS;

export const ACTION_GROUPS = {
  attack: "Attack",
  chase: "Chase and flee",
  position: "Position",
  basic: "Basic moves",
  items: "Items",
  ultimate: "Ultimate",
} as const;
export type ActionGroupId = keyof typeof ACTION_GROUPS;

/**
 * Modes of the play styles, by id, with the name the engine stores. A mode that
 * still has this id and this name shows the catalog's name for it, so a play
 * style reads in the player's language without changing the saved strategy.
 */
export const PLAY_STYLE_MODES = {
  evade: "Evade",
  rest: "Rest",
  strike: "Strike",
  charge: "Charge",
  wander: "Wander",
} as const;
export type PlayStyleModeId = keyof typeof PLAY_STYLE_MODES;

/** The values of the choice parameters, by parameter key. Other choice keys ("attribute", "set") name attributes and round rules. */
export const CHOICE_OPTIONS = {
  compare: ["atLeast", "atMost", "fewerThan", "moreThan"],
  bearing: ["ahead", "left", "right", "behind"],
  round: ["cut", "final"],
  place: ["middle", "corner", "quietCorner", "cornerAwayFromNearest", "cornerAwayFromLeader"],
  way: ["left", "right", "slightLeft", "slightRight"],
  item: ["any", "bucket", "umbrella", "pinwheel", "mudBall"],
  effect: ["dizzy", "stuck"],
} as const;
export type ChoiceKey = keyof typeof CHOICE_OPTIONS;
export type ChoiceValue<K extends ChoiceKey> = (typeof CHOICE_OPTIONS)[K][number];

/** Narrows a string from the engine to one of the literal ids. */
export function isOneOf<T extends string>(list: readonly T[], value: string): value is T {
  return (list as readonly string[]).includes(value);
}
