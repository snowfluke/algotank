import { describe, expect, test } from "bun:test";
import { DEMO_ORDERS, START_ORDER, YOU, recordDemo, tellsTheStory, type DemoOrder } from "./demo-round.ts";

describe("landing demo", () => {
  test("the engine still shows that the rule order changes the tank's place", () => {
    const { rounds } = recordDemo();
    expect(tellsTheStory(rounds)).toBe(true);
    const start = rounds.find((round) => round.order.join() === START_ORDER.join());
    // The page opens on a losing order, so the visitor has something to fix.
    expect(start?.rank).toBeGreaterThanOrEqual(6);
  });

  test("each recorded round plays the demo tank against seven bots", () => {
    const { rounds } = recordDemo();
    expect(rounds).toHaveLength(DEMO_ORDERS.length);
    for (const round of rounds) {
      expect(round.spawn.bots).toHaveLength(8);
      expect(round.spawn.bots.some((bot) => bot.id === YOU)).toBe(true);
    }
  });

  test("the story fails when a shoot-first order wins", () => {
    const ranks: [DemoOrder, number][] = DEMO_ORDERS.map((order) => [order, order[0] === "shoot" ? 7 : 2]);
    const story = ranks.map(([order, rank]) => ({ order, rank }));
    expect(tellsTheStory(story)).toBe(false);
    expect(tellsTheStory(story.map((round) => (round.order[0] === "shoot" ? round : { ...round, rank: 1 })))).toBe(true);
    expect(tellsTheStory(story.map((round, i) => (i === 0 ? { ...round, rank: 1 } : round)))).toBe(false);
  });
});
