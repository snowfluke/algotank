// Pure helpers for the arena view: where a square sits in the SVG, where a tank
// and its jet are drawn, who leads, and which rows the scoreboard shows. They have no React in them, so the
// rules about geometry and ranking are tested without rendering.

import type { PublicBot } from "@game/arena";
import { DIRECTION_STEP, canThrow, directionDegreesFromNorth } from "@game/engine";
import type { BotId, Direction, RoundRules, ThrowEvent } from "@game/engine";
import { tankColourByOrder } from "../tank/colours.ts";
import { plainTankLook, type TankLook } from "../tank/look.ts";
import type { TankDetail } from "../tank/TankShape.tsx";
import type { TankInfo } from "./props.ts";

/** Side of one grid cell in SVG user units. Everything else is sized from it. */
export const CELL = 10;

export interface Point {
  readonly x: number;
  readonly y: number;
}

/** Centre of a cell in SVG user units. */
/**
 * Whether the "You" label goes under the viewer's tank instead of over it: in the top row of
 * what the viewer sees (no room above), or when a tank stands on the square above and the
 * square under is free and inside the view, so the label never hides that tank
 * (73-after-first-timer-test.md, row 9).
 */
export function youMarkerBelow(own: Point, others: readonly Point[], view: { readonly inTopRow: boolean; readonly inBottomRow: boolean }): boolean {
  if (view.inTopRow) return true;
  const at = (x: number, y: number) => others.some((o) => o.x === x && o.y === y);
  return at(own.x, own.y - 1) && !view.inBottomRow && !at(own.x, own.y + 1);
}

export function cellCenter(x: number, y: number): Point {
  return { x: (x + 0.5) * CELL, y: (y + 0.5) * CELL };
}

/** TankShape is drawn facing east, so east is 0 degrees. y grows downward, so north is -90 and NE is -45. */
export function directionDegrees(direction: Direction): number {
  return directionDegreesFromNorth(direction) - 90;
}

/** One square along the facing: a diagonal step moves one square on both axes, so it is longer than 1. */
function cellStep(direction: Direction): Point {
  return DIRECTION_STEP[direction];
}

/** The facing as a vector of length 1, for lengths that must not grow on a diagonal (the nozzle, a jet's overshoot, the dry drops). */
function unitStep(direction: Direction): Point {
  const step = DIRECTION_STEP[direction];
  const length = Math.hypot(step.x, step.y);
  return { x: step.x / length, y: step.y / length };
}

/**
 * The angle equivalent to `target` that is closest to `previous`. A CSS
 * transition between two angles turns the long way when they are written
 * modulo 360, so the board keeps an unwrapped angle per bot.
 */
export function unwrapAngle(previous: number, target: number): number {
  let delta = (((target - previous) % 360) + 360) % 360;
  if (delta > 180) delta -= 360;
  return previous + delta;
}

/** SVG path of the lines between cells. The outer edge is the board's own border. */
export function gridLinePath(width: number, height: number): string {
  const parts: string[] = [];
  for (let x = 1; x < width; x += 1) parts.push(`M${x * CELL} 0V${height * CELL}`);
  for (let y = 1; y < height; y += 1) parts.push(`M0 ${y * CELL}H${width * CELL}`);
  return parts.join("");
}

/** The name for an id. A missing name shows the id, so a bot is never unlabelled. */
export function displayName(names: Readonly<Record<BotId, string>>, id: BotId): string {
  return names[id] ?? id;
}

// ---------------------------------------------------------------------------
// Tanks
// ---------------------------------------------------------------------------

/** A tank fills this share of its square, so the strip below it holds the water gauge. */
export const TANK_SCALE = 0.8;
/** The tank sits this far above the centre of its square, to make room for the gauge below. */
export const TANK_LIFT = 0.8;
/** Distance from the tank's centre to the tip of its nozzle (the nozzle ends at x = 5 in TankShape units). */
const NOZZLE_REACH = 5 * TANK_SCALE;

/** Centre of the tank drawn in square (x, y). */
export function tankCenter(x: number, y: number): Point {
  const centre = cellCenter(x, y);
  return { x: centre.x, y: centre.y - TANK_LIFT };
}

