// The catalogue's board scenes: a few turns on a small board, written as data and drawn by the
// game's own board (board/ArenaBoard.tsx), so an item, a condition or an ultimate looks exactly
// as it does in a round: the jet, the "+1" or "+2", the wobble of a hit, the umbrella that opens,
// the dizzy stars, the mud, the water gauge and the ground of the condition. The play styles do
// not use these: the workshop's scenes act them out already (prep/PlayStyleScene.tsx).
//
// Each scene loops. Its steps are turns; ScenePlayer.tsx numbers them, so every loop replays them.

import { POINTS_PER_HIT, ULTIMATE_RULES, itemHandOf, ruleSet, waterAfterTick, type BoardItem, type BotId, type BotState, type Direction, type ItemKind, type RuleSetId, type Snapshot, type TankEffect, type ThrowEvent, type UltimateEffect, type UltimateFire, type UltimateId, type WaitingItems } from "@game/engine";

/** One turn of a scene: the board after it, and the shots of it. */
export interface SceneStep {
  readonly snapshot: Snapshot;
  readonly throws: readonly ThrowEvent[];
  readonly fires: readonly UltimateFire[];
}

export interface Scene {
  readonly steps: readonly SceneStep[];
  /** The step shown under reduced motion before the viewer steps: the moment that tells the story. */
  readonly keyStep: number;
}

/** The scene's tanks: "you" wears the orange ring; the others are plain tanks. */
export const SCENE_TANKS = ["you", "a", "b", "c", "d", "e", "f", "g", "h"] as const;
export type SceneTankId = (typeof SCENE_TANKS)[number];

interface Pose {
  readonly x: number;
  readonly y: number;
  readonly dir: Direction;
  readonly score?: number;
  /** Water now; the condition's full tank when left out. */
  readonly water?: number;
  readonly item?: ItemKind;
  readonly effect?: TankEffect;
  readonly active?: UltimateEffect;
  readonly waiting?: WaitingItems;
}

type Shot = readonly [from: SceneTankId, to: SceneTankId, outcome: "hit" | "miss" | "blocked" | "dry" | "dodged", bucket?: true];

interface Turn {
  readonly tanks: Partial<Record<SceneTankId, Pose>>;
  readonly items?: readonly Omit<BoardItem, "turnsLeft">[];
  readonly shots?: readonly Shot[];
  readonly fire?: UltimateFire;
}

function tank(id: SceneTankId, pose: Pose, ruleSetId: RuleSetId, hit: boolean): BotState {
  return {
    id,
    x: pose.x,
    y: pose.y,
    direction: pose.dir,
    score: pose.score ?? 0,
    wasHit: hit,
    lastHitBy: null,
    ticksSinceHit: null,
    lastMove: null,
    modeId: "scene",
    build: {},
    ticksInMode: 0,
    water: pose.water ?? ruleSet(ruleSetId).waterCapacity,
    hitsLanded: 0,
    hitsTaken: 0,
    ticksSinceLandedHit: null,
    ...itemHandOf({ item: pose.item ?? null, itemsWaiting: pose.waiting }),
    itemUses: pose.item === undefined ? 0 : 2,
    effect: pose.effect ?? null,
    ...(pose.active === undefined ? {} : { ultimateEffect: pose.active }),
  };
}

