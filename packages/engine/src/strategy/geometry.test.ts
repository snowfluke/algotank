import { describe, expect, test } from "bun:test";
import { DIRECTIONS } from "../types.ts";
import { DIRECTION_STEP, rotate } from "../directions.ts";
import {
  bearingOf,
  botsThatCanHit,
  directionToFace,
  firstBotInLine,
  inStraightLine,
  isFacingAway,
  isFree,
  lineDistance,
  roomAhead,
  stepAway,
  stepToward,
  straightLineDirection,
  wallDistance,
} from "./geometry.ts";
import { bot, snapshotOf } from "./test-helpers.ts";

describe("distance and walls", () => {
  test("room and wall distance count from the bot to the grid edge", () => {
    const snapshot = snapshotOf([bot("a", 0, 3, "N")]);
    expect(roomAhead(snapshot, { x: 0, y: 3 }, "W")).toBe(0);
    expect(wallDistance(snapshot, { x: 0, y: 3 }, "W")).toBe(1);
    expect(roomAhead(snapshot, { x: 0, y: 3 }, "E")).toBe(8);
    expect(roomAhead(snapshot, { x: 0, y: 3 }, "S")).toBe(3);
  });

  test("along a diagonal the room is the smaller room of the two axes", () => {
    // 9 x 7 arena. From (2, 1): 1 row up, 5 rows down, 2 columns left, 6 columns right.
    const snapshot = snapshotOf([bot("a", 2, 1, "N")]);
    const from = { x: 2, y: 1 };
    expect(roomAhead(snapshot, from, "NE")).toBe(1);
    expect(roomAhead(snapshot, from, "SE")).toBe(5);
    expect(roomAhead(snapshot, from, "SW")).toBe(2);
    expect(roomAhead(snapshot, from, "NW")).toBe(1);
    expect(wallDistance(snapshot, from, "NW")).toBe(2);
  });

  test("a cell outside the grid or under a bot is not free", () => {
    const snapshot = snapshotOf([bot("a", 1, 1, "N")]);
    expect(isFree(snapshot, { x: -1, y: 1 })).toBe(false);
    expect(isFree(snapshot, { x: 1, y: 1 })).toBe(false);
    expect(isFree(snapshot, { x: 2, y: 1 })).toBe(true);
  });
});

describe("who faces whom", () => {
  test("line distance is the cells ahead on the faced line, else 0", () => {
    const a = bot("a", 2, 2, "E");
    expect(lineDistance(a, { x: 5, y: 2 })).toBe(3);
    expect(lineDistance(a, { x: 0, y: 2 })).toBe(0);
    expect(lineDistance(a, { x: 5, y: 3 })).toBe(0);
  });

  test.each(DIRECTIONS)("facing %s, the line runs along the facing and a diagonal step counts as 1 cell", (direction) => {
    const a = bot("a", 4, 3, direction);
    const step = DIRECTION_STEP[direction];
    const side = DIRECTION_STEP[rotate(direction, 1)];
    expect(lineDistance(a, { x: 4 + 2 * step.x, y: 3 + 2 * step.y })).toBe(2);
    expect(lineDistance(a, { x: 4 - 2 * step.x, y: 3 - 2 * step.y })).toBe(0);
    expect(lineDistance(a, { x: 4 + 2 * step.x + side.x, y: 3 + 2 * step.y + side.y })).toBe(0);
    expect(lineDistance(a, { x: 4, y: 3 })).toBe(0);
  });

  test("a straight line is a row, a column or a diagonal", () => {
    const me = { x: 4, y: 3 };
    expect(inStraightLine(me, { x: 8, y: 3 })).toBe(true);
    expect(inStraightLine(me, { x: 4, y: 0 })).toBe(true);
    expect(inStraightLine(me, { x: 6, y: 5 })).toBe(true);
    expect(inStraightLine(me, { x: 1, y: 6 })).toBe(true);
    expect(inStraightLine(me, { x: 6, y: 4 })).toBe(false);
    expect(inStraightLine(me, me)).toBe(false);
    expect(straightLineDirection(me, { x: 1, y: 6 })).toBe("SW");
    expect(straightLineDirection(me, { x: 6, y: 4 })).toBeNull();
  });

  test("the first bot in line is the nearer one, and range limits it", () => {
    const a = bot("a", 0, 0, "E");
    const snapshot = snapshotOf([a, bot("far", 4, 0, "W"), bot("near", 2, 0, "W")]);
    expect(firstBotInLine(snapshot, a, 5)?.bot.id).toBe("near");
    expect(firstBotInLine(snapshot, a, 1)).toBeNull();
  });

  test("on a diagonal the first bot in line is the nearer one, at its diagonal distance", () => {
    const a = bot("a", 0, 0, "SE");
    const snapshot = snapshotOf([a, bot("far", 3, 3, "W"), bot("near", 2, 2, "W"), bot("off", 2, 1, "W")]);
    expect(firstBotInLine(snapshot, a, 3)).toMatchObject({ bot: { id: "near" }, distance: 2 });
    expect(firstBotInLine(snapshot, a, 1)).toBeNull();
  });

  test("an enemy can hit me only when I am the first bot in its line within its range", () => {
    const me = bot("me", 4, 3, "E");
    const shooter = bot("shooter", 6, 3, "W");
    expect(botsThatCanHit(snapshotOf([me, shooter]), me).map((b) => b.id)).toEqual(["shooter"]);
    const shield = bot("shield", 5, 3, "N");
    expect(botsThatCanHit(snapshotOf([me, shooter, shield]), me)).toEqual([]);
    const tooFar = bot("far", 8, 3, "W");
    expect(botsThatCanHit(snapshotOf([me, tooFar]), me)).toEqual([]);
  });

  test("an enemy on my diagonal that faces me is aimed at me, and a bot between shields me", () => {
    const me = bot("me", 4, 3, "E");
    const shooter = bot("shooter", 6, 1, "SW");
    expect(botsThatCanHit(snapshotOf([me, shooter]), me).map((b) => b.id)).toEqual(["shooter"]);
    expect(botsThatCanHit(snapshotOf([me, shooter, bot("shield", 5, 2, "N")]), me)).toEqual([]);
    expect(botsThatCanHit(snapshotOf([me, bot("shooter", 6, 1, "S")]), me)).toEqual([]);
  });

  test("a bot faces away when its back is toward me", () => {
    const me = { x: 0, y: 0 };
    expect(isFacingAway(bot("t", 3, 0, "E"), me)).toBe(true);
    expect(isFacingAway(bot("t", 3, 0, "W"), me)).toBe(false);
    expect(isFacingAway(bot("t", 3, 0, "N"), me)).toBe(false);
    expect(isFacingAway(bot("t", 3, 0, "NE"), me)).toBe(true);
    expect(isFacingAway(bot("t", 3, 0, "SW"), me)).toBe(false);
  });
});

