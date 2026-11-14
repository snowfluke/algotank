import { describe, expect, test } from "bun:test";
import { applyEvent, createArena, parsePlayerName, plainTankLook, type Arena, type ArenaEvent, type TankColour } from "@game/arena";
import { PRESETS } from "@game/engine";
import { BOT_LINEUP, BOT_NAMES, botNames, botsToFill } from "./bots.ts";
import { hasBlockedWord } from "./name-filter.ts";

const strategy = PRESETS[0]!.strategy;

function privateArena(humans: readonly { name: string; colour: TankColour }[], tankCount = 8, botFill = true): Arena {
  let arena = createArena(
    "ABC234",
    { name: "Bots", kind: "private", ticksPerRound: 20, tickMs: 100, ruleSetMode: "standard", botFill, joinPolicy: "anyone", tankCount },
    "standard",
  );
  humans.forEach((human, i) => {
    const event: ArenaEvent = { kind: "join", playerId: `p${i}`, name: human.name, strategy, look: plainTankLook(human.colour) };
    const result = applyEvent(arena, event);
    if (!result.ok) throw new Error(result.error);
    arena = result.arena;
  });
  return arena;
}

let counter = 0;
const newId = () => `b${++counter}`;
const presetIdOf = (s: unknown) => PRESETS.find((p) => p.strategy === s)?.id;

describe("botsToFill", () => {
  test("fills to the owner's tank count: 47 bots join one human in a game of 48, and none with the switch off", () => {
    const bots = botsToFill(privateArena([{ name: "Ayu", colour: 1 }], 48), newId);
    expect(bots).toHaveLength(47);
    expect(new Set(bots.map((b) => b.name.toLowerCase())).size).toBe(47);
    expect(botsToFill(privateArena([{ name: "Ayu", colour: 1 }], 48, false), newId)).toEqual([]);
  });

  test("botNames gives 511 valid names, none of them taken, for the biggest presenter arena", () => {
    const names = botNames(511, new Set(["splashy", "bubbles 2"]));
    expect(names).toHaveLength(511);
    expect(new Set(names.map((n) => n.toLowerCase())).size).toBe(511);
    expect(names).not.toContain("Splashy");
    expect(names).not.toContain("Bubbles 2");
    for (const name of names) expect(parsePlayerName(name)).toBe(name);
  });

  test("one human gets 7 bots: 3 weak, 3 middle and 1 strong", () => {
    const bots = botsToFill(privateArena([{ name: "Ayu", colour: 1 }]), newId);
    expect(bots).toHaveLength(7);
    const tierOf = (presetId: string | undefined) => BOT_LINEUP.find((slot) => slot.presetId === presetId)?.tier;
    const tiers = bots.map((b) => tierOf(presetIdOf(b.strategy)));
    expect(tiers.filter((t) => t === "weak")).toHaveLength(3);
    expect(tiers.filter((t) => t === "middle")).toHaveLength(3);
    expect(tiers.filter((t) => t === "strong")).toHaveLength(1);
    const ids = bots.map((b) => presetIdOf(b.strategy));
    for (const id of ids) expect(["charger", "random-walker", "backstabber", "picker", "ambusher", "leader-chaser", "evader"]).toContain(id!);
  });

  test("fills up to 8 players, and adds none to a full table", () => {
    expect(botsToFill(privateArena([{ name: "Ada", colour: 1 }, { name: "Bob", colour: 1 }, { name: "Cid", colour: 1 }]), newId)).toHaveLength(5);
    const eight = privateArena(Array.from({ length: 8 }, (_, i) => ({ name: `Human ${i}`, colour: 1 as const })));
    expect(botsToFill(eight, newId)).toEqual([]);
  });

  test("names are friendly, unique, and never a name a human in the arena has", () => {
    expect(BOT_NAMES.length).toBeGreaterThanOrEqual(16);
    expect(new Set(BOT_NAMES.map((n) => n.toLowerCase())).size).toBe(BOT_NAMES.length);
    const bots = botsToFill(privateArena([{ name: "splashy", colour: 1 }, { name: "Bubbles", colour: 1 }]), newId);
    const names = bots.map((b) => b.name.toLowerCase());
    expect(names).not.toContain("splashy");
    expect(names).not.toContain("bubbles");
    expect(new Set(names).size).toBe(names.length);
  });

  test("each bot gets a plain look in the least-used of the 12 colours", () => {
    const bots = botsToFill(privateArena([{ name: "Ayu", colour: 1 }, { name: "Bob", colour: 3 }]), newId);
    expect(bots.map((b) => b.look.colour)).toEqual([2, 4, 5, 6, 7, 8]);
    for (const bot of bots) expect(bot.look).toEqual(plainTankLook(bot.look.colour));
    // Colours 9 to 12 are free before any colour is used twice.
    const crowd = privateArena([1, 2, 3, 4, 5, 6, 7].map((colour, i) => ({ name: `Human ${i}`, colour: colour as TankColour })));
    expect(botsToFill(crowd, newId).map((b) => b.look.colour)).toEqual([8]);
    const busy = privateArena([1, 2, 3, 4, 5, 6].map((colour, i) => ({ name: `Human ${i}`, colour: colour as TankColour })));
    expect(botsToFill(busy, newId).map((b) => b.look.colour)).toEqual([7, 8]);
  });

  test("every bot name passes the name rule and the block list", () => {
    for (const name of BOT_NAMES) expect(hasBlockedWord(name)).toBe(false);
  });

  test("ids come from the given function, so they cannot collide with player ids", () => {
    const ids = botsToFill(privateArena([{ name: "Ayu", colour: 1 }]), () => "bot-x").map((b) => b.playerId);
    expect(ids.every((id) => id === "bot-x")).toBe(true);
  });

  test("the reducer accepts the bots, and one human with them can start", () => {
    const arena = privateArena([{ name: "Ayu", colour: 1 }]);
    const added = applyEvent(arena, { kind: "addBots", bots: botsToFill(arena, newId) });
    if (!added.ok) throw new Error(added.error);
    expect(added.arena.players.filter((p) => p.isBot)).toHaveLength(7);
    expect(applyEvent(added.arena, { kind: "startRound", seed: 1, ruleSetId: "standard" }).ok).toBe(true);
  });
});
