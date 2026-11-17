// The catalogue's board scenes: a few turns on a small board, written as data and drawn by the
// game's own board (board/ArenaBoard.tsx), so an item, a condition or an ultimate looks exactly
// as it does in a round: the jet, the "+1" or "+2", the wobble of a hit, the umbrella that opens,
// the dizzy stars, the mud, the water gauge and the ground of the condition. The play styles do
// not use these: the workshop's scenes act them out already (prep/PlayStyleScene.tsx).
//
// The scenes of the ultimates are drawings of a plan: the game does not have ultimates yet, so
// they reuse what the board can draw (a long glide, misses, several jets, a full gauge, mud,
// stars, the umbrella, items that move).
//
// Each scene loops. Its steps are turns; ScenePlayer.tsx numbers them, so every loop replays them.

import { ruleSet, type BoardItem, type BotId, type BotState, type Direction, type ItemKind, type RuleSetId, type Snapshot, type TankEffect, type ThrowEvent } from "@game/engine";
import type { UltimateId } from "./messages.ts";

/** One turn of a scene: the board after it, and the shots of it. */
export interface SceneStep {
  readonly snapshot: Snapshot;
  readonly throws: readonly ThrowEvent[];
}

export interface Scene {
  readonly steps: readonly SceneStep[];
  /** The step shown under reduced motion before the viewer steps: the moment that tells the story. */
  readonly keyStep: number;
}

/** The scene's tanks: "you" wears the orange ring; the others are plain tanks. */
export const SCENE_TANKS = ["you", "a", "b", "c"] as const;
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
}

type Shot = readonly [from: SceneTankId, to: SceneTankId, outcome: "hit" | "miss" | "blocked" | "dry", bucket?: true];

interface Turn {
  readonly tanks: Partial<Record<SceneTankId, Pose>>;
  readonly items?: readonly Omit<BoardItem, "turnsLeft">[];
  readonly shots?: readonly Shot[];
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
    item: pose.item ?? null,
    itemUses: pose.item === undefined ? 0 : 2,
    effect: pose.effect ?? null,
  };
}

