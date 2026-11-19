// Hybrid arenas (87-hybrid-arenas.md, owner 2026-11-19). Rectangles are in whole
// squares, with an exclusive right and bottom edge. The last area drawn on a
// square supplies its rules. Sand fills the board behind all the areas.

import { RULE_SETS, STANDARD_RULE_SET_ID, rulesOf, type RoundRules, type RuleSetId } from "../combat/rule-sets.ts";
import type { Rng } from "../types.ts";
import type { ArenaSize } from "./grid.ts";

export const ARENA_LAYOUT_IDS = ["fourQuarters", "eyeOfStorm", "rainFront", "hills"] as const;
export type ArenaLayoutId = (typeof ARENA_LAYOUT_IDS)[number];
export type ArenaConditionId = RuleSetId | ArenaLayoutId;
export type AreaRuleSetId = Exclude<RuleSetId, "open-field">;

export interface ArenaArea<Set extends AreaRuleSetId = Exclude<AreaRuleSetId, "standard">> extends ArenaSize {
  readonly x: number;
  readonly y: number;
  readonly ruleSetId: Set;
}

export type ArenaLayout =
  | { readonly id: "fourQuarters"; readonly areas: readonly ArenaArea<"dry-spell" | "downpour" | "arms-length">[] }
  | { readonly id: "eyeOfStorm"; readonly areas: readonly ArenaArea<"dry-spell" | "downpour">[] }
  | { readonly id: "rainFront"; readonly areas: readonly []; readonly firstColumn: number }
  | { readonly id: "hills"; readonly areas: readonly ArenaArea<"sharp-eyes">[] };

type ArenaBoard = { readonly ruleSetId: RuleSetId; readonly width: number; readonly layout?: ArenaLayout };

export function isArenaLayoutId(value: unknown): value is ArenaLayoutId {
  return ARENA_LAYOUT_IDS.some((id) => id === value);
}

export function arenaConditionOf(board: Pick<ArenaBoard, "ruleSetId" | "layout">): ArenaConditionId {
  return board.layout?.id ?? board.ruleSetId;
}

// All layouts use the Standard board size. Open field sizes the whole board, never an area.
export function boardRuleSetId(condition: ArenaConditionId): RuleSetId {
  return isArenaLayoutId(condition) ? STANDARD_RULE_SET_ID : condition;
}

const AREA_RULE_SETS = {
  fourQuarters: ["standard", "dry-spell", "downpour", "arms-length"],
  eyeOfStorm: ["standard", "dry-spell", "downpour"],
  rainFront: ["standard", "downpour"],
  hills: ["standard", "sharp-eyes"],
} as const satisfies Record<ArenaLayoutId, readonly AreaRuleSetId[]>;

export function areaRuleSetIds(id: ArenaLayoutId): readonly AreaRuleSetId[] {
  return AREA_RULE_SETS[id];
}

const LAYOUT_WATER_CAPACITY = Object.fromEntries(ARENA_LAYOUT_IDS.map((id) => [
  id, Math.max(...areaRuleSetIds(id).map((set) => RULE_SETS[set].waterCapacity)),
])) as Readonly<Record<ArenaLayoutId, number>>;

export function waterCapacityOf(board: Pick<ArenaBoard, "ruleSetId" | "layout">): number {
  return board.layout === undefined ? rulesOf(board).waterCapacity : LAYOUT_WATER_CAPACITY[board.layout.id];
}

const RAIN_WIDTH = 3;
const RAIN_TURNS_PER_COLUMN = 30;

/** The areas to draw now. The moving band is implicit in the fixed map. */
export function areasOf(layout: ArenaLayout, { width, height }: ArenaSize): readonly ArenaArea[] {
  if (layout.id !== "rainFront") return layout.areas;
  const widthAtRight = Math.min(RAIN_WIDTH, width - layout.firstColumn);
  const right: ArenaArea = { x: layout.firstColumn, y: 0, width: widthAtRight, height, ruleSetId: "downpour" };
  return widthAtRight === RAIN_WIDTH ? [right] : [right, { ...right, x: 0, width: RAIN_WIDTH - widthAtRight }];
}

