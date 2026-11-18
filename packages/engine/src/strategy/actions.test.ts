import { describe, expect, test } from "bun:test";
import { DIRECTIONS, MOVES } from "../types.ts";
import type { BotState, Direction, Move, ParamSpec, ParamValues, Snapshot, Strategy } from "../types.ts";
import { createRng } from "../round/rng.ts";
import { resolveTick } from "../round/resolve.ts";
import { ACTIONS } from "./vocabulary.ts";
import { TARGET_SELECTORS } from "./vocabulary.ts";
import { DIRECTION_STEP } from "../directions.ts";
import { botsThatCanHit, isFree } from "./geometry.ts";
import { decide } from "./decide.ts";
import { act, bot, contextFor, mode, rule, snapshotOf, strategyOf, stubRng, when, withPlacement } from "./test-helpers.ts";

/** The move of an action that is expected to act. */
function run(actionId: string, bots: readonly BotState[], params: ParamValues = {}, rngInt = 0): Move {
  const move = runOrNull(actionId, bots, params, rngInt);
  if (move === null) throw new Error(`${actionId} could not act`);
  return move;
}

function runOrNull(actionId: string, bots: readonly BotState[], params: ParamValues = {}, rngInt = 0): Move | null {
  const action = ACTIONS[actionId];
  if (action === undefined) throw new Error(`no action ${actionId}`);
  const move = action.toMove(contextFor(snapshotOf(bots), "me"), params, stubRng({ int: [rngInt] }));
  return typeof move === "string" ? move : move?.move ?? null;
}

const NEAREST = { target: "nearest" };
const FARTHEST = { target: "farthest" };

function defaultsOf(specs: readonly ParamSpec[], target: string): ParamValues {
  return Object.fromEntries(specs.map((spec) => [spec.key, spec.kind === "target" ? target : spec.default]));
}

describe("every action returns a legal move that never walks into a wall or off the grid", () => {
  const directions: readonly Direction[] = DIRECTIONS;
  // 5 x 4 arena: every cell, every facing, with and without other bots.
  const arena = { width: 5, height: 4 } as const;
  const crowds: Record<string, readonly BotState[]> = {
    "no enemies": [],
    "one enemy": [bot("e1", 2, 1, "S")],
    "enemy aiming at the centre": [bot("e1", 4, 1, "W"), bot("e2", 0, 2, "E")],
    "enemies on both sides": [bot("e1", 1, 1, "N", { score: 5 }), bot("e2", 3, 2, "W"), bot("e3", 2, 3, "N", { lastHitBy: null })],
  };

  for (const actionId of Object.keys(ACTIONS)) {
    test(actionId, () => {
      const action = ACTIONS[actionId];
      if (action === undefined) throw new Error("unreachable");
      const needsTarget = action.params.some((spec) => spec.kind === "target");
      const targetIds = needsTarget ? Object.keys(TARGET_SELECTORS) : [""];
      for (const [crowdName, others] of Object.entries(crowds)) {
        for (let x = 0; x < arena.width; x++) {
          for (let y = 0; y < arena.height; y++) {
            for (const direction of directions) {
              if (others.some((other) => other.x === x && other.y === y)) continue;
              const me = bot("me", x, y, direction, { lastHitBy: others[0]?.id ?? null });
              // A bucket in the far corner, except under the tank itself: a tank on an item has taken it.
              const items = x === 4 && y === 3 ? [] : [{ kind: "bucket" as const, x: 4, y: 3, turnsLeft: 5 }];
              const snapshot = snapshotOf([me, ...others], { ...arena, items });
              for (const target of targetIds) {
                for (const rngInt of [0, 1, 2, 3, 4, 5, 6, 7]) {
                  const params = defaultsOf(action.params, target);
                  const ctx = { self: me, snapshot };
                  const move = action.toMove(ctx, params, stubRng({ int: [rngInt] }));
                  const where = `${actionId} ${target} ${crowdName} at ${x},${y} facing ${direction} (draw ${rngInt})`;
                  if (move === null) {
                    // null is allowed only when there is nothing to act on.
                    const nothingToAct = needsTarget
                      ? TARGET_SELECTORS[target]?.pick(ctx) === null
                      : (actionId === "stepOutOfLine" && botsThatCanHit(snapshot, me).length === 0) ||
                        (actionId === "goToItem" && snapshot.items.length === 0) ||
                        (actionId === "useUltimate" && me.ultimate === undefined);
                    expect(nothingToAct, where).toBe(true);
                    continue;
                  }
                  expect(MOVES, where).toContain(typeof move === "string" ? move : move.move);
                  if (move === "F" && actionId !== "stepForward") {
                    const vector = DIRECTION_STEP[direction];
                    expect(isFree(snapshot, { x: x + vector.x, y: y + vector.y }), where).toBe(true);
                  }
                }
              }
            }
          }
        }
      }
    });
  }
});

