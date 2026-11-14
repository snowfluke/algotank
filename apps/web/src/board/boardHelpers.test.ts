/// <reference types="bun" />
import { plainTankLook } from "@game/arena";
import { describe, expect, test } from "bun:test";
import { ruleSet } from "@game/engine";
import type { BotState, Direction, ThrowEvent } from "@game/engine";
import {
  CELL,
  boardDetail,
  cellCenter,
  directionDegrees,
  gaugeShape,
  gridLinePath,
  leaderId,
  shotShape,
  tankCenter,
  tankLooks,
  unwrapAngle,
  youMarkerBelow,
} from "./boardHelpers.ts";

function bot(id: string, score: number, over: Partial<BotState> = {}): BotState {
  return {
    id,
    x: 0,
    y: 0,
    direction: "E",
    score,
    wasHit: false,
    lastHitBy: null,
    ticksSinceHit: null,
    lastMove: null,
    modeId: "m",
    build: {},
    ticksInMode: 0,
    water: 9,
    hitsLanded: 0,
    hitsTaken: 0,
    ticksSinceLandedHit: null,
    ...over,
  };
}

const empty: ThrowEvent = { throwerId: "a", outcome: "empty" };
const dry: ThrowEvent = { throwerId: "a", outcome: "dry", targetId: "b", distance: 1 };
const rolled = (outcome: "hit" | "miss", distance: number, hitChance: number): ThrowEvent => ({
  throwerId: "a",
  outcome,
  targetId: "b",
  distance,
  hitChance,
});

describe("cellCenter and gridLinePath", () => {
  test("the centre of cell (2, 1) is half a cell in from its corner", () => {
    expect(cellCenter(2, 1)).toEqual({ x: 2.5 * CELL, y: 1.5 * CELL });
  });

  test("a 3 by 2 grid has 2 vertical and 1 horizontal inner line", () => {
    expect(gridLinePath(3, 2)).toBe("M10 0V20M20 0V20M0 10H30");
  });
});

describe("directionDegrees", () => {
  test("draws each of the 8 facings 45 degrees apart, east at 0 and north at -90", () => {
    const expected: [Direction, number][] = [
      ["N", -90],
      ["NE", -45],
      ["E", 0],
      ["SE", 45],
      ["S", 90],
      ["SW", 135],
      ["W", 180],
      ["NW", 225],
    ];
    for (const [direction, degrees] of expected) expect(directionDegrees(direction)).toBe(degrees);
  });

  test("a 45 degree turn from NW to N turns the short way", () => {
    expect(unwrapAngle(directionDegrees("NW"), directionDegrees("N"))).toBe(270);
  });
});

describe("unwrapAngle", () => {
  test("turns the short way from west to north", () => {
    expect(unwrapAngle(180, -90)).toBe(270);
  });
  test("keeps the angle when the target is the same direction in other terms", () => {
    expect(unwrapAngle(270, -90)).toBe(270);
  });
  test("a half turn goes clockwise", () => {
    expect(unwrapAngle(0, 180)).toBe(180);
  });
});