function scene(ruleSetId: RuleSetId, width: number, height: number, turns: readonly Turn[], keyStep: number, ultimate?: UltimateId): Scene {
  const steps = turns.map((turn, index): SceneStep => {
    const throws = (turn.shots ?? []).map(([from, to, outcome, bucket]): ThrowEvent => {
      const a = turn.tanks[from];
      const b = turn.tanks[to];
      if (a === undefined || b === undefined) throw new Error(`A shot of a scene names a tank that is not on the board: ${from} at ${to}.`);
      const distance = Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
      if (outcome === "dry" || outcome === "dodged") return { throwerId: from, outcome, targetId: to, distance };
      const hitChance = b.active?.kind === "smoke" ? Math.floor(60 / ULTIMATE_RULES.smoke.chanceDivisor) : 60;
      return { throwerId: from, outcome, targetId: to, distance, hitChance, ...(bucket === true ? { bucket } : {}) };
    });
    if (turn.fire?.kind === "dash") throws.push(turn.fire.shot);
    const hitIds = new Set(throws.filter((t) => t.outcome === "hit").map((t) => (t.outcome === "hit" ? t.targetId : "")));
    const bots = SCENE_TANKS.flatMap<BotState>((id) => {
      const pose = turn.tanks[id];
      if (pose === undefined) return [];
      const state = tank(id, pose, ruleSetId, hitIds.has(id));
      if (id !== "you" || ultimate === undefined) return [state];
      return [{
        ...state,
        ultimate: index === 0 ? { kind: "ready", id: ultimate } : { kind: "charging", id: ultimate, turnsLeft: ULTIMATE_RULES.rechargeTurns, turnsTotal: ULTIMATE_RULES.rechargeTurns },
      }];
    });
    return {
      snapshot: { width, height, tick: index, ticksTotal: turns.length, survivorsAfterRound: null, ruleSetId, bots, items: (turn.items ?? []).map((item) => ({ ...item, turnsLeft: 20 })) },
      throws,
      fires: turn.fire === undefined ? [] : [turn.fire],
    };
  });
  return { steps, keyStep };
}

// --- Items (the board legend says each in words) -------------------------------------------------

const DIZZY: TankEffect = { kind: "dizzy", turnsLeft: 6 };
const STUCK: TankEffect = { kind: "stuck", turnsLeft: 4 };

export const ITEM_SCENES: Readonly<Record<ItemKind, Scene>> = {
  // You drive onto the bucket, then a hit takes 2 points instead of 1.
  bucket: scene("standard", 5, 3, [
    { tanks: { you: { x: 0, y: 1, dir: "E" }, a: { x: 4, y: 1, dir: "W" } }, items: [{ kind: "bucket", x: 1, y: 1 }] },
    { tanks: { you: { x: 1, y: 1, dir: "E", item: "bucket" }, a: { x: 4, y: 1, dir: "W" } } },
    { tanks: { you: { x: 1, y: 1, dir: "E", item: "bucket", score: 2, water: 6 }, a: { x: 4, y: 1, dir: "W", score: -2 } }, shots: [["you", "a", "hit", true]] },
    { tanks: { you: { x: 1, y: 1, dir: "E", item: "bucket", score: 2, water: 7 }, a: { x: 4, y: 1, dir: "W", score: -2 } } },
  ], 2),
  // A shot at your tank meets the umbrella, which opens, so no point moves.
  umbrella: scene("standard", 5, 3, [
    { tanks: { you: { x: 3, y: 1, dir: "W", item: "umbrella" }, a: { x: 0, y: 1, dir: "E" } } },
    { tanks: { you: { x: 3, y: 1, dir: "W", item: "umbrella" }, a: { x: 0, y: 1, dir: "E", water: 6 } }, shots: [["a", "you", "blocked"]] },
    { tanks: { you: { x: 3, y: 1, dir: "W", item: "umbrella" }, a: { x: 0, y: 1, dir: "E", water: 7 } } },
  ], 1),
  // Your hit with the pinwheel makes the other tank dizzy: it spins round to the right for 2 turns, so it ends
  // facing away, and then checks its rules from the bottom up (items/items.ts ITEM_RULES.dizzySpinTurns).
  pinwheel: scene("standard", 5, 3, [
    { tanks: { you: { x: 0, y: 1, dir: "E", item: "pinwheel" }, a: { x: 3, y: 1, dir: "W" } } },
    { tanks: { you: { x: 0, y: 1, dir: "E", score: 1, water: 6 }, a: { x: 3, y: 1, dir: "W", score: -1, effect: DIZZY } }, shots: [["you", "a", "hit"]] },
    { tanks: { you: { x: 0, y: 1, dir: "E", score: 1, water: 7 }, a: { x: 3, y: 1, dir: "N", score: -1, effect: { kind: "dizzy", turnsLeft: 5 } } } },
    { tanks: { you: { x: 0, y: 1, dir: "E", score: 1, water: 8 }, a: { x: 3, y: 1, dir: "E", score: -1, effect: { kind: "dizzy", turnsLeft: 4 } } } },
    { tanks: { you: { x: 0, y: 1, dir: "E", score: 1, water: 9 }, a: { x: 4, y: 1, dir: "E", score: -1, effect: { kind: "dizzy", turnsLeft: 3 } } } },
  ], 3),
  // Your hit with the mud ball sticks the other tank in mud.
  mudBall: scene("standard", 5, 3, [
    { tanks: { you: { x: 0, y: 1, dir: "E", item: "mudBall" }, a: { x: 3, y: 1, dir: "W" } } },
    { tanks: { you: { x: 0, y: 1, dir: "E", score: 1, water: 6 }, a: { x: 3, y: 1, dir: "W", score: -1, effect: STUCK } }, shots: [["you", "a", "hit"]] },
    { tanks: { you: { x: 0, y: 1, dir: "E", score: 1, water: 7 }, a: { x: 3, y: 1, dir: "W", score: -1, effect: STUCK } } },
  ], 2),
};

