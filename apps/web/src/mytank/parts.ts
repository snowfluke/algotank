// The parts of a tank's look that the editor shows one at a time, the choices of each
// part, and how many choices fit on one page of the measured choice area. Pure, so the
// rules are tested without a browser.

import { FLAG_COUNTRIES, TANK_COLOURS, TANK_ICONS, TANK_SKINS, type FlagCountry, type TankColour, type TankIcon, type TankSkin } from "@game/arena";
import { withColour, type TankLook } from "../tank/look.ts";

export const TANK_PARTS = ["colour", "skin", "second", "plate", "icon", "flag", "name"] as const;
export type TankPart = (typeof TANK_PARTS)[number];

/** The parts the editor shows: all, or all but the name where the name cannot change (inside an arena). */
export function partsFor(withName: boolean): readonly TankPart[] {
  return TANK_PARTS.filter((part) => part !== "name" || withName);
}

/** One choice of a part. Plate, icon and flag have "none" first. */
export type PartChoice =
  | { readonly part: "colour" | "second"; readonly value: TankColour }
  | { readonly part: "skin"; readonly value: TankSkin }
  | { readonly part: "plate"; readonly value: TankColour | null }
  | { readonly part: "icon"; readonly value: TankIcon | null }
  | { readonly part: "flag"; readonly value: FlagCountry | null };

export function partChoices(part: Exclude<TankPart, "name">): readonly PartChoice[] {
  switch (part) {
    case "colour":
    case "second":
      return TANK_COLOURS.map((value) => ({ part, value }));
    case "flag":
      // The editor orders the countries by their names in the player's language (MyTankEditor.tsx).
      return [null, ...FLAG_COUNTRIES].map((value) => ({ part, value }));
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
      return look.country === choice.value;
  }
}

/** The look with this choice. Null when the choice is not allowed: a pattern colour equal to the hull. */
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
      return { ...look, country: choice.value };
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