function scene(ruleSetId: RuleSetId, width: number, height: number, turns: readonly Turn[], keyStep: number): Scene {
  const steps = turns.map((turn, index): SceneStep => {
    const throws = (turn.shots ?? []).map(([from, to, outcome, bucket]): ThrowEvent => {
      const a = turn.tanks[from];
      const b = turn.tanks[to];
      if (a === undefined || b === undefined) throw new Error(`A shot of a scene names a tank that is not on the board: ${from} at ${to}.`);
      const distance = Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
      if (outcome === "dry") return { throwerId: from, outcome, targetId: to, distance };
      return { throwerId: from, outcome, targetId: to, distance, hitChance: 60, ...(bucket === true ? { bucket } : {}) };
    });
    const hitIds = new Set(throws.filter((t) => t.outcome === "hit").map((t) => (t.outcome === "hit" ? t.targetId : "")));
    const bots = SCENE_TANKS.flatMap((id) => {
      const pose = turn.tanks[id];
      return pose === undefined ? [] : [tank(id, pose, ruleSetId, hitIds.has(id))];
    });
    return {
      snapshot: { width, height, tick: index, ticksTotal: turns.length, survivorsAfterRound: null, ruleSetId, bots, items: (turn.items ?? []).map((item) => ({ ...item, turnsLeft: 20 })) },
      throws,
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
  // Your hit with the pinwheel makes the other tank dizzy.
  pinwheel: scene("standard", 5, 3, [
    { tanks: { you: { x: 0, y: 1, dir: "E", item: "pinwheel" }, a: { x: 3, y: 1, dir: "W" } } },
    { tanks: { you: { x: 0, y: 1, dir: "E", score: 1, water: 6 }, a: { x: 3, y: 1, dir: "W", score: -1, effect: DIZZY } }, shots: [["you", "a", "hit"]] },
    { tanks: { you: { x: 0, y: 1, dir: "E", score: 1, water: 7 }, a: { x: 3, y: 1, dir: "S", score: -1, effect: DIZZY } } },
    { tanks: { you: { x: 0, y: 1, dir: "E", score: 1, water: 8 }, a: { x: 3, y: 1, dir: "N", score: -1, effect: DIZZY } } },
  ], 2),
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
    { tanks: { you: { x: 1, y: 1, dir: "E", score: 2, water: 9 }, a: { x: 2, y: 1, dir: "W", score: -2 } }, shots: [["you", "a", "hit"]] },
    { tanks: { you: { x: 1, y: 1, dir: "E", score: 3, water: 8 }, a: { x: 2, y: 1, dir: "W", score: -3 } }, shots: [["you", "a", "hit"]] },
  ], 2),
};

// --- Ultimates (a plan; the board draws it with what it has) -----------------------------------------

export const ULTIMATE_SCENES: Readonly<Record<UltimateId, Scene>> = {
  dash: scene("standard", 5, 3, [
    { tanks: { you: { x: 0, y: 1, dir: "E" }, a: { x: 4, y: 1, dir: "W" } } },
    { tanks: { you: { x: 3, y: 1, dir: "E" }, a: { x: 4, y: 1, dir: "W" } } },
    { tanks: { you: { x: 3, y: 1, dir: "E", score: 1, water: 6 }, a: { x: 4, y: 1, dir: "W", score: -1 } }, shots: [["you", "a", "hit"]] },
  ], 1),
  smoke: scene("standard", 5, 3, [
    { tanks: { you: { x: 3, y: 1, dir: "W" }, a: { x: 0, y: 1, dir: "E" } } },
    { tanks: { you: { x: 3, y: 1, dir: "W" }, a: { x: 0, y: 1, dir: "E", water: 6 } }, shots: [["a", "you", "miss"]] },
    { tanks: { you: { x: 3, y: 1, dir: "W" }, a: { x: 0, y: 1, dir: "E", water: 3 } }, shots: [["a", "you", "miss"]] },
  ], 1),
  splash: scene("standard", 5, 3, [
    { tanks: { you: { x: 2, y: 1, dir: "N" }, a: { x: 1, y: 0, dir: "SE" }, b: { x: 3, y: 1, dir: "W" }, c: { x: 1, y: 2, dir: "NE" } } },
    {
      tanks: { you: { x: 2, y: 1, dir: "N", score: 3, water: 0 }, a: { x: 1, y: 0, dir: "SE", score: -1 }, b: { x: 3, y: 1, dir: "W", score: -1 }, c: { x: 1, y: 2, dir: "NE", score: -1 } },
      shots: [["you", "a", "hit"], ["you", "b", "hit"], ["you", "c", "hit"]],
    },
    { tanks: { you: { x: 2, y: 1, dir: "N", score: 3, water: 1 }, a: { x: 1, y: 0, dir: "SE", score: -1 }, b: { x: 3, y: 1, dir: "W", score: -1 }, c: { x: 1, y: 2, dir: "NE", score: -1 } } },
  ], 1),
  fullTank: scene("standard", 5, 3, [
    { tanks: { you: { x: 0, y: 1, dir: "E", water: 1 }, a: { x: 2, y: 1, dir: "W" } } },
    { tanks: { you: { x: 0, y: 1, dir: "E", water: 9 }, a: { x: 2, y: 1, dir: "W" } } },
    { tanks: { you: { x: 0, y: 1, dir: "E", score: 1, water: 9 }, a: { x: 2, y: 1, dir: "W", score: -1 } }, shots: [["you", "a", "hit"]] },
    { tanks: { you: { x: 0, y: 1, dir: "E", score: 2, water: 9 }, a: { x: 2, y: 1, dir: "W", score: -2 } }, shots: [["you", "a", "hit"]] },
    { tanks: { you: { x: 0, y: 1, dir: "E", score: 3, water: 9 }, a: { x: 2, y: 1, dir: "W", score: -3 } }, shots: [["you", "a", "hit"]] },
  ], 3),
  mudBomb: scene("standard", 5, 3, [
    { tanks: { you: { x: 0, y: 1, dir: "E" }, a: { x: 3, y: 1, dir: "W" } } },
    { tanks: { you: { x: 0, y: 1, dir: "E", score: 1, water: 6 }, a: { x: 3, y: 1, dir: "W", score: -1, effect: STUCK } }, shots: [["you", "a", "hit"]] },
    { tanks: { you: { x: 1, y: 1, dir: "E", score: 1, water: 7 }, a: { x: 3, y: 1, dir: "W", score: -1, effect: STUCK } } },
  ], 1),
  whirlwind: scene("standard", 5, 3, [
    { tanks: { you: { x: 2, y: 1, dir: "N" }, a: { x: 0, y: 0, dir: "E" }, b: { x: 4, y: 1, dir: "W" }, c: { x: 2, y: 2, dir: "N" } } },
    { tanks: { you: { x: 2, y: 1, dir: "N" }, a: { x: 0, y: 0, dir: "S", effect: DIZZY }, b: { x: 4, y: 1, dir: "N", effect: DIZZY }, c: { x: 2, y: 2, dir: "W", effect: DIZZY } } },
    { tanks: { you: { x: 2, y: 1, dir: "N" }, a: { x: 0, y: 0, dir: "E", effect: DIZZY }, b: { x: 4, y: 1, dir: "S", effect: DIZZY }, c: { x: 2, y: 2, dir: "E", effect: DIZZY } } },
  ], 1),
  bigUmbrella: scene("standard", 5, 3, [
    { tanks: { you: { x: 2, y: 1, dir: "N", item: "umbrella" }, a: { x: 0, y: 1, dir: "E" }, b: { x: 4, y: 1, dir: "W" } } },
    { tanks: { you: { x: 2, y: 1, dir: "N", item: "umbrella" }, a: { x: 0, y: 1, dir: "E", water: 6 }, b: { x: 4, y: 1, dir: "W", water: 6 } }, shots: [["a", "you", "blocked"], ["b", "you", "blocked"]] },
    { tanks: { you: { x: 2, y: 1, dir: "N", item: "umbrella" }, a: { x: 0, y: 1, dir: "E", water: 7 }, b: { x: 4, y: 1, dir: "W", water: 7 } } },
  ], 1),
  magnet: scene("standard", 5, 3, [
    { tanks: { you: { x: 2, y: 1, dir: "N" } }, items: [{ kind: "bucket", x: 0, y: 0 }, { kind: "pinwheel", x: 4, y: 2 }, { kind: "umbrella", x: 4, y: 0 }] },
    { tanks: { you: { x: 2, y: 1, dir: "N" } }, items: [{ kind: "bucket", x: 1, y: 0 }, { kind: "pinwheel", x: 3, y: 2 }, { kind: "umbrella", x: 3, y: 0 }] },
    { tanks: { you: { x: 2, y: 1, dir: "N", item: "bucket" } } },
  ], 1),
};

/** The ids every scene uses, for its names and looks. */
export function sceneNames(): Readonly<Record<BotId, string>> {
  return { you: "A", a: "B", b: "C", c: "D" };
}