// --- Arena conditions (each on its own ground) ------------------------------------------------------

export const CONDITION_SCENES: Readonly<Record<RuleSetId, Scene>> = {
  // A shot reaches 3 squares and uses 3 of the 9 water.
  standard: scene("standard", 5, 3, [
    { tanks: { you: { x: 0, y: 1, dir: "E" }, a: { x: 3, y: 1, dir: "W" } } },
    { tanks: { you: { x: 0, y: 1, dir: "E", score: 1, water: 6 }, a: { x: 3, y: 1, dir: "W", score: -1 } }, shots: [["you", "a", "hit"]] },
    { tanks: { you: { x: 0, y: 1, dir: "E", score: 1, water: 7 }, a: { x: 3, y: 1, dir: "W", score: -1 } } },
  ], 1),
  // A shot reaches 1 square: the tank drives up close first.
  "arms-length": scene("arms-length", 5, 3, [
    { tanks: { you: { x: 0, y: 1, dir: "E" }, a: { x: 3, y: 1, dir: "W" } } },
    { tanks: { you: { x: 1, y: 1, dir: "E" }, a: { x: 3, y: 1, dir: "W" } } },
    { tanks: { you: { x: 2, y: 1, dir: "E" }, a: { x: 3, y: 1, dir: "W" } } },
    { tanks: { you: { x: 2, y: 1, dir: "E", score: 1, water: 6 }, a: { x: 3, y: 1, dir: "W", score: -1 } }, shots: [["you", "a", "hit"]] },
  ], 3),
  // One shot uses 5 of the 6 water, so the next shot only drips.
  "dry-spell": scene("dry-spell", 5, 3, [
    { tanks: { you: { x: 0, y: 1, dir: "E" }, a: { x: 2, y: 1, dir: "W" } } },
    { tanks: { you: { x: 0, y: 1, dir: "E", score: 1, water: 1 }, a: { x: 2, y: 1, dir: "W", score: -1 } }, shots: [["you", "a", "hit"]] },
    { tanks: { you: { x: 0, y: 1, dir: "E", score: 1, water: 2 }, a: { x: 2, y: 1, dir: "W", score: -1 } }, shots: [["you", "a", "dry"]] },
  ], 2),
  // A field twice as large: the tanks start far apart and drive a long way.
  "open-field": scene("open-field", 8, 4, [
    { tanks: { you: { x: 0, y: 0, dir: "SE" }, a: { x: 7, y: 3, dir: "NW" } } },
    { tanks: { you: { x: 1, y: 1, dir: "SE" }, a: { x: 6, y: 3, dir: "W" } } },
    { tanks: { you: { x: 2, y: 2, dir: "E" }, a: { x: 5, y: 3, dir: "W" } } },
    { tanks: { you: { x: 3, y: 2, dir: "E" }, a: { x: 5, y: 2, dir: "W" } } },
    { tanks: { you: { x: 3, y: 2, dir: "E", score: 1, water: 6 }, a: { x: 5, y: 2, dir: "W", score: -1 } }, shots: [["you", "a", "hit"]] },
  ], 4),
  // Aim and Dodge count double: the tank with Aim hits, the shot at the tank with Dodge misses.
  "sharp-eyes": scene("sharp-eyes", 5, 3, [
    { tanks: { you: { x: 0, y: 1, dir: "E" }, a: { x: 2, y: 1, dir: "W" } } },
    { tanks: { you: { x: 0, y: 1, dir: "E", score: 1, water: 6 }, a: { x: 2, y: 1, dir: "W", score: -1, water: 6 } }, shots: [["you", "a", "hit"], ["a", "you", "miss"]] },
    { tanks: { you: { x: 0, y: 1, dir: "E", score: 1, water: 7 }, a: { x: 2, y: 1, dir: "W", score: -1, water: 7 } } },
  ], 1),
  // A shot reaches 1 square and uses 2 of the 12 water, so a tank shoots again and again.
  downpour: scene("downpour", 5, 3, [
    { tanks: { you: { x: 1, y: 1, dir: "E" }, a: { x: 2, y: 1, dir: "W" } } },
    { tanks: { you: { x: 1, y: 1, dir: "E", score: 1, water: 10 }, a: { x: 2, y: 1, dir: "W", score: -1 } }, shots: [["you", "a", "hit"]] },
    { tanks: { you: { x: 1, y: 1, dir: "E", score: 2, water: 8 }, a: { x: 2, y: 1, dir: "W", score: -2 } }, shots: [["you", "a", "hit"]] },
    { tanks: { you: { x: 1, y: 1, dir: "E", score: 3, water: 6 }, a: { x: 2, y: 1, dir: "W", score: -3 } }, shots: [["you", "a", "hit"]] },
  ], 2),
};