describe("greedy steps", () => {
  const me = bot("me", 4, 3, "N");

  test.each([
    [6, 1, "NE"],
    [6, 5, "SE"],
    [2, 5, "SW"],
    [2, 1, "NW"],
    [4, 0, "N"],
    [8, 3, "E"],
    [4, 6, "S"],
    [0, 3, "W"],
  ] as const)("toward (%i, %i) steps %s", (x, y, expected) => {
    expect(stepToward(me, { x, y })).toBe(expected);
  });

  test("toward a cell steps diagonally while both the column and the row differ, and straight after", () => {
    // 5 east and 2 south: E, SE and NE all leave a Chebyshev distance of 4; SE also closes the row gap.
    expect(stepToward(me, { x: 9, y: 5 })).toBe("SE");
    expect(stepToward({ x: 7, y: 5 }, { x: 9, y: 5 })).toBe("E");
  });

  test("toward a cell does not prefer the direction the bot faces", () => {
    expect(stepToward(bot("me", 4, 3, "E"), { x: 8, y: 4 })).toBe("SE");
  });

  test("toward a cell ignores bots: the caller throws at a bot that holds the cell", () => {
    expect(stepToward(me, { x: 8, y: 3 })).toBe("E");
    expect(stepToward(me, { x: 5, y: 3 })).toBe("E");
  });

  test("toward the bot's own cell is a bug and throws", () => {
    expect(() => stepToward(me, { x: 4, y: 3 })).toThrow();
  });

  test("away from a cell steps straight away when the row or column is shared, diagonally while both differ", () => {
    // From (1, 3) away from (0, 3): E, NE and SE all reach Chebyshev 2; E is the straight-away step.
    const west = bot("me", 1, 3, "N");
    expect(stepAway(snapshotOf([west]), west, { x: 0, y: 3 })).toBe("E");
    // From (4, 3) away from (1, 1): both gaps are open, so the step is SE, whatever the facing.
    const facingWest = bot("me", 4, 3, "W");
    expect(stepAway(snapshotOf([facingWest]), facingWest, { x: 1, y: 1 })).toBe("SE");
    const corner = bot("me", 0, 0, "E");
    const next = bot("b", 1, 0, "W");
    expect(stepAway(snapshotOf([corner, next]), corner, { x: 1, y: 0 })).toBe("S");
  });

  test("when the straight-away cell is held, the steps nearest to it in angle tie, and the turn cost decides, then the room, then clockwise order", () => {
    // Threat 3 north, S is held. SE and SW reach Chebyshev 4 and are both 45 degrees off S.
    const blocker = bot("b", 4, 4, "N");
    const facingSouthWest = bot("me", 4, 3, "SW");
    expect(stepAway(snapshotOf([facingSouthWest, blocker]), facingSouthWest, { x: 4, y: 0 })).toBe("SW");
    const facingNorth = bot("me", 4, 3, "N");
    expect(stepAway(snapshotOf([facingNorth, blocker]), facingNorth, { x: 4, y: 0 })).toBe("SE");
  });

  test("away from a cell at a wall slides along the wall: the Chebyshev distance stays and the other gap opens", () => {
    // At (0, 3) with the threat at (3, 3): no step raises the Chebyshev distance of 3, N and S raise |dx| + |dy| to 4.
    const facingNorth = bot("me", 0, 3, "N");
    expect(stepAway(snapshotOf([facingNorth]), facingNorth, { x: 3, y: 3 })).toBe("N");
    const facingSouth = bot("me", 0, 3, "S");
    expect(stepAway(snapshotOf([facingSouth]), facingSouth, { x: 3, y: 3 })).toBe("S");
    // Facing E, N and S are one turn each and have the same room, so clockwise order gives N.
    const facingEast = bot("me", 0, 3, "E");
    expect(stepAway(snapshotOf([facingEast]), facingEast, { x: 3, y: 3 })).toBe("N");
  });

  test("away from a cell gives null when no free neighbour is farther", () => {
    const corner = bot("me", 0, 0, "E");
    const east = bot("e", 1, 0, "W");
    const south = bot("s", 0, 1, "N");
    expect(stepAway(snapshotOf([corner, east, south]), corner, { x: 1, y: 0 })).toBeNull();
  });

  test("the direction to face is the facing with the smallest angle to the cell", () => {
    expect(directionToFace(me, { x: 8, y: 3 })).toBe("E");
    // 1 east and 5 south: 11 degrees off S.
    expect(directionToFace(me, { x: 5, y: 8 })).toBe("S");
    expect(directionToFace(me, { x: 6, y: 1 })).toBe("NE");
    // 4 east and 2 north: 27 degrees off E and 18 off NE.
    expect(directionToFace(me, { x: 8, y: 1 })).toBe("NE");
    // 3 east and 1 north: 18 degrees off E.
    expect(directionToFace(me, { x: 7, y: 2 })).toBe("E");
    expect(directionToFace(me, { x: 2, y: 5 })).toBe("SW");
    expect(() => directionToFace(me, { x: 4, y: 3 })).toThrow();
  });
});

