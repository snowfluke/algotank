// Actions a rule can run. Each one turns an intent into one move, or into null
// when it cannot act. Add an entry here and the editor shows it.
//
// Shared rules (movement.ts holds the code):
// - A step toward a cell that holds a bot becomes a throw at that bot.
// - An action that needs a target returns null when the selector finds nobody,
//   and "Step out of the line of fire" returns null when nobody is aimed at the
//   bot. decide() then skips the rule. No action runs a substitute move.
// - A move never walks into a wall.
// - A turn with two equal choices goes left, unless only the right-hand cell is free.
// - Only "Wander" draws a random number, and it draws exactly one.
// - Lines are rows, columns and diagonals, and distances count a diagonal step as 1.

import type { ActionDef, BotState, DecisionContext, Direction, Move, ParamValues } from "../types.ts";
import { throwRange } from "../combat/combat.ts";
import { rulesAt } from "../round/arena-layouts.ts";
import { chebyshev, rotate } from "../directions.ts";
import {
  botsThatCanHit,
  directionToFace,
  firstBotInLine,
  isCellInLineOfFire,
  isFree,
  neighbour,
  roomAhead,
  stepAway,
  stepToward,
  straightLineDirection,
} from "./geometry.ts";
import type { Cell } from "./geometry.ts";
import { goForward, steerTowards, stepTowards } from "./movement.ts";
import { tableOf, withLiteralIds, targetParam, textValue } from "./define.ts";
import { pickTarget } from "./targets.ts";
import { forEachBotNear } from "./snapshot-index.ts";
import { canTake, nearestItem } from "../items/items.ts";
import { itemParam, itemValue } from "../items/params.ts";

const ATTACK = "Attack";
const CHASE_AND_FLEE = "Chase and flee";
const POSITION = "Position";
const BASIC = "Basic moves";
const ITEMS = "Items";

/** "Move away from the crowd" counts bots this close to a cell. */
const CROWD_RADIUS = 4;
/** "Wander" turns on these draws and walks forward on as many others, so half the draws walk. */
const WANDER_TURNS: readonly Move[] = ["L", "R", "L45", "R45"];
/** "Wander" draws one number from 0 to this many minus 1. */
const WANDER_DRAWS = 2 * WANDER_TURNS.length;
/** "Go to a place" looks this far down a line to find the most open direction. */
const OPEN_LINE_CAP = 6;

/** The move of each value of the "Turn" action's "way" parameter. */
const TURN_MOVES: Readonly<Record<string, Move>> = { left: "L", right: "R", slightLeft: "L45", slightRight: "R45" };

function turnMoveOf(way: string): Move {
  const move = TURN_MOVES[way];
  if (move === undefined) throw new Error(`Unknown turn way "${way}". Run the strategy through parseStrategy first.`);
  return move;
}

function withTarget(ctx: DecisionContext, params: ParamValues, act: (target: BotState) => Move): Move | null {
  const target = pickTarget(ctx, params);
  return target === null ? null : act(target);
}

function arenaCentre(ctx: DecisionContext): Cell {
  return { x: Math.floor((ctx.snapshot.width - 1) / 2), y: Math.floor((ctx.snapshot.height - 1) / 2) };
}

/** The corner nearest to the bot. A tie goes to the smaller y, then the smaller x. */
function nearestCorner(ctx: DecisionContext): Cell {
  const { width, height } = ctx.snapshot;
  const corners: readonly Cell[] = [
    { x: 0, y: 0 },
    { x: width - 1, y: 0 },
    { x: 0, y: height - 1 },
    { x: width - 1, y: height - 1 },
  ];
  let best: Cell | null = null;
  for (const corner of corners) {
    if (best === null || chebyshev(ctx.self, corner) < chebyshev(ctx.self, best)) best = corner;
  }
  if (best === null) throw new Error("an arena has corners");
  return best;
}

/** The 8 directions by turn cost, right before left: ahead, 45 right, 45 left, 90 right, 90 left, 135 right, 135 left, behind. It settles equal choices. */
function aheadRightLeftBehind(direction: Direction): readonly Direction[] {
  return [0, 1, -1, 2, -2, 3, -3, 4].map((eighths) => rotate(direction, eighths));
}

