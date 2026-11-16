// The parts of a tank's look that the editor shows one at a time, the choices of each
// part, and how many choices fit on one page of the measured choice area. Pure, so the
// rules are tested without a browser.

import { FLAG_PATTERNS, TANK_COLOURS, TANK_ICONS, TANK_SKINS, type FlagPattern, type TankColour, type TankFlag, type TankIcon, type TankSkin } from "@game/arena";
import { withColour, type TankLook } from "../tank/look.ts";

export const TANK_PARTS = ["colour", "skin", "second", "plate", "icon", "flag", "flagFirst", "flagSecond", "name"] as const;
export type TankPart = (typeof TANK_PARTS)[number];

/** The flag's colours before a player picks them: red over white. */
export const NEW_FLAG_COLOURS: Pick<TankFlag, "first" | "second"> = { first: 2, second: 11 };

/** The parts the editor shows for this look: the flag's colours only when it has a flag. */
export function partsFor(look: TankLook, withName: boolean): readonly TankPart[] {
  return TANK_PARTS.filter((part) => (part !== "name" || withName) && (look.flag !== null || (part !== "flagFirst" && part !== "flagSecond")));
}

/** One choice of a part. Plate, icon and flag have "none" first. */
export type PartChoice =
  | { readonly part: "colour" | "second" | "flagFirst" | "flagSecond"; readonly value: TankColour }
  | { readonly part: "skin"; readonly value: TankSkin }
  | { readonly part: "plate"; readonly value: TankColour | null }
  | { readonly part: "icon"; readonly value: TankIcon | null }
  | { readonly part: "flag"; readonly value: FlagPattern | null };

export function partChoices(part: Exclude<TankPart, "name">): readonly PartChoice[] {
  switch (part) {
    case "colour":
    case "second":
    case "flagFirst":
    case "flagSecond":
      return TANK_COLOURS.map((value) => ({ part, value }));
    case "flag":
      return [null, ...FLAG_PATTERNS].map((value) => ({ part, value }));
    case "skin":
      return TANK_SKINS.map((value) => ({ part, value }));
    case "plate":
      return [null, ...TANK_COLOURS].map((value) => ({ part, value }));
    case "icon":
      return [null, ...TANK_ICONS].map((value) => ({ part, value }));
  }
}

export function isChosen(look: TankLook, choice: PartChoice): boolean {
  switch (choice.part) {
    case "colour":
      return look.colour === choice.value;
    case "second":
      return look.second === choice.value;
    case "skin":
      return look.skin === choice.value;
    case "plate":
      return look.plate === choice.value;
    case "icon":
      return look.icon === choice.value;
    case "flag":
      return (look.flag?.pattern ?? null) === choice.value;
    case "flagFirst":
      return look.flag?.first === choice.value;
    case "flagSecond":
      return look.flag?.second === choice.value;
  }
}

/** The flag a pattern choice shows: the look's flag colours, or the new flag's. */
export function flagWith(look: TankLook, pattern: FlagPattern): TankFlag {
  return { pattern, ...(look.flag === null ? NEW_FLAG_COLOURS : { first: look.flag.first, second: look.flag.second }) };
}

/**
 * The look with this choice. Null when the choice is not allowed: a pattern colour equal to the
 * hull, a flag's second colour equal to its first, or a flag colour while there is no flag.
 */
export function choose(look: TankLook, choice: PartChoice): TankLook | null {
  switch (choice.part) {
    case "colour":
      return withColour(look, choice.value);
    case "second":
      return choice.value === look.colour ? null : { ...look, second: choice.value };
    case "skin":
      return { ...look, skin: choice.value };
    case "plate":
      return { ...look, plate: choice.value };
    case "icon":
      return { ...look, icon: choice.value };
    case "flag":
      return { ...look, flag: choice.value === null ? null : flagWith(look, choice.value) };
    case "flagFirst":
      if (look.flag === null) return null;
      // As with the hull: taking the second colour as the first swaps the two, so they stay different.
      return { ...look, flag: { ...look.flag, first: choice.value, second: choice.value === look.flag.second ? look.flag.first : look.flag.second } };
    case "flagSecond":
      return look.flag === null || choice.value === look.flag.first ? null : { ...look, flag: { ...look.flag, second: choice.value } };
  }
}

export interface GridPlan {
  readonly columns: number;
  /** Side of one square choice in CSS px. */
  readonly cell: number;
  /** Choices on one page; all of them when they fit. */
  readonly perPage: number;
  readonly pages: number;
  /** Where Previous and Next sit: under the rows, or beside a single row when the box is too short for both. */
  readonly controls: "below" | "beside";
}

export interface GridLimits {
  /** A choice is at least this large, so it stays above the 44 px touch target with room to spare, and 6 fit a 360 px phone. */
  readonly minCell: number;
  readonly maxCell: number;
  readonly gap: number;
  /** Height of the row of page controls under the choices, and the width of one control beside a row. */
  readonly controls: number;
  readonly control: number;
}

export const GRID_LIMITS: GridLimits = { minCell: 48, maxCell: 80, gap: 8, controls: 52, control: 44 };

const rowsIn = (height: number, cell: number, gap: number) => Math.max(0, Math.floor((height + gap) / (cell + gap)));

/**
 * The largest choices with which every choice fits the box; when none do, the smallest
 * allowed choices on pages of whole rows, with a row of page controls under them.
 */
export function planGrid(box: { readonly width: number; readonly height: number }, count: number, limits: GridLimits = GRID_LIMITS): GridPlan {
  const { minCell, maxCell, gap, controls, control } = limits;
  const widest = Math.max(1, Math.floor((box.width + gap) / (minCell + gap)));
  const fewest = Math.min(widest, Math.max(1, Math.ceil((box.width + gap) / (maxCell + gap))));
  for (let columns = fewest; columns <= widest; columns += 1) {
    const cell = Math.min(maxCell, Math.floor((box.width - gap * (columns - 1)) / columns));
    if (rowsIn(box.height, cell, gap) * columns >= count) return { columns, cell, perPage: count, pages: 1, controls: "below" };
  }
  const cell = Math.min(maxCell, Math.floor((box.width - gap * (widest - 1)) / widest));
  const rows = rowsIn(box.height - controls, cell, gap);
  if (rows > 0) {
    const perPage = rows * widest;
    return { columns: widest, cell, perPage, pages: Math.ceil(count / perPage), controls: "below" };
  }
  // Too short for a row and the controls under it: one row with Previous and Next at its ends.
  const inner = box.width - 2 * (control + gap);
  const columns = Math.max(1, Math.floor((inner + gap) / (minCell + gap)));
  const sideCell = Math.min(maxCell, Math.floor((inner - gap * (columns - 1)) / columns));
  return { columns, cell: sideCell, perPage: columns, pages: Math.ceil(count / columns), controls: "beside" };
}