export function advanceLayout(layout: ArenaLayout, width: number, ticksPlayed: number): ArenaLayout {
  if (layout.id !== "rainFront" || ticksPlayed % RAIN_TURNS_PER_COLUMN !== 0) return layout;
  return { ...layout, firstColumn: (layout.firstColumn + 1) % width };
}

export function rulesAt(board: ArenaBoard | { readonly snapshot: ArenaBoard }, x: number, y: number): RoundRules {
  const snapshot = "snapshot" in board ? board.snapshot : board;
  const { layout } = snapshot;
  if (layout === undefined) return rulesOf(snapshot);
  if (layout.id === "rainFront") {
    const distance = (x - layout.firstColumn + snapshot.width) % snapshot.width;
    return RULE_SETS[distance < RAIN_WIDTH ? "downpour" : "standard"];
  }
  for (let i = layout.areas.length - 1; i >= 0; i--) {
    const area = layout.areas[i];
    if (area !== undefined && x >= area.x && x < area.x + area.width && y >= area.y && y < area.y + area.height) return RULE_SETS[area.ruleSetId];
  }
  return RULE_SETS.standard;
}

function middle<Set extends ArenaArea["ruleSetId"]>({ width, height }: ArenaSize, fraction: number, ruleSetId: Set): ArenaArea<Set> {
  const w = Math.round(width * fraction);
  const h = Math.round(height * fraction);
  return { x: Math.round((width - w) / 2), y: Math.round((height - h) / 2), width: w, height: h, ruleSetId };
}

const HILL_SIZE = 2;
const HILL_GAP_STEP = HILL_SIZE + 1;

function drawHills({ width, height }: ArenaSize, rng: Rng): readonly ArenaArea<"sharp-eyes">[] {
  const count = Math.max(2, Math.round(width * height / 60));
  const positions: ArenaArea<"sharp-eyes">[] = [];
  for (let y = 1; y < height - HILL_SIZE; y++) {
    for (let x = 1; x < width - HILL_SIZE; x++) {
      positions.push({ x, y, width: HILL_SIZE, height: HILL_SIZE, ruleSetId: "sharp-eyes" });
    }
  }
  const draws = rng.shuffle(positions);
  const hills: ArenaArea<"sharp-eyes">[] = [];
  for (const area of draws) {
    if (hills.some((hill) => Math.abs(hill.x - area.x) < HILL_GAP_STEP && Math.abs(hill.y - area.y) < HILL_GAP_STEP)) continue;
    hills.push(area);
    if (hills.length === count) return hills;
  }
  // Greedy placement can get boxed in on a small board. The spaced grid has
  // room for the required count at the engine's minimum size and above.
  const spaced = draws.filter(({ x, y }) => (x - 1) % HILL_GAP_STEP === 0 && (y - 1) % HILL_GAP_STEP === 0);
  if (spaced.length < count) throw new Error("The board is too small for its hills.");
  return spaced.slice(0, count);
}

export function createArenaLayout(id: ArenaLayoutId, size: ArenaSize, rng: Rng): ArenaLayout {
  const { width, height } = size;
  switch (id) {
    case "fourQuarters": {
      const left = Math.round(width / 2);
      const top = Math.round(height / 2);
      return { id, areas: [
        { x: left, y: 0, width: width - left, height: top, ruleSetId: "dry-spell" },
        { x: 0, y: top, width: left, height: height - top, ruleSetId: "downpour" },
        { x: left, y: top, width: width - left, height: height - top, ruleSetId: "arms-length" },
      ] };
    }
    case "eyeOfStorm":
      return { id, areas: [middle(size, 2 / 3, "dry-spell"), middle(size, 1 / 3, "downpour")] };
    case "rainFront":
      return { id, areas: [], firstColumn: 0 };
    case "hills":
      return { id, areas: drawHills(size, rng) };
  }
}