/** How the tank and its label are drawn for a square of this many CSS pixels. */
export interface BoardDetail {
  /** "simple" drops the pattern and the icon, which turn into noise under about 32 px per tank; "tiny" also drops the hatch, where labels do not fit. */
  readonly tank: TankDetail;
  /** False when a square is too small for a readable label; the scoreboard names the tanks then. */
  readonly labels: boolean;
  /** False when a square is too small for a readable water gauge; only the viewer's tank keeps one then. */
  readonly gauges: boolean;
}

/** A tank is TANK_SCALE of a square, so 40 px squares give 32 px tanks, where full detail starts to read. */
const FULL_DETAIL_CELL_PX = 40;
/** Below this a two-letter label is under about 7 px high. */
export const MIN_LABEL_CELL_PX = 22;
/** Below this the gauge is under about 11 px wide and 3 px high, too small to read the line at a glance. */
const MIN_GAUGE_CELL_PX = 14;

/** Null is a board that is not measured yet (a server render): it draws the most detail. */
export function boardDetail(cellPx: number | null): BoardDetail {
  if (cellPx === null) return { tank: "full", labels: true, gauges: true };
  const labels = cellPx >= MIN_LABEL_CELL_PX;
  return { tank: cellPx >= FULL_DETAIL_CELL_PX ? "full" : labels ? "simple" : "tiny", labels, gauges: cellPx >= MIN_GAUGE_CELL_PX };
}

/**
 * The look of each tank. The look the player chose wins; without one, the tank is plain in a
 * colour that follows its place in the snapshot, so the same tank keeps its colour all round.
 */
export function tankLooks(
  bots: readonly Pick<PublicBot, "id">[],
  tanks: ReadonlyMap<BotId, TankInfo> | undefined,
): ReadonlyMap<BotId, TankLook> {
  return new Map(bots.map((bot, index) => [bot.id, tanks?.get(bot.id)?.look ?? plainTankLook(tankColourByOrder(index))]));
}

/** The tank with the most points, or null when two or more share the top score (also 0 to 0 at the start). */
export function leaderId(bots: readonly Pick<PublicBot, "id" | "score">[]): BotId | null {
  let leader: Pick<PublicBot, "id" | "score"> | null = null;
  let tied = false;
  for (const bot of bots) {
    if (leader === null || bot.score > leader.score) {
      leader = bot;
      tied = false;
    } else if (bot.score === leader.score) {
      tied = true;
    }
  }
  return leader === null || tied ? null : leader.id;
}

// ---------------------------------------------------------------------------
// Shots
// ---------------------------------------------------------------------------

/** A jet that hits stops here, before the target's centre, so the splash sits on the hull. */
const HIT_SHORT = 2.6;
/** A jet that misses lands this far past the target's centre: over its back, on the floor. */
const MISS_PAST = 6;
/** Length of a jet when nobody stood in the line (a little more than one square). */
const EMPTY_LENGTH = 12;
/** A missed jet is lobbed: its arc rises this share of its length, so it reads as flying over. */
const MISS_ARC = 0.22;
/** A hit is a straight, hard jet with only a slight arc. */
const HIT_ARC = 0.06;
/** The highest arc of any jet, so a long lob does not sweep across other tanks' squares. */
const MAX_BEND = 4;
/** A blocked jet: the open umbrella sits this far in front of the target's centre, toward the shooter. */
const UMBRELLA_FRONT = 1.2;
/** A blocked jet stops at the umbrella's dome, this far in front of the target's centre. */
const BLOCK_SHORT = 4.2;
/** Distances of the three drops of a dry shot from the nozzle tip. */
const DRY_DROPS = [1.1, 2.4, 3.5] as const;

/** One water jet: a quadratic curve from the nozzle to where it lands. */
export interface Jet {
  readonly from: Point;
  readonly control: Point;
  readonly to: Point;
}