describe("bearing", () => {
  const me = bot("me", 4, 3, "E");

  test("the four regions form an X around the bot", () => {
    expect(bearingOf(me, { x: 8, y: 3 })).toBe("ahead");
    expect(bearingOf(me, { x: 0, y: 3 })).toBe("behind");
    expect(bearingOf(me, { x: 5, y: 6 })).toBe("right");
    expect(bearingOf(me, { x: 5, y: 0 })).toBe("left");
  });

  test("a tie between the axes goes to ahead or behind", () => {
    expect(bearingOf(me, { x: 6, y: 5 })).toBe("ahead");
    expect(bearingOf(me, { x: 2, y: 5 })).toBe("behind");
  });

  test("left and right follow the way the bot faces", () => {
    expect(bearingOf(bot("me", 4, 3, "N"), { x: 5, y: 3 })).toBe("right");
    expect(bearingOf(bot("me", 4, 3, "S"), { x: 5, y: 3 })).toBe("left");
  });

  test("facing NE, the sectors are centred on NE, SE, SW and NW, and the borders N, E, S, W go to ahead or behind", () => {
    const diagonal = bot("me", 4, 3, "NE");
    expect(bearingOf(diagonal, { x: 6, y: 1 })).toBe("ahead");
    expect(bearingOf(diagonal, { x: 6, y: 5 })).toBe("right");
    expect(bearingOf(diagonal, { x: 2, y: 5 })).toBe("behind");
    expect(bearingOf(diagonal, { x: 2, y: 1 })).toBe("left");
    // Borders, exactly 45 degrees from the facing or from behind.
    expect(bearingOf(diagonal, { x: 4, y: 1 })).toBe("ahead");
    expect(bearingOf(diagonal, { x: 6, y: 3 })).toBe("ahead");
    expect(bearingOf(diagonal, { x: 4, y: 5 })).toBe("behind");
    expect(bearingOf(diagonal, { x: 2, y: 3 })).toBe("behind");
    // Just inside a sector: 3 east and 1 north is 27 degrees off NE.
    expect(bearingOf(diagonal, { x: 7, y: 2 })).toBe("ahead");
    // 1 east and 2 south is 18 degrees off SE.
    expect(bearingOf(diagonal, { x: 5, y: 5 })).toBe("right");
  });

  test("the bot's own cell has no bearing", () => {
    expect(() => bearingOf(me, { x: 4, y: 3 })).toThrow();
  });
});