describe("fixed actions", () => {
  test("throw, and the four turns: left and right are 90 degrees, slight left and slight right are 45", () => {
    const me = bot("me", 4, 3, "N");
    expect(run("throw", [me])).toBe("T");
    expect(run("turn", [me], { way: "left" })).toBe("L");
    expect(run("turn", [me], { way: "right" })).toBe("R");
    expect(run("turn", [me], { way: "slightLeft" })).toBe("L45");
    expect(run("turn", [me], { way: "slightRight" })).toBe("R45");
  });

  test("throw and the turns do not depend on walls or blockers", () => {
    expect(run("throw", [bot("me", 0, 0, "N")])).toBe("T");
    expect(run("turn", [bot("me", 0, 0, "N"), bot("b", 0, 1, "N")], { way: "left" })).toBe("L");
  });

  test("step forward is a raw F, also into a wall or a bot", () => {
    expect(run("stepForward", [bot("me", 8, 3, "E")])).toBe("F");
    expect(run("stepForward", [bot("me", 4, 3, "E"), bot("b", 5, 3, "N")])).toBe("F");
  });
});

describe("walk forward", () => {
  test("steps ahead when the cell is free", () => {
    expect(run("goForward", [bot("me", 4, 3, "E")])).toBe("F");
  });

  test("at a wall turns toward the free side", () => {
    // Facing north in the top-left corner: left is the wall, right is open.
    expect(run("goForward", [bot("me", 0, 0, "N")])).toBe("R");
    // Facing north in the top-right corner: right is the wall, left is open.
    expect(run("goForward", [bot("me", 8, 0, "N")])).toBe("L");
  });

  test("when a bot holds the cell ahead, throws at it", () => {
    expect(run("goForward", [bot("me", 4, 3, "E"), bot("b", 5, 3, "N")])).toBe("T");
  });

  test("at a wall with a bot on the left, turns right", () => {
    expect(run("goForward", [bot("me", 4, 0, "N"), bot("left", 3, 0, "N")])).toBe("R");
  });

  test("facing a diagonal at a wall, turns 45 degrees toward the free cell, so it drives along the wall", () => {
    // Facing NE on the top edge: N is a wall, E is free.
    expect(run("goForward", [bot("me", 4, 0, "NE")])).toBe("R45");
    // Facing SW on the left edge: W is a wall, S (45 degrees left) is free.
    expect(run("goForward", [bot("me", 0, 3, "SW")])).toBe("L45");
    // Facing NE into the top-right corner: N, E, NW and SE are all outside, so the half-turn rule turns left.
    expect(run("goForward", [bot("me", 8, 0, "NE")])).toBe("L");
  });
});