// --- Ultimates (85-ultimates.md) --------------------------------------------------------------------
//
// The scene's turn carries the same fire as a live turn. The board draws the charge, the effect
// and the points from it, then shows what is left on the tanks in the following turns.

type Square = UltimateFire["at"];

function squareArea({ x, y }: Square, reach: number, width: number, height: number): Square[] {
  const area: Square[] = [];
  for (let row = Math.max(0, y - reach); row <= Math.min(y + reach, height - 1); row++) {
    for (let col = Math.max(0, x - reach); col <= Math.min(x + reach, width - 1); col++) area.push({ x: col, y: row });
  }
  return area;
}

const DASH_SHOT = { throwerId: "you", outcome: "hit", targetId: "a", distance: 1, hitChance: 100 } as const;

const RING_TANKS = {
  a: { x: 0, y: 0, dir: "SE" },
  b: { x: 1, y: 0, dir: "S" },
  c: { x: 2, y: 0, dir: "SW" },
  d: { x: 0, y: 1, dir: "E" },
  e: { x: 2, y: 1, dir: "W" },
  f: { x: 0, y: 2, dir: "NE" },
  g: { x: 1, y: 2, dir: "N" },
  h: { x: 2, y: 2, dir: "NW" },
} as const satisfies Partial<Record<SceneTankId, Pose>>;
const RING_HITS = (["b", "c", "e", "h", "g", "f", "d", "a"] as const).map((targetId) =>
  ({ x: RING_TANKS[targetId].x, y: RING_TANKS[targetId].y, targetId, outcome: "hit" as const }));
const RING_SCORE = RING_HITS.length * ULTIMATE_RULES.splash.points;
const RING_AFTER = Object.fromEntries(Object.entries(RING_TANKS).map(([id, pose]) => [id, { ...pose, score: -ULTIMATE_RULES.splash.points }]));

const MUD_TARGET = { x: 3, y: 1 };
const MUD_TANKS: Turn["tanks"] = {
  you: { x: 0, y: 1, dir: "E" },
  a: { ...MUD_TARGET, dir: "W" },
  b: { x: 4, y: 0, dir: "SW" },
  c: { x: 4, y: 2, dir: "NW" },
};
function mudAfter(turnsLeft: number): Turn["tanks"] {
  const effect = { kind: "stuck", turnsLeft } as const;
  return {
    you: { x: 0, y: 1, dir: "E", score: 3 },
    a: { ...MUD_TARGET, dir: "W", score: -1, effect },
    b: { x: 4, y: 0, dir: "SW", score: -1, effect },
    c: { x: 4, y: 2, dir: "NW", score: -1, effect },
  };
}