/**
 * A shot as the board draws it. "hit" ends in a splash on the target, "miss" is
 * a lob that lands past the target in a puff, "empty" is a short jet into
 * nothing, and "dry" is three drops at the nozzle: no jet, because the tank had too
 * little water. "blocked" is a hard jet that stops at the umbrella the target opens,
 * whose dome faces the shooter (`angle`, in degrees, turns the dome from straight up).
 * The five differ by shape, not only by colour.
 */
export type ShotShape =
  | { readonly kind: "hit"; readonly jet: Jet; readonly splash: Point }
  | { readonly kind: "blocked"; readonly jet: Jet; readonly umbrella: Point; readonly angle: number }
  | { readonly kind: "miss"; readonly jet: Jet }
  | { readonly kind: "empty"; readonly jet: Jet }
  | { readonly kind: "dry"; readonly drops: readonly Point[] };

export interface ArenaBounds {
  readonly width: number;
  readonly height: number;
}

function along(origin: Point, step: Point, distance: number): Point {
  return { x: origin.x + step.x * distance, y: origin.y + step.y * distance };
}

/** Keeps a landing point on the floor, so a jet at a wall does not end outside the arena. */
function clampToFloor(point: Point, bounds: ArenaBounds): Point {
  const inset = 1;
  return {
    x: Math.min(bounds.width * CELL - inset, Math.max(inset, point.x)),
    y: Math.min(bounds.height * CELL - inset, Math.max(inset, point.y)),
  };
}

/** Horizontal jets arc up the screen and vertical ones to the left, so every arc bends the same way for a viewer. */
function arcJet(from: Point, to: Point, rise: number): Jet {
  const length = Math.hypot(to.x - from.x, to.y - from.y);
  const horizontal = Math.abs(to.x - from.x) >= Math.abs(to.y - from.y);
  const bend = Math.min(MAX_BEND, length * rise);
  const mid = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
  return { from, to, control: horizontal ? { x: mid.x, y: mid.y - bend } : { x: mid.x - bend, y: mid.y } };
}

/** SVG path data of a jet. */
export function jetPath(jet: Jet): string {
  return `M${jet.from.x} ${jet.from.y}Q${jet.control.x} ${jet.control.y} ${jet.to.x} ${jet.to.y}`;
}

/**
 * The distance comes from the event, not from the target's square in the snapshot,
 * because the target may have moved later in the same turn.
 */
export function shotShape(shooter: PublicBot, event: ThrowEvent, bounds: ArenaBounds): ShotShape {
  // The target sits `distance` squares along the facing (cellStep); every other length is in SVG units along the facing (unit).
  const unit = unitStep(shooter.direction);
  const centre = tankCenter(shooter.x, shooter.y);
  const nozzle = along(centre, unit, NOZZLE_REACH);
  switch (event.outcome) {
    case "empty":
      return { kind: "empty", jet: arcJet(nozzle, clampToFloor(along(nozzle, unit, EMPTY_LENGTH), bounds), HIT_ARC) };
    case "dry":
      return { kind: "dry", drops: DRY_DROPS.map((distance) => along(nozzle, unit, distance)) };
    case "hit": {
      const target = along(centre, cellStep(shooter.direction), event.distance * CELL);
      return { kind: "hit", jet: arcJet(nozzle, along(target, unit, -HIT_SHORT), HIT_ARC), splash: target };
    }
    case "miss": {
      const target = along(centre, cellStep(shooter.direction), event.distance * CELL);
      return { kind: "miss", jet: arcJet(nozzle, clampToFloor(along(target, unit, MISS_PAST), bounds), MISS_ARC) };
    }
    case "blocked": {
      const target = along(centre, cellStep(shooter.direction), event.distance * CELL);
      // The dome faces back along the jet: straight up turned to the shooter's side.
      const angle = directionDegrees(shooter.direction) - 90;
      return { kind: "blocked", jet: arcJet(nozzle, along(target, unit, -BLOCK_SHORT), HIT_ARC), umbrella: along(target, unit, -UMBRELLA_FRONT), angle };
    }
  }
}

// ---------------------------------------------------------------------------
// Water gauge
// ---------------------------------------------------------------------------

/**
 * The gauge under a bot, in the bot's own coordinates. The fill is the share of
 * the tank, and the tick marks the least water a throw at a bot needs: a fill
 * that ends before the tick means the bot cannot throw.
 */
