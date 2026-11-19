// The arena's ground for each round condition (owner, 2026-11-17: "style the arena based on the
// arena condition to be more realistic"). Each condition has a floor, a grid, a wall and a few
// marks drawn on the floor, all under the items, jets and tanks:
//
// | Condition   | Ground          | Marks                          | Why                              |
// |-------------|-----------------|--------------------------------|----------------------------------|
// | standard    | sand            | pebbles                        | the old floor                    |
// | dry-spell   | dry clay        | cracks                         | little water: 6, a throw costs 5 |
// | open-field  | meadow          | grass tufts                    | a field twice as large           |
// | arms-length | stone courtyard | wide joints, some darker slabs | a throw reaches 1 cell: close    |
// | sharp-eyes  | firing range    | crosshair ticks on the grid    | Aim and Dodge count double       |
// | downpour    | wet sand        | none                           | rooms only; water marks would    |
// |             |                 |                                | look like jets or items          |
//
// The marks are thin lines or tiny dots in a colour close to the floor, never a blob or a ring:
// a blob looks like the "stuck" mud and a ring like an item, the "You" ring or a jet's puff.
// Colours are tokens in index.css (--color-arena-<ground>-*). The marks are one static path per
// board, placed by a hash of the cell, so a board looks the same on every render and every screen.

import type { AreaRuleSetId, RuleSetId } from "@game/engine";
import { CELL } from "./boardHelpers.ts";

export type GroundMark = "pebbles" | "cracks" | "tufts" | "slabs" | "crosshairs" | "puddles" | "grass" | "none";

export interface ArenaGround {
  /** CSS colours (tokens). */
  readonly floor: string;
  readonly grid: string;
  readonly wall: string;
  readonly mark: string;
  readonly marks: GroundMark;
  /** Width of the grid lines in board units (a cell is 10): the courtyard's are its paving joints. */
  readonly gridWidth: number;
  /** One cell in `every` gets a mark (before the cap). */
  readonly every: number;
}

const ground = (name: string, marks: GroundMark, every: number, gridWidth = 0.4): ArenaGround => ({
  floor: `var(--color-arena-${name}-floor)`,
  grid: `var(--color-arena-${name}-grid)`,
  wall: `var(--color-arena-${name}-wall)`,
  mark: `var(--color-arena-${name}-mark)`,
  marks,
  every,
  gridWidth,
});

export const ARENA_GROUNDS: Readonly<Record<RuleSetId, ArenaGround>> = {
  standard: { floor: "var(--color-arena-floor)", grid: "var(--color-arena-grid)", wall: "var(--color-line-strong)", mark: "var(--color-arena-sand-mark)", marks: "pebbles", every: 5, gridWidth: 0.4 },
  "dry-spell": ground("clay", "cracks", 4),
  "open-field": ground("meadow", "tufts", 3),
  "arms-length": ground("court", "slabs", 3, 0.9),
  "sharp-eyes": ground("range", "crosshairs", 3),
  downpour: ground("wet", "none", 1),
};

// Hybrid drawings (87-hybrid-arenas.md, owner 2026-11-19). Rooms keep their own floors.
export const AREA_GROUNDS: Readonly<Record<AreaRuleSetId, ArenaGround>> = {
  standard: ARENA_GROUNDS.standard,
  "dry-spell": ARENA_GROUNDS["dry-spell"],
  downpour: ground("rain", "puddles", 3),
  "arms-length": ground("meadow", "grass", 2),
  "sharp-eyes": ground("hill", "none", 1),
};

/** At most this many marks on a board: open field at 512 tanks has about 7,300 cells. */
export const MAX_GROUND_MARKS = 600;