const WIND_START = {
  you: { x: 2, y: 1, dir: "N" },
  a: { x: 0, y: 0, dir: "E" },
  b: { x: 4, y: 1, dir: "W" },
  c: { x: 2, y: 2, dir: "N" },
} as const satisfies Turn["tanks"];
function windAfter(turn: number, a: Direction, b: Direction, c: Direction): Turn["tanks"] {
  const { dizzyTurns, spinTurns } = ULTIMATE_RULES.whirlwind;
  const turnsLeft = dizzyTurns - turn;
  const caught = turnsLeft === 0 ? {} : { effect: { kind: "dizzy", turnsLeft, spinTurnsLeft: Math.max(0, spinTurns - turn) } as const };
  return {
    you: { ...WIND_START.you, score: POINTS_PER_HIT },
    a: { ...WIND_START.a, dir: a, ...caught },
    b: { ...WIND_START.b, dir: b, ...caught },
    c: { ...WIND_START.c, dir: c, score: -POINTS_PER_HIT, ...caught },
  };
}

const MAGNET_PULLS = [
  { kind: "umbrella", from: { x: 1, y: 0 } },
  { kind: "pinwheel", from: { x: 5, y: 2 } },
] as const;
const MAGNET_BUCKET = { kind: ULTIMATE_RULES.magnet.newItem } as const;
const MAGNET_HAND = { x: 3, y: 1, dir: "N", item: MAGNET_PULLS[0].kind, waiting: [MAGNET_PULLS[1].kind, MAGNET_BUCKET.kind] } as const;