export interface GaugeShape {
  /** Width of the whole track. */
  readonly trackWidth: number;
  /** Width of the filled part, from the left end of the track. */
  readonly fillWidth: number;
  /** Distance of the tick from the left end of the track. */
  readonly tickAt: number;
  readonly canThrow: boolean;
}

/** The tank maximum and the cost of a throw come from the round's rules: both differ between rule sets. */
export function gaugeShape(water: number, trackWidth: number, rules: RoundRules, capacity = rules.waterCapacity): GaugeShape {
  const share = Math.min(1, Math.max(0, water / capacity));
  return {
    trackWidth,
    fillWidth: trackWidth * share,
    tickAt: (trackWidth * rules.waterPerThrow) / capacity,
    canThrow: canThrow(water, rules),
  };
}

// ---------------------------------------------------------------------------
// Scoreboard
// ---------------------------------------------------------------------------

export interface ScoreRow {
  readonly bot: PublicBot;
  /** Place in the full list, from 0. The cut line is placed by this value. */
  readonly position: number;
  /** Shown rank, from 1. Bots with the same score share a rank (1, 2, 2, 4). */
  readonly rank: number;
}

/** Highest score first. Bots with the same score keep their order in the snapshot. */
export function rankBots(bots: readonly PublicBot[]): ScoreRow[] {
  const sorted = [...bots].sort((a, b) => b.score - a.score);
  const rows: ScoreRow[] = [];
  for (const [position, bot] of sorted.entries()) {
    const previous = rows[position - 1];
    const rank = previous && previous.bot.score === bot.score ? previous.rank : position + 1;
    rows.push({ bot, position, rank });
  }
  return rows;
}

export type ScoreEntry =
  | { readonly kind: "row"; readonly row: ScoreRow }
  /** The line after the last bot that stays in the event. `through` is how many bots stay. */
  | { readonly kind: "cut"; readonly through: number };

/**
 * The rows to draw, with the cut line between them. With `maxRows`, the top rows
 * show first and the highlighted bot takes the last place when it is not among
 * them, so the viewer always sees their own row.
 */
export function scoreboardEntries(
  bots: readonly PublicBot[],
  survivorsAfterRound: number | null,
  highlightId: BotId | null,
  maxRows: number | undefined,
): ScoreEntry[] {
  const all = rankBots(bots);
  let visible = all;
  if (maxRows !== undefined && maxRows < all.length) {
    const own = all.find((row) => row.bot.id === highlightId);
    const room = Math.max(0, maxRows);
    const top = all.slice(0, room);
    visible = own && !top.includes(own) ? [...all.slice(0, Math.max(0, room - 1)), own] : top;
  }
  const entries: ScoreEntry[] = visible.map((row) => ({ kind: "row", row }));
  const cut = cutPosition(survivorsAfterRound, all.length);
  if (cut === null) return entries;
  const at = cutLineIndex(visible, cut);
  if (at !== null) entries.splice(at, 0, { kind: "cut", through: cut });
  return entries;
}

/**
 * Where the cut line goes among the visible rows, or null when it would not be
 * true. The line is right under the row at position cut - 1 and right above the
 * row at position cut. When maxRows hides the rows on both sides of the cut,
 * a line next to a visible row would suggest the hidden rows are all on one side.
 */
function cutLineIndex(visible: readonly ScoreRow[], cut: number): number | null {
  const lastIn = visible.findIndex((row) => row.position === cut - 1);
  if (lastIn !== -1) return lastIn + 1;
  const firstOut = visible.findIndex((row) => row.position === cut);
  return firstOut > 0 ? firstOut : null;
}

/**
 * How many bots stay above the cut line, or null when no line is drawn: a grand
 * final has no cut, and a cut at or past the last bot removes nobody.
 */
export function cutPosition(survivorsAfterRound: number | null, botCount: number): number | null {
  if (survivorsAfterRound === null || survivorsAfterRound <= 0 || survivorsAfterRound >= botCount) return null;
  return survivorsAfterRound;
}