describe("move toward and away", () => {
  test("toward: steps ahead when the target is ahead, turns when it is to the side or behind", () => {
    const foe = bot("foe", 7, 3, "W");
    expect(run("moveToward", [bot("me", 4, 3, "E"), foe], NEAREST)).toBe("F");
    expect(run("moveToward", [bot("me", 4, 3, "N"), foe], NEAREST)).toBe("R");
    expect(run("moveToward", [bot("me", 4, 3, "S"), foe], NEAREST)).toBe("L");
    // Behind: a half turn, and both sides are free, so the tie turns left.
    expect(run("moveToward", [bot("me", 4, 3, "W"), foe], NEAREST)).toBe("L");
  });

  test("toward: a step into a held cell is a throw", () => {
    expect(run("moveToward", [bot("me", 4, 3, "E"), bot("foe", 5, 3, "W")], NEAREST)).toBe("T");
    // The blocker is not the target. The step toward the target (SE: both gaps are open) is still blocked, so the bot throws at the blocker.
    const bots = [bot("me", 4, 3, "SE"), bot("foe", 7, 5, "W"), bot("blocker", 5, 4, "N")];
    expect(run("moveToward", bots, FARTHEST)).toBe("T");
    expect(run("moveToward", [bot("me", 4, 3, "SE"), bot("foe", 5, 4, "W")], NEAREST)).toBe("T");
  });

  test("toward: turns first when the held cell is not ahead, then throws", () => {
    expect(run("moveToward", [bot("me", 4, 3, "N"), bot("foe", 5, 3, "W")], NEAREST)).toBe("R");
  });

  test("away: steps ahead when ahead is away, turns when it is not", () => {
    // The foe is 2 cells west in my row, so the step is straight east.
    const foe = bot("foe", 2, 3, "E");
    expect(run("moveAway", [bot("me", 4, 3, "E"), foe], NEAREST)).toBe("F");
    expect(run("moveAway", [bot("me", 4, 3, "N"), foe], NEAREST)).toBe("R");
    expect(run("moveAway", [bot("me", 4, 3, "NE"), foe], NEAREST)).toBe("R45");
    // A foe off my row and column: the step is diagonal.
    expect(run("moveAway", [bot("me", 4, 3, "SE"), bot("foe", 2, 1, "E")], NEAREST)).toBe("F");
  });

  test("away: in a corner, takes the one free step that adds distance", () => {
    const foe = bot("foe", 1, 0, "W");
    expect(run("moveAway", [bot("me", 0, 0, "S"), foe], NEAREST)).toBe("F");
    expect(MOVES).toContain(run("moveAway", [bot("me", 0, 0, "N"), foe], NEAREST));
  });

  test("away: a cornered bot throws", () => {
    const bots = [bot("me", 0, 0, "S"), bot("a", 1, 0, "W"), bot("b", 0, 1, "N")];
    expect(run("moveAway", bots, NEAREST)).toBe("T");
  });

  test("with no enemies, an action that needs a target cannot act", () => {
    for (const id of ["moveToward", "moveAway", "faceTarget", "attack"]) {
      expect(runOrNull(id, [bot("me", 4, 3, "E")], NEAREST), id).toBeNull();
    }
  });

  test("a selector that finds nobody means no move, not a substitute move", () => {
    const bots = [bot("me", 4, 3, "E"), bot("foe", 7, 3, "W")];
    for (const id of ["moveToward", "moveAway", "faceTarget", "attack"]) {
      expect(runOrNull(id, bots, { target: "lastHitMe" }), id).toBeNull();
    }
  });
});

describe("turn to face", () => {
  test("turns toward the target along the longer gap", () => {
    const foe = bot("foe", 8, 4, "W");
    expect(run("faceTarget", [bot("me", 4, 3, "N"), foe], NEAREST)).toBe("R");
  });

  test("throws when already facing the target", () => {
    expect(run("faceTarget", [bot("me", 4, 3, "E"), bot("foe", 8, 3, "W")], NEAREST)).toBe("T");
  });
});

describe("attack", () => {
  test("throws when the target is the first bot in the line within range", () => {
    expect(run("attack", [bot("me", 4, 3, "E"), bot("foe", 7, 3, "W")], NEAREST)).toBe("T");
  });

  test("turns toward a target in the same row within range, and throws once facing it", () => {
    expect(run("attack", [bot("me", 4, 3, "N"), bot("foe", 7, 3, "W")], NEAREST)).toBe("R");
  });

  test("throws at a bot that stands between the bot and its target", () => {
    const bots = [bot("me", 4, 3, "E"), bot("between", 5, 3, "N"), bot("foe", 7, 3, "W")];
    expect(run("attack", bots, FARTHEST)).toBe("T");
  });

  test("moves toward a target that is out of range or off the line", () => {
    expect(run("attack", [bot("me", 1, 3, "E"), bot("foe", 8, 3, "W")], NEAREST)).toBe("F");
    // 3 east and 2 south is off every line, so the bot steps SE.
    expect(run("attack", [bot("me", 1, 3, "SE"), bot("foe", 4, 5, "W")], NEAREST)).toBe("F");
    expect(run("attack", [bot("me", 1, 3, "E"), bot("foe", 4, 5, "W")], NEAREST)).toBe("R45");
    expect(run("attack", [bot("me", 1, 3, "N"), bot("foe", 4, 5, "W")], NEAREST)).toBe("R");
  });

  test("turns toward a target on its diagonal within range, and throws once facing it", () => {
    expect(run("attack", [bot("me", 1, 3, "E"), bot("foe", 4, 6, "W")], NEAREST)).toBe("R45");
    expect(run("attack", [bot("me", 1, 3, "SE"), bot("foe", 4, 6, "W")], NEAREST)).toBe("T");
    // 4 diagonal steps is beyond the range of 3, so the bot drives closer along the diagonal.
    expect(run("attack", [bot("me", 0, 2, "SE"), bot("foe", 4, 6, "W")], NEAREST)).toBe("F");
  });

  test("a longer reach attacks from farther away", () => {
    const longArm = { reach: 2, aim: 0, dodge: 0 };
    expect(run("attack", [bot("me", 1, 3, "E", { build: longArm }), bot("foe", 6, 3, "W")], NEAREST)).toBe("T");
  });
});