export const ULTIMATE_SCENES: Readonly<Record<UltimateId, Scene>> = {
  dash: scene("standard", 5, 3, [
    { tanks: { you: { x: 0, y: 1, dir: "E" }, a: { x: 4, y: 1, dir: "W" } } },
    {
      tanks: { you: { x: 3, y: 1, dir: "E", score: 2 }, a: { x: 4, y: 1, dir: "W", score: -2, water: 6 } },
      shots: [["a", "you", "dodged"]],
      fire: { botId: "you", kind: "dash", at: { x: 0, y: 1 }, path: [{ x: 1, y: 1 }, { x: 2, y: 1 }, { x: 3, y: 1 }], shot: DASH_SHOT, points: 2 },
    },
    { tanks: { you: { x: 3, y: 1, dir: "E", score: 2 }, a: { x: 4, y: 1, dir: "W", score: -2, water: 7 } } },
  ], 1, "dash"),
  smoke: scene("standard", 5, 3, [
    { tanks: { you: { x: 3, y: 1, dir: "W" }, a: { x: 0, y: 1, dir: "E" } } },
    {
      tanks: { you: { x: 3, y: 1, dir: "W", active: { kind: "smoke", turnsLeft: 14 } }, a: { x: 0, y: 1, dir: "E", water: 6 } },
      shots: [["a", "you", "miss"]],
      fire: { botId: "you", kind: "smoke", at: { x: 3, y: 1 } },
    },
    { tanks: { you: { x: 3, y: 1, dir: "W", active: { kind: "smoke", turnsLeft: 13 } }, a: { x: 0, y: 1, dir: "E", water: 3 } }, shots: [["a", "you", "miss"]] },
    { tanks: { you: { x: 3, y: 1, dir: "W", score: -1, active: { kind: "smoke", turnsLeft: 12 } }, a: { x: 0, y: 1, dir: "E", score: 1, water: 0 } }, shots: [["a", "you", "hit"]] },
  ], 1, "smoke"),
  splash: scene("standard", 3, 3, [
    { tanks: { you: { x: 1, y: 1, dir: "N" }, ...RING_TANKS } },
    {
      tanks: { you: { x: 1, y: 1, dir: "N", score: RING_SCORE, water: ULTIMATE_RULES.splash.waterAfter }, ...RING_AFTER },
      fire: { botId: "you", kind: "splash", at: { x: 1, y: 1 }, squares: RING_HITS },
    },
    { tanks: { you: { x: 1, y: 1, dir: "N", score: RING_SCORE, water: waterAfterTick(ULTIMATE_RULES.splash.waterAfter, false, ruleSet("standard")) }, ...RING_AFTER } },
  ], 1, "splash"),
  fullTank: scene("standard", 5, 3, [
    { tanks: { you: { x: 0, y: 1, dir: "E", water: 1 }, a: { x: 2, y: 1, dir: "W" } } },
    {
      tanks: { you: { x: 0, y: 1, dir: "E", water: 9, active: { kind: "fullTank", freeShots: 3 } }, a: { x: 2, y: 1, dir: "W" } },
      fire: { botId: "you", kind: "fullTank", at: { x: 0, y: 1 } },
    },
    { tanks: { you: { x: 0, y: 1, dir: "E", score: 1, water: 9 }, a: { x: 2, y: 1, dir: "W", score: -1 } }, shots: [["you", "a", "hit"]] },
    { tanks: { you: { x: 0, y: 1, dir: "E", score: 2, water: 9 }, a: { x: 2, y: 1, dir: "W", score: -2 } }, shots: [["you", "a", "hit"]] },
    { tanks: { you: { x: 0, y: 1, dir: "E", score: 3, water: 9 }, a: { x: 2, y: 1, dir: "W", score: -3 } }, shots: [["you", "a", "hit"]] },
  ], 1, "fullTank"),
  mudBomb: scene("standard", 5, 3, [
    { tanks: MUD_TANKS },
    { tanks: mudAfter(5), fire: { botId: "you", kind: "mudBomb", at: { x: 0, y: 1 }, center: MUD_TARGET, area: squareArea(MUD_TARGET, 1, 5, 3), affected: ["a", "b", "c"], points: 3 } },
    { tanks: mudAfter(4) },
    { tanks: mudAfter(3) },
  ], 1, "mudBomb"),
  whirlwind: scene("standard", 5, 3, [
    { tanks: WIND_START },
    {
      tanks: windAfter(0, "E", "W", "N"),
      fire: { botId: "you", kind: "whirlwind", at: { x: 2, y: 1 }, area: squareArea({ x: 2, y: 1 }, ULTIMATE_RULES.whirlwind.reach, 5, 3), affected: ["a", "b", "c"], points: POINTS_PER_HIT },
    },
    { tanks: windAfter(1, "S", "N", "E") },
    { tanks: windAfter(2, "W", "E", "S") },
    { tanks: windAfter(3, "N", "S", "W") },
    { tanks: windAfter(4, "E", "W", "N") },
  ], 1, "whirlwind"),
  // A shot from the tank's side uses a block. The shot from behind still lands.
  bigUmbrella: scene("standard", 5, 3, [
    { tanks: { you: { x: 2, y: 1, dir: "W" }, a: { x: 2, y: 0, dir: "S" }, b: { x: 4, y: 1, dir: "W" } } },
    {
      tanks: { you: { x: 2, y: 1, dir: "W", score: -1, active: { kind: "bigUmbrella", blocksLeft: 3 } }, a: { x: 2, y: 0, dir: "S", water: 6 }, b: { x: 4, y: 1, dir: "W", score: 1, water: 6 } },
      shots: [["a", "you", "blocked"], ["b", "you", "hit"]],
      fire: { botId: "you", kind: "bigUmbrella", at: { x: 2, y: 1 } },
    },
    { tanks: { you: { x: 2, y: 1, dir: "W", score: -1, active: { kind: "bigUmbrella", blocksLeft: 3 } }, a: { x: 2, y: 0, dir: "S", water: 7 }, b: { x: 4, y: 1, dir: "W", score: 1, water: 7 } } },
  ], 1, "bigUmbrella"),
  magnet: scene("standard", 7, 3, [
    { tanks: { you: { x: 3, y: 1, dir: "N" } }, items: MAGNET_PULLS.map(({ kind, from }) => ({ kind, ...from })) },
    {
      tanks: { you: MAGNET_HAND },
      fire: { botId: "you", kind: "magnet", at: { x: 3, y: 1 }, items: [...MAGNET_PULLS, MAGNET_BUCKET] },
    },
    { tanks: { you: MAGNET_HAND } },
  ], 1, "magnet"),
};

export function sceneNames(): Readonly<Record<SceneTankId, string>> {
  return { you: "A", a: "B", b: "C", c: "D", d: "E", e: "F", f: "G", g: "H", h: "I" };
}