/** A number from 0 to 1 for a cell, the same on every call (an integer hash, not Math.random). */
function cellHash(x: number, y: number, salt: number): number {
  let h = (x * 374761393 + y * 668265263 + salt * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

const n = (value: number) => Math.round(value * 10) / 10;

/** One mark at (px, py) in board units, turned by `r` (0 to 1). */
function markPath(kind: GroundMark, px: number, py: number, r: number): string {
  switch (kind) {
    case "pebbles":
      // Two small dots, filled.
      return `M${n(px)} ${n(py)}a0.7 0.5 0 1 0 1.4 0a0.7 0.5 0 1 0-1.4 0M${n(px + 2.2)} ${n(py + 1.4)}a0.45 0.35 0 1 0 0.9 0a0.45 0.35 0 1 0-0.9 0`;
    case "cracks": {
      // A jagged line of five uneven strokes, about 12 units long, so it runs across a cell line,
      // with one short branch. Its slope follows r.
      const s = r < 0.5 ? 1 : -1;
      const k = 0.6 + r * 0.8;
      return (
        `M${n(px)} ${n(py)}l1.8 ${n(s * 0.7 * k)}l2.6 ${n(-s * 0.4)}l1.4 ${n(s * 1.5 * k)}l2.9 ${n(s * 0.3)}l2.2 ${n(-s * 0.9 * k)}` +
        `M${n(px + 4.4)} ${n(py + s * 0.3 * k)}l0.9 ${n(-s * 1.6)}l0.8 ${n(-s * 0.4)}`
      );
    }
    case "tufts":
    case "grass": {
      // Three blades from three roots a little apart, leaning outward and of three lengths, so
      // they never meet in a point (blades from one root looked like a down arrow).
      const lean = r < 0.5 ? -0.3 : 0.3;
      const height = kind === "grass" ? 1.6 : 1;
      return (
        `M${n(px - 0.8)} ${n(py)}q${n(lean)} -1 -0.7 ${n(-1.6 * height)}` +
        `M${n(px)} ${n(py + 0.2)}q${n(lean)} -1.3 ${n(lean * 1.5)} ${n(-2.5 * height)}` +
        `M${n(px + 0.8)} ${n(py)}q${n(lean)} -0.8 0.8 ${n(-1.3 * height)}`
      );
    }
    case "slabs":
      // A whole cell a shade darker, inside its joints: px, py is the cell's top-left corner.
      return `M${n(px + 0.45)} ${n(py + 0.45)}h9.1v9.1h-9.1z`;
    case "crosshairs":
      // A tick on a grid crossing: px, py is the crossing.
      return `M${n(px - 1.2)} ${n(py)}h2.4M${n(px)} ${n(py - 1.2)}v2.4`;
    case "puddles":
      // A shallow, flat shape in the floor colour family, away from the tank's centre.
      return `M${n(px - 1)} ${n(py)}q1.5 -1.8 3 -0.8q2.5 0.8 1.5 1.6q-2.2 1 -4.5 -0.8Z`;
    case "none":
      return "";
  }
}

/** Whether the marks are filled (dots) or stroked (lines). */
export function marksFilled(kind: GroundMark): boolean {
  return kind === "pebbles" || kind === "slabs" || kind === "puddles";
}

/** One sample of the floor mark where a small legend swatch has room for it. */
export function groundMarkSample(kind: GroundMark): string {
  return markPath(kind, kind === "cracks" ? 5 : 9, 6.5, 0.4);
}

/** The marks of a board as one path (groundMarks). */
export function groundMarksPath(width: number, height: number, ruleSetId: RuleSetId, ground = ARENA_GROUNDS[ruleSetId]): string {
  return groundMarks(width, height, ruleSetId, ground).join("");
}

/**
 * The marks of a board of `width` by `height` cells, one path each: the same board gives the same
 * marks, and a board never has more than MAX_GROUND_MARKS (a large board spaces them out).
 */
export function groundMarks(width: number, height: number, ruleSetId: RuleSetId, { marks, every } = ARENA_GROUNDS[ruleSetId]): readonly string[] {
  if (marks === "none") return [];
  const cells = width * height;
  // 0.9: the expected count stays under the cap, so the cap seldom leaves the last rows bare.
  const chance = Math.min(1 / every, (0.9 * MAX_GROUND_MARKS) / cells);
  const salt = ruleSetId.length;
  const parts: string[] = [];
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (parts.length >= MAX_GROUND_MARKS) return parts;
      if (cellHash(x, y, salt) >= chance) continue;
      const r = cellHash(x, y, salt + 7);
      if (marks === "slabs") {
        parts.push(markPath(marks, x * CELL, y * CELL, r));
        continue;
      }
      if (marks === "crosshairs") {
        // On the crossing at the cell's top-left corner, inside the floor.
        if (x === 0 || y === 0) continue;
        parts.push(markPath(marks, x * CELL, y * CELL, r));
        continue;
      }
      // Near a corner of the cell, where a tank in the middle of the cell leaves the floor showing.
      const corner = Math.floor(r * 4);
      const px = x * CELL + (corner % 2 === 0 ? 1.2 : 5.2) + r * 1.5;
      const py = y * CELL + (corner < 2 ? 2.6 : 7.2);
      parts.push(markPath(marks, px, py, r));
    }
  }
  return parts;
}