/** The 8 directions by turn cost, left before right: ahead, 45 left, 45 right, 90 left, 90 right, 135 left, 135 right, behind. */
function aheadLeftRightBehind(direction: Direction): readonly Direction[] {
  return [0, -1, 1, -2, 2, -3, 3, 4].map((eighths) => rotate(direction, eighths));
}

/** Faces the direction with the most open cells, then throws, so the bot holds a place without turning away. */
function holdFacingOpenSpace(ctx: DecisionContext): Move {
  let best: Direction | null = null;
  let bestRoom = -1;
  for (const direction of aheadRightLeftBehind(ctx.self.direction)) {
    const room = Math.min(roomAhead(ctx.snapshot, ctx.self, direction), OPEN_LINE_CAP);
    if (room > bestRoom) {
      best = direction;
      bestRoom = room;
    }
  }
  if (best === null) throw new Error("a bot has eight directions");
  return steerTowards(ctx, best, "T");
}

function movePlace(ctx: DecisionContext, place: Cell): Move {
  if (ctx.self.x === place.x && ctx.self.y === place.y) return holdFacingOpenSpace(ctx);
  return stepTowards(ctx, stepToward(ctx.self, place));
}

const defs = withLiteralIds<ActionDef>()([
  {
    id: "throw",
    group: ATTACK,
    label: "Throw",
    params: [],
    // A throw at an empty line costs nothing, so it is also the way to stand still. A throw at a bot spends water.
    toMove: () => "T",
  },
  {
    id: "attack",
    group: ATTACK,
    label: "Attack {target}",
    params: [targetParam()],
    // In order: throw when the target is the first bot in the line; turn toward the
    // target when it stands in my row, column or diagonal within my range (a bot in
    // between takes the throw); otherwise move toward it.
    toMove: (ctx, params) =>
      withTarget(ctx, params, (target) => {
        const { self, snapshot } = ctx;
        const range = throwRange(self.build, rulesAt(snapshot, self.x, self.y));
        if (firstBotInLine(snapshot, self, range)?.bot.id === target.id) return "T";
        const shared = straightLineDirection(self, target);
        if (shared !== null && chebyshev(self, target) <= range) return steerTowards(ctx, shared, "T");
        return stepTowards(ctx, stepToward(self, target));
      }),
  },
  {
    id: "faceTarget",
    group: ATTACK,
    label: "Turn to face {target}",
    params: [targetParam()],
    // When the bot already faces the target, the move is a throw: it keeps the
    // bot where it is and turning again would look away.
    toMove: (ctx, params) =>
      withTarget(ctx, params, (target) => steerTowards(ctx, directionToFace(ctx.self, target), "T")),
  },
  {
    id: "moveToward",
    group: CHASE_AND_FLEE,
    label: "Move toward {target}",
    params: [targetParam()],
    toMove: (ctx, params) => withTarget(ctx, params, (target) => stepTowards(ctx, stepToward(ctx.self, target))),
  },
  {
    id: "moveAway",
    group: CHASE_AND_FLEE,
    label: "Move away from {target}",
    params: [targetParam()],
    // A bot with no free cell that takes it farther away is cornered and throws.
    toMove: (ctx, params) =>
      withTarget(ctx, params, (target) => {
        const direction = stepAway(ctx.snapshot, ctx.self, target);
        return direction === null ? "T" : steerTowards(ctx, direction, "F");
      }),
  },
  {
    id: "stepOutOfLine",
    group: CHASE_AND_FLEE,
    label: "Step out of the line of fire",
    params: [],
    // Takes the first free neighbour cell, of the 8, that no bot could hit, in the
    // order of the fewest turn moves and left before right. It does not use the
    // rule's target. With nobody aimed at the bot it cannot act; with no safe cell it throws.
    toMove: (ctx) => {
      const { self, snapshot } = ctx;
      if (botsThatCanHit(snapshot, self).length === 0) return null;
      for (const direction of aheadLeftRightBehind(self.direction)) {
        const cell = neighbour(self, direction);
        if (isFree(snapshot, cell) && !isCellInLineOfFire(snapshot, cell, self)) {
          return steerTowards(ctx, direction, "F");
        }
      }
      return "T";
    },
  },
  {
    id: "awayFromCrowd",
    group: CHASE_AND_FLEE,
    label: "Move away from the crowd",
    params: [],
    // Steps onto the free neighbour cell with the fewest bots within CROWD_RADIUS,
    // when that is strictly fewer than here. Otherwise it throws.
    toMove: (ctx) => {
      const { self, snapshot } = ctx;
      const crowdAt = (cell: Cell): number => {
        let crowd = 0;
        forEachBotNear(snapshot, cell.x, cell.y, CROWD_RADIUS, (other) => {
          if (other.id !== self.id) crowd += 1;
        });
        return crowd;
      };
      let best: Direction | null = null;
      let bestCrowd = crowdAt(self);
      for (const direction of aheadRightLeftBehind(self.direction)) {
        const cell = neighbour(self, direction);
        if (!isFree(snapshot, cell)) continue;
        const crowd = crowdAt(cell);
        if (crowd < bestCrowd) {
          best = direction;
          bestCrowd = crowd;
        }
      }
      return best === null ? "T" : steerTowards(ctx, best, "F");
    },
  },
  {
    id: "goToPlace",
    group: POSITION,
    label: "Go to {place}",
    params: [
      {
        kind: "choice",
        key: "place",
        label: "Place",
        options: [
          { value: "middle", label: "the middle of the arena" },
          { value: "corner", label: "the nearest corner" },
        ],
        default: "middle",
      },
    ],
    // On the place the bot faces its most open direction and throws, so it holds the place.
    toMove: (ctx, params) =>
      movePlace(ctx, textValue(params, "place") === "corner" ? nearestCorner(ctx) : arenaCentre(ctx)),
  },
  {
    id: "goForward",
    group: BASIC,
    label: "Walk forward (throw at a bot in the way, turn at a wall)",
    params: [],
    toMove: (ctx) => goForward(ctx),
  },
  {
    id: "stepForward",
    group: BASIC,
    label: "Step forward (stay in place when the cell is held)",
    params: [],
    // The only action that can fail: a wall or a bot that moved into the cell first keeps the bot where it is.
    toMove: () => "F",
  },
  {
    id: "turn",
    group: BASIC,
    label: "Turn {way}",
    params: [
      {
        kind: "choice",
        key: "way",
        label: "Way",
        options: [
          { value: "left", label: "left" },
          { value: "right", label: "right" },
          { value: "slightLeft", label: "slightly left (45 degrees)" },
          { value: "slightRight", label: "slightly right (45 degrees)" },
        ],
        default: "left",
      },
    ],
    // "left" and "right" keep their meaning of 90 degrees, so saved strategies play as before.
    toMove: (_ctx, params) => turnMoveOf(textValue(params, "way")),
  },
  {
    id: "wander",
    group: BASIC,
    label: "Wander (a random walk)",
    params: [],
    // One draw: 0 to 3 walk forward, 4 and 5 turn 90 degrees left and right, 6 and
    // 7 turn 45 degrees left and right. Half the draws walk, as with four directions.
    // Walking forward at a wall turns, so the draw count stays one.
    toMove: (ctx, _params, rng) => {
      const draw = rng.int(WANDER_DRAWS);
      if (draw < WANDER_TURNS.length) return goForward(ctx);
      const turn = WANDER_TURNS[draw - WANDER_TURNS.length];
      if (turn === undefined) throw new Error(`unreachable: draw ${draw} is below ${WANDER_DRAWS}`);
      return turn;
    },
  },
  {
    id: "wait",
    group: BASIC,
    label: "Wait",
    params: [],
    // A step of a sequence (S3): stand still without a throw, so a tank in line is not shot at.
    toMove: () => "W",
  },
  {
    id: "goToItem",
    group: ITEMS,
    label: "Go to the nearest item ({item})",
    params: [itemParam()],
    // It cannot act when no such item is on the board or the tank's hand is full, because the
    // tank would not take the item. After the older entries, so their order stays.
    toMove: (ctx, params) => {
      const item = canTake(ctx.self) ? nearestItem(ctx.snapshot, ctx.self, itemValue(params)) : undefined;
      return item === undefined ? null : stepTowards(ctx, stepToward(ctx.self, item));
    },
  },
]);

export type ActionId = (typeof defs)[number]["id"];

/** Every id of the table, in table order. */
export const ACTION_IDS: readonly ActionId[] = defs.map((def) => def.id);

export const ACTIONS: Readonly<Record<string, ActionDef>> = tableOf(defs);