describe("a bot never turns back and forth or pushes against a blocker", () => {
  /** Plays `ticks` ticks with fixed resolution order and returns the moves of "me". */
  function movesOver(bots: readonly BotState[], strategies: Record<string, Strategy>, ticks: number): Move[] {
    let snapshot: Snapshot = snapshotOf(bots);
    const rng = createRng(7);
    const played: Move[] = [];
    for (let tick = 0; tick < ticks; tick++) {
      const decisions = snapshot.bots.map((b) => {
        const strategy = strategies[b.id];
        if (strategy === undefined) throw new Error(`no strategy for ${b.id}`);
        return decide({ self: b, snapshot }, strategy, rng);
      });
      played.push(decisions.find((d) => d.botId === "me")!.move);
      const resolved = resolveTick(snapshot, decisions.map((d) => ({ botId: d.botId, move: d.move })), snapshot.bots.map((b) => b.id), rng);
      snapshot = {
        ...snapshot,
        tick: tick + 1,
        bots: snapshot.bots.map((b, i) => withPlacement(b, resolved.placements[i]!)),
      };
    }
    return played;
  }

  // The blocker stands still: its fallback is a throw.
  const stands = strategyOf([mode("main", [], act("throw"))]);

  for (const [name, actionId] of [["move toward", "moveToward"], ["attack", "attack"]] as const) {
    test(`${name}: one turn at most, then throws at the blocker every tick`, () => {
      const chaser = strategyOf([mode("main", [], act(actionId, NEAREST))]);
      // The blocker is 1 cell east of the chaser, which first faces north.
      const moves = movesOver([bot("me", 2, 3, "N"), bot("blocker", 3, 3, "N")], { me: chaser, blocker: stands }, 12);
      expect(moves).toEqual(["R", ...Array<Move>(11).fill("T")]);
    });
  }

  test("a blocker in the way to a farther target is thrown at, with no sidestep and no turning back", () => {
    const chaser = strategyOf([mode("main", [], act("moveToward", FARTHEST))]);
    // The far bot is on my diagonal, and the blocker holds the first diagonal cell.
    const bots = [bot("me", 1, 1, "SE"), bot("blocker", 2, 2, "N"), bot("far", 6, 6, "N")];
    const moves = movesOver(bots, { me: chaser, blocker: stands, far: stands }, 12);
    expect(moves).toEqual(Array<Move>(12).fill("T"));
  });

  test("walk forward into a held cell throws every tick", () => {
    const walker = strategyOf([mode("main", [rule("never", [when("hitWithin", { n: 1 })], act("throw"))], act("goForward"))]);
    const moves = movesOver([bot("me", 2, 3, "E"), bot("blocker", 3, 3, "N")], { me: walker, blocker: stands }, 8);
    expect(moves).toEqual(Array<Move>(8).fill("T"));
  });
});

describe("step out of the line of fire", () => {
  const shooter = bot("shooter", 6, 3, "W");

  test("leaves the line by the smallest turn to a safe cell, left first: a turn first when the safe cell is not ahead", () => {
    // Ahead (E) is in the shooter's row. NE, 45 degrees left, is safe.
    expect(run("stepOutOfLine", [bot("me", 4, 3, "E"), shooter])).toBe("L45");
    expect(run("stepOutOfLine", [bot("me", 4, 3, "NE"), shooter])).toBe("F");
  });

  test("steps straight out when ahead is a safe cell", () => {
    expect(run("stepOutOfLine", [bot("me", 4, 3, "N"), shooter])).toBe("F");
  });

  test("does not step into another line of fire", () => {
    // "second" aims along the diagonal through NE of me, so the bot picks SE: 45 degrees right from east.
    const second = bot("second", 6, 1, "SW");
    expect(run("stepOutOfLine", [bot("me", 4, 3, "E"), shooter, second])).toBe("R45");
  });

  test("when nobody aims at the bot, cannot act", () => {
    expect(runOrNull("stepOutOfLine", [bot("me", 4, 3, "E"), bot("other", 6, 5, "W")])).toBeNull();
  });

  test("when no neighbour cell is safe, throws", () => {
    // Shooters on all four sides of a bot in a corner: the two free cells are both in a line of fire.
    const bots = [bot("me", 0, 0, "E"), bot("s1", 2, 0, "W"), bot("s2", 0, 2, "N"), bot("s3", 1, 3, "N"), bot("s4", 3, 1, "W")];
    expect(run("stepOutOfLine", bots)).toBe("T");
  });
});