describe("shotShape", () => {
  const dirs: [Direction, number, number][] = [
    ["N", 0, -1],
    ["NE", 1, -1],
    ["E", 1, 0],
    ["SE", 1, 1],
    ["S", 0, 1],
    ["SW", -1, 1],
    ["W", -1, 0],
    ["NW", -1, -1],
  ];
  const bounds = { width: 12, height: 10 };

  test("a hit jet runs from the nozzle to just before the target, and the splash sits on the target, in each direction", () => {
    for (const [direction, dx, dy] of dirs) {
      const shooter = bot("a", 0, { x: 5, y: 5, direction });
      const shape = shotShape(shooter, rolled("hit", 2, 60), bounds);
      if (shape.kind !== "hit") throw new Error("expected a hit");
      const centre = tankCenter(5, 5);
      expect(shape.splash).toEqual({ x: centre.x + dx * 2 * CELL, y: centre.y + dy * 2 * CELL });
      // The jet starts outside the shooter's hull and ends before the target's centre.
      const start = Math.hypot(shape.jet.from.x - centre.x, shape.jet.from.y - centre.y);
      const end = Math.hypot(shape.jet.to.x - centre.x, shape.jet.to.y - centre.y);
      const toTarget = Math.hypot(dx, dy) * 2 * CELL;
      expect(start).toBeGreaterThan(3);
      expect(end).toBeLessThan(toTarget);
      expect(end).toBeGreaterThan(toTarget - CELL);
    }
  });

  test("the nozzle and the dry drops sit as far from the hull on a diagonal as on a row, along the facing", () => {
    const centre = tankCenter(5, 5);
    const distances = (direction: Direction) => {
      const shape = shotShape(bot("a", 0, { x: 5, y: 5, direction }), dry, bounds);
      if (shape.kind !== "dry") throw new Error("expected a dry shot");
      return shape.drops.map((drop) => Math.hypot(drop.x - centre.x, drop.y - centre.y));
    };
    const straight = distances("E");
    distances("SW").forEach((distance, i) => expect(distance).toBeCloseTo(straight[i] as number, 6));
    const diagonal = shotShape(bot("a", 0, { x: 5, y: 5, direction: "SW" }), dry, bounds);
    if (diagonal.kind !== "dry") throw new Error("expected a dry shot");
    for (const drop of diagonal.drops) expect(drop.x - centre.x).toBeCloseTo(-(drop.y - centre.y), 6);
  });

  test("a diagonal miss lands past the target on the diagonal, inside the arena", () => {
    const miss = shotShape(bot("a", 0, { x: 2, y: 2, direction: "SE" }), rolled("miss", 3, 40), bounds);
    if (miss.kind !== "miss") throw new Error("expected a miss");
    const target = tankCenter(5, 5);
    expect(miss.jet.to.x).toBeGreaterThan(target.x);
    expect(miss.jet.to.y).toBeGreaterThan(target.y);
  });

  test("a miss is a lob that lands past the target, higher than a hit jet", () => {
    const shooter = bot("a", 0, { x: 1, y: 1 });
    const miss = shotShape(shooter, rolled("miss", 2, 60), bounds);
    const hit = shotShape(shooter, rolled("hit", 2, 60), bounds);
    if (miss.kind !== "miss" || hit.kind !== "hit") throw new Error("expected a miss and a hit");
    expect(miss.jet.to.x).toBeGreaterThan(tankCenter(3, 1).x);
    const rise = (jet: typeof miss.jet) => jet.from.y - jet.control.y;
    expect(rise(miss.jet)).toBeGreaterThan(rise(hit.jet));
  });

  test("a jet at the wall lands on the floor", () => {
    const shooter = bot("a", 0, { x: 11, y: 3, direction: "E" });
    const none = shotShape(shooter, empty, bounds);
    if (none.kind !== "empty") throw new Error("expected a shot into nothing");
    expect(none.jet.to.x).toBeLessThanOrEqual(bounds.width * CELL);
    const miss = shotShape(bot("a", 0, { x: 9, y: 3 }), rolled("miss", 2, 60), bounds);
    if (miss.kind !== "miss") throw new Error("expected a miss");
    expect(miss.jet.to.x).toBeLessThanOrEqual(bounds.width * CELL);
  });

  test("a dry shot is three drops in front of the nozzle and no jet", () => {
    const shape = shotShape(bot("a", 0, { x: 1, y: 1 }), dry, bounds);
    if (shape.kind !== "dry") throw new Error("expected a dry shot");
    expect("jet" in shape).toBe(false);
    expect(shape.drops).toHaveLength(3);
    for (const drop of shape.drops) expect(drop.x - tankCenter(1, 1).x).toBeLessThan(CELL);
  });
});

describe("leaderId", () => {
  test("the one tank with the most points leads", () => {
    expect(leaderId([bot("a", 1), bot("b", 4), bot("c", -2)])).toBe("b");
  });

  test("a tie at the top, also 0 to 0 at the start, has no leader", () => {
    expect(leaderId([bot("a", 4), bot("b", 4), bot("c", 1)])).toBeNull();
    expect(leaderId([bot("a", 0), bot("b", 0)])).toBeNull();
    expect(leaderId([])).toBeNull();
  });

  test("a tie below the top does not matter", () => {
    expect(leaderId([bot("a", 1), bot("b", 1), bot("c", 3)])).toBe("c");
  });
});

describe("tankLooks", () => {
  test("a chosen look wins and the other tanks are plain in the colours of their order", () => {
    const chosen = { colour: 6, skin: "stars", second: 3, plate: 9, icon: "cat" } as const;
    const looks = tankLooks([bot("a", 0), bot("b", 0), bot("c", 0)], new Map([["b", { look: chosen }]]));
    expect([...looks.values()]).toEqual([plainTankLook(1), chosen, plainTankLook(3)]);
  });

  test("past 12 tanks the colours repeat", () => {
    const bots = Array.from({ length: 14 }, (_, i) => bot(`p${i}`, 0));
    expect(tankLooks(bots, undefined).get("p12")?.colour).toBe(1);
  });
});

describe("boardDetail", () => {
  test("large squares get full tanks with labels, small ones simple tanks, tiny ones tiny tanks without labels", () => {
    expect(boardDetail(null)).toEqual({ tank: "full", labels: true, gauges: true });
    expect(boardDetail(60)).toEqual({ tank: "full", labels: true, gauges: true });
    expect(boardDetail(30)).toEqual({ tank: "simple", labels: true, gauges: true });
    expect(boardDetail(15)).toEqual({ tank: "tiny", labels: false, gauges: true });
    expect(boardDetail(13)).toEqual({ tank: "tiny", labels: false, gauges: false });
  });
});

describe("gaugeShape", () => {
  const standard = ruleSet("standard");
  const downpour = ruleSet("downpour");

  test("a full tank fills the track and an empty tank fills none of it", () => {
    expect(gaugeShape(standard.waterCapacity, 9, standard).fillWidth).toBe(9);
    expect(gaugeShape(0, 9, standard).fillWidth).toBe(0);
  });

  test("the fill reaches the tick exactly when the bot can throw, in every rule set", () => {
    for (const rules of [standard, downpour, ruleSet("dry-spell")]) {
      for (let water = 0; water <= rules.waterCapacity; water += 1) {
        const gauge = gaugeShape(water, 9, rules);
        expect(gauge.canThrow).toBe(water >= rules.waterPerThrow);
        expect(gauge.fillWidth >= gauge.tickAt).toBe(gauge.canThrow);
      }
    }
  });

  test("a non-standard set moves the tick and the scale of the fill", () => {
    // Downpour: 12 water in the tank, 2 per throw. 9 water is 9/12 of the track, and the tick sits at 2/12.
    const gauge = gaugeShape(9, 12, downpour);
    expect(gauge.fillWidth).toBe(9);
    expect(gauge.tickAt).toBe(2);
    expect(gaugeShape(9, 12, standard).fillWidth).toBe(12);
  });

  test("a value outside the tank does not draw outside the track", () => {
    expect(gaugeShape(standard.waterCapacity + 5, 9, standard).fillWidth).toBe(9);
    expect(gaugeShape(-2, 9, standard).fillWidth).toBe(0);
  });
});

describe("youMarkerBelow", () => {
  const view = { inTopRow: false, inBottomRow: false };
  test("the You label sits above the tank, and under it when a tank stands above and the square under is free", () => {
    expect(youMarkerBelow({ x: 3, y: 3 }, [], view)).toBe(false);
    expect(youMarkerBelow({ x: 3, y: 3 }, [{ x: 3, y: 2 }], view)).toBe(true);
    // Tanks above and under: the label stays above, as before.
    expect(youMarkerBelow({ x: 3, y: 3 }, [{ x: 3, y: 2 }, { x: 3, y: 4 }], view)).toBe(false);
  });

  test("the top row puts it under; the bottom row keeps it above", () => {
    expect(youMarkerBelow({ x: 3, y: 0 }, [], { inTopRow: true, inBottomRow: false })).toBe(true);
    expect(youMarkerBelow({ x: 3, y: 7 }, [{ x: 3, y: 6 }], { inTopRow: false, inBottomRow: true })).toBe(false);
  });
});