describe("move away from the crowd", () => {
  test("steps to the neighbour cell with fewer bots near it", () => {
    // Three bots to the west, all within 4 cells. From E, NE or SE only two are.
    const bots = [bot("me", 4, 3, "E"), bot("a", 0, 3, "N"), bot("b", 1, 2, "N"), bot("c", 2, 5, "N")];
    expect(run("awayFromCrowd", bots)).toBe("F");
    // Facing N: ahead keeps all three, and 45 degrees right (NE) comes before 45 degrees left in the tie order.
    expect(run("awayFromCrowd", [bot("me", 4, 3, "N"), ...bots.slice(1)])).toBe("R45");
  });

  test("throws when no neighbour cell is strictly less crowded", () => {
    expect(run("awayFromCrowd", [bot("me", 4, 3, "E")])).toBe("T");
  });
});

describe("go to a place", () => {
  test("middle: heads for the middle cell of an odd-sized arena", () => {
    // The middle of a 9 x 7 arena is (4,3).
    expect(run("goToPlace", [bot("me", 1, 3, "E")], { place: "middle" })).toBe("F");
    expect(run("goToPlace", [bot("me", 1, 3, "N")], { place: "middle" })).toBe("R");
  });

  test("middle: on the middle cell faces the most open direction and throws, instead of turning in place", () => {
    // Of a 9 x 7 arena, east and west have the most room (4 cells), and east comes first in the tie order.
    expect(run("goToPlace", [bot("me", 4, 3, "E")], { place: "middle" })).toBe("T");
    expect(run("goToPlace", [bot("me", 4, 3, "N")], { place: "middle" })).toBe("R");
  });

  test("corner: walks to the nearest corner, diagonally while both gaps are open", () => {
    expect(run("goToPlace", [bot("me", 2, 1, "NW")], { place: "corner" })).toBe("F");
    expect(run("goToPlace", [bot("me", 2, 1, "N")], { place: "corner" })).toBe("L45");
    expect(run("goToPlace", [bot("me", 7, 5, "SE")], { place: "corner" })).toBe("F");
    expect(run("goToPlace", [bot("me", 1, 0, "W")], { place: "corner" })).toBe("F");
  });

  test("corner: in the corner turns toward the longest open line, and throws once facing it", () => {
    // In the top-left corner the room east is 8 and south is 6, both capped at 6, and north and west are walls. Ahead, then right, settles the tie.
    const facingWall = run("goToPlace", [bot("me", 0, 0, "N")], { place: "corner" });
    expect(facingWall).toBe("R");
    expect(run("goToPlace", [bot("me", 0, 0, "E")], { place: "corner" })).toBe("T");
  });

  test("a held cell on the way is thrown at", () => {
    expect(run("goToPlace", [bot("me", 1, 3, "E"), bot("b", 2, 3, "N")], { place: "middle" })).toBe("T");
  });
});

describe("wander", () => {
  test("draws exactly one number: 0 to 3 walk forward, 4 and 5 turn 90 degrees, 6 and 7 turn 45 degrees", () => {
    const me = bot("me", 4, 3, "E");
    const expectations = [[0, "F"], [1, "F"], [2, "F"], [3, "F"], [4, "L"], [5, "R"], [6, "L45"], [7, "R45"]] as const;
    for (const [draw, expected] of expectations) {
      const rng = stubRng({ int: [draw] });
      expect(ACTIONS.wander?.toMove(contextFor(snapshotOf([me]), "me"), {}, rng)).toBe(expected);
      expect(rng.calls).toEqual(["int:8"]);
    }
  });

  test("a forward draw at a wall becomes a turn", () => {
    expect(run("wander", [bot("me", 0, 0, "N")], {}, 0)).toBe("R");
  });
});
