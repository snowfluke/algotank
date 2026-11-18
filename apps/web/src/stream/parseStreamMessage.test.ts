/// <reference types="bun" />
import { describe, expect, test } from "bun:test";
import { ULTIMATE_IDS } from "@game/engine";
import { arenaIn, decision, emptyCompactTick, engineRound, lobbyArena, snapshotAt } from "./fixtures.ts";
import { parseStreamMessage } from "./parseStreamMessage.ts";

const json = (value: unknown) => JSON.stringify(value);

describe("parseStreamMessage", () => {
  test("accepts each of the four message types", () => {
    const arena = parseStreamMessage("arena", json({ type: "arena", arena: lobbyArena() }));
    const start = parseStreamMessage("roundStart", json({ type: "roundStart", round: 1, snapshot: snapshotAt(0), startsInMs: 3000 }));
    const closed = parseStreamMessage("closed", json({ type: "closed" }));
    const tick = parseStreamMessage(
      "tick",
      json({ type: "tick", round: 1, tick: emptyCompactTick(0), own: decision("r1") }),
    );
    expect(arena.ok && arena.message.type).toBe("arena");
    expect(start.ok && start.message.type).toBe("roundStart");
    expect(tick.ok && tick.message.type).toBe("tick");
    expect(closed.ok && closed.message).toEqual({ type: "closed" });
  });

  test("reads the arena kind, the game, the next step and each player's bot flag, ready flag and look", () => {
    const look = { colour: 3, skin: "dots", second: 5, plate: 9, icon: "star" };
    const players = [{ id: "b1", name: "Splashy", status: { kind: "playing" }, isBot: true, ready: false, look }];
    const arena = { ...lobbyArena(), players, game: 2, auto: { action: "start", inMs: 20000 } };
    expect(parseStreamMessage("arena", json({ type: "arena", arena })).ok).toBe(true);
    expect(parseStreamMessage("arena", json({ type: "arena", arena: { ...arena, auto: { action: "later", inMs: 1 } } })).ok).toBe(false);
    // A server from before "My tank" sends a colour and no look; a look with an unknown part is refused too.
    expect(parseStreamMessage("arena", json({ type: "arena", arena: { ...arena, players: [{ ...players[0], look: undefined, colour: 3 }] } })).ok).toBe(false);
    expect(parseStreamMessage("arena", json({ type: "arena", arena: { ...arena, players: [{ ...players[0], look: { ...look, icon: "dragon" } }] } })).ok).toBe(false);
    const { game: _game, ...noGame } = arena;
    expect(parseStreamMessage("arena", json({ type: "arena", arena: noGame })).ok).toBe(false);
    expect(parseStreamMessage("arena", json({ type: "arena", arena: { ...arena, settings: { ...arena.settings, kind: "club" } } })).ok).toBe(false);
    // A server from before the three public arenas sends no ready flag and no time to the next game.
    expect(parseStreamMessage("arena", json({ type: "arena", arena: { ...arena, players: [{ ...players[0], ready: undefined }] } })).ok).toBe(false);
    const { nextGameInMs: _next, ...noNextGame } = arena;
    expect(parseStreamMessage("arena", json({ type: "arena", arena: noNextGame })).ok).toBe(false);
    expect(parseStreamMessage("arena", json({ type: "arena", arena: { ...arena, settings: { ...arena.settings, kind: "tournament" }, nextGameInMs: 41000 } })).ok).toBe(true);
    expect(parseStreamMessage("arena", json({ type: "arena", arena: { ...arena, settings: { ...arena.settings, kind: "public" } } })).ok).toBe(false);
  });

  test("a dizzy turn of the player's own tank is read, and any other dizzy value is not", () => {
    const own = { botId: "p", modeId: "m", ruleId: null, actionId: "throw", move: "T", nextModeId: "m" };
    expect(parseStreamMessage("tick", json({ type: "tick", round: 1, tick: emptyCompactTick(0), own: { ...own, dizzy: true } })).ok).toBe(true);
    expect(parseStreamMessage("tick", json({ type: "tick", round: 1, tick: emptyCompactTick(0), own: { ...own, dizzy: "yes" } })).ok).toBe(false);
  });

  test("a tick for a viewer has own = null", () => {
    const tick = parseStreamMessage("tick", json({ type: "tick", round: 1, tick: emptyCompactTick(0), own: null }));
    expect(tick.ok).toBe(true);
  });

  test("rejects invalid JSON", () => {
    expect(parseStreamMessage("arena", "{oops").ok).toBe(false);
  });

  test("rejects an unknown type and a type that differs from the event name", () => {
    expect(parseStreamMessage("arena", json({ type: "surprise" })).ok).toBe(false);
    expect(parseStreamMessage("tick", json({ type: "arena", arena: lobbyArena() })).ok).toBe(false);
  });

  test("rejects a message without the fields the pages read", () => {
    expect(parseStreamMessage("arena", json({ type: "arena", arena: { id: "a1" } })).ok).toBe(false);
    expect(parseStreamMessage("roundStart", json({ type: "roundStart", round: 1 })).ok).toBe(false);
    expect(parseStreamMessage("roundStart", json({ type: "roundStart", round: 1, snapshot: snapshotAt(0) })).ok).toBe(false);
    expect(parseStreamMessage("tick", json({ type: "tick", round: 1, tick: {}, own: null })).ok).toBe(false);
    const badOwn = parseStreamMessage("tick", json({ type: "tick", round: 1, tick: emptyCompactTick(0), own: { botId: 1 } }));
    expect(badOwn.ok).toBe(false);
  });

  test("rejects a bot without water, and a turn in the full form of a server from before the compact turns", () => {
    const noWater = { ...snapshotAt(0), bots: [{ id: "p1", x: 0, y: 0 }] };
    expect(parseStreamMessage("roundStart", json({ type: "roundStart", round: 1, snapshot: noWater, startsInMs: 0 })).ok).toBe(false);
    const fullTurn = { tick: 0, order: [], moves: [], throws: [{ throwerId: "p1", outcome: "dry", targetId: "p2", distance: 1 }], snapshot: snapshotAt(1) };
    expect(parseStreamMessage("tick", json({ type: "tick", round: 1, tick: fullTurn, own: null })).ok).toBe(false);
  });

  test("accepts each of the 8 directions and each move, and rejects any other value", () => {
    const withBot = (direction: unknown) => ({ ...snapshotAt(0), bots: [{ id: "p1", x: 0, y: 0, direction, water: 9 }] });
    const start = (direction: unknown) =>
      parseStreamMessage("roundStart", json({ type: "roundStart", round: 1, snapshot: withBot(direction), startsInMs: 0 })).ok;
    for (const direction of ["N", "NE", "E", "SE", "S", "SW", "W", "NW"]) expect(start(direction)).toBe(true);
    expect(start("north")).toBe(false);
    expect(start(undefined)).toBe(false);
    const tickWith = (move: unknown) =>
      parseStreamMessage("tick", json({ type: "tick", round: 1, tick: emptyCompactTick(0), own: { ...decision("r1"), move } })).ok;
    for (const move of ["F", "L", "R", "L45", "R45", "T"]) expect(tickWith(move)).toBe(true);
    expect(tickWith("l")).toBe(false);
  });

  test("rejects an arena with an unknown phase", () => {
    const arena = { ...lobbyArena(), phase: { kind: "paused" } };
    expect(parseStreamMessage("arena", json({ type: "arena", arena })).ok).toBe(false);
  });

  test("rejects an arena from a server that predates the settings", () => {
    const settings = { name: "n", ticksPerRound: 100, tickMs: 500 };
    expect(parseStreamMessage("arena", json({ type: "arena", arena: { ...lobbyArena(), settings } })).ok).toBe(false);
    const wrongMode = { ...lobbyArena().settings, ruleSetMode: "sometimes" };
    expect(parseStreamMessage("arena", json({ type: "arena", arena: { ...lobbyArena(), settings: wrongMode } })).ok).toBe(false);
  });

  test("rejects a rule set id the engine does not know, because ruleSet(id) would throw on the page", () => {
    const unknownNext = arenaIn({ kind: "lobby", nextRuleSetId: "wet-floor" as never, start: { kind: "waiting" } }, "announced");
    expect(parseStreamMessage("arena", json({ type: "arena", arena: unknownNext })).ok).toBe(false);
    const running = arenaIn(
      { kind: "running", round: 1, isFinal: false, seed: 1, ruleSetId: "wet-floor" as never, playerIds: [], survivorsAfterRound: 8 },
      "announced",
    );
    expect(parseStreamMessage("arena", json({ type: "arena", arena: running })).ok).toBe(false);
    const lateRound = { ...lobbyArena(), rounds: [{ round: 1, isFinal: false, seed: 1, standings: [], survivors: [] }] };
    expect(parseStreamMessage("arena", json({ type: "arena", arena: lateRound })).ok).toBe(false);
    const snapshot = { ...snapshotAt(0), ruleSetId: "wet-floor" };
    expect(parseStreamMessage("roundStart", json({ type: "roundStart", round: 1, snapshot, startsInMs: 0 })).ok).toBe(false);
  });

  test("accepts the surprise lobby, where the next set is null", () => {
    const surprise = arenaIn({ kind: "lobby", nextRuleSetId: null, start: { kind: "waiting" } }, "surprise");
    expect(parseStreamMessage("arena", json({ type: "arena", arena: surprise })).ok).toBe(true);
  });

  test("accepts a compact turn and rejects one whose lists are not rows of numbers", () => {
    const compact = { tick: 0, bots: [[1, 2, 0, 0, 10, 0, 0, 0]], moves: [[0, 0]], throws: [[0, 0, -1, -1, -1]], items: [[0, 3, 3, 30]], pickups: [] };
    expect(parseStreamMessage("tick", json({ type: "tick", round: 1, tick: compact, own: null })).ok).toBe(true);
    // A server from before items sends no item lists.
    const { items: _items, pickups: _pickups, ...beforeItems } = compact;
    for (const bad of [{ ...compact, bots: [{ x: 1 }] }, { ...compact, moves: [["0", 0]] }, { ...compact, throws: null }, { ...compact, tick: "0" }, beforeItems, { ...compact, items: [["bucket"]] }]) {
      expect(parseStreamMessage("tick", json({ type: "tick", round: 1, tick: bad, own: null })).ok).toBe(false);
    }
  });

  test("reads ultimate states and fire payloads and rejects invalid counts, indexes and shapes", () => {
    const { spawn: snapshot } = engineRound(2, 1);
    const start = (fields: object) => parseStreamMessage("roundStart", json({
      type: "roundStart", round: 1, startsInMs: 0,
      snapshot: { ...snapshot, bots: [{ ...snapshot.bots[0], ...fields }] },
    }));
    const smoke = { ultimate: { id: "smoke", kind: "charging", turnsLeft: 40 }, ultimateEffect: { kind: "smoke", turnsLeft: 9 } };
    expect(start(smoke).ok).toBe(true);
    expect(start({ ...smoke, ultimate: { id: "smoke", kind: "charging", turnsLeft: 0 } }).ok).toBe(false);
    expect(start({ ...smoke, ultimateEffect: { kind: "fullTank", freeShots: 2 } }).ok).toBe(false);

    const tick = { tick: 0, bots: [[1, 2, 0, 0, 10, 0, 0, 0]], moves: [[0, 0]], throws: [], items: [], pickups: [],
      ultimates: [[0, ULTIMATE_IDS.indexOf("smoke"), 40, 9]], fires: [[0, "smoke", 1, 2]] };
    const own = { ...decision("r1"), ruleId: null, actionId: "ultimate", move: "W", ultimate: "smoke" };
    const turn = (fields: object, decision: unknown = own) => parseStreamMessage("tick", json({
      type: "tick", round: 1, tick: { ...tick, ...fields }, own: decision,
    }));
    expect(turn({}).ok).toBe(true);
    expect(turn({}, { ...own, ultimate: "unknown" }).ok).toBe(false);
    for (const fields of [
      { ultimates: [[0, 42, 40, 0]] },
      { ultimates: [[1, 0, 0, 0]] },
      { ultimates: [[0, 0, 0, 3]] },
      { fires: [[0, "dash", 1, 2, [[2, "3"]]]] },
      { fires: [[0, "splash", 1, 2, [[2, 3, "hit", 1]]]] },
      { fires: [[0, "mudBomb", 1, 2, null, [], [], 1]] },
    ]) expect(turn(fields).ok).toBe(false);
  });
});

describe("the stats event (K2)", () => {
  const view = { turns: 10, shots: 4, hits: 2, timesHit: 1, squaresMoved: 3, noRuleTurns: 5, modes: [{ name: "Only", rules: [5], fallback: 5 }] };
  const event = (stats: unknown) => JSON.stringify({ type: "stats", stats });

  test("is read when its numbers and rules fit", () => {
    const parsed = parseStreamMessage("stats", event({ game: 1, round: 2, last: view, gameTotal: view }));
    expect(parsed.ok && parsed.message.type === "stats" && parsed.message.stats.round).toBe(2);
  });

  test("reads ultimate turns and defaults the field from older servers to zero", () => {
    const read = (last: object, gameTotal: object = view) => parseStreamMessage("stats", event({ game: 1, round: 2, last, gameTotal }));
    const ultimateTurns = (last: object) => {
      const parsed = read(last);
      return parsed.ok && parsed.message.type === "stats" && parsed.message.stats.last.ultimateTurns;
    };
    expect(ultimateTurns(view)).toBe(0);
    expect(ultimateTurns({ ...view, ultimateTurns: 2 })).toBe(2);
    const parsed = read({ ...view, ultimateTurns: 2 }, { ...view, ultimateTurns: 3 });
    expect(parsed.ok && parsed.message.type === "stats" && parsed.message.stats.gameTotal.ultimateTurns).toBe(3);
    expect(read({ ...view, ultimateTurns: -1 }).ok).toBe(false);
    expect(read({ ...view, ultimateTurns: 11 }).ok).toBe(false);
    expect(read(view, { ...view, ultimateTurns: -1 }).ok).toBe(false);
  });

  test("is a protocol error when a number is missing, below zero, or more hits than shots", () => {
    expect(parseStreamMessage("stats", event({ game: 1, round: 2, last: { ...view, shots: undefined }, gameTotal: view })).ok).toBe(false);
    expect(parseStreamMessage("stats", event({ game: 1, round: 2, last: { ...view, turns: -1 }, gameTotal: view })).ok).toBe(false);
    expect(parseStreamMessage("stats", event({ game: 1, round: 2, last: { ...view, hits: 9 }, gameTotal: view })).ok).toBe(false);
    expect(parseStreamMessage("stats", event({ game: 1, round: 2, last: { ...view, modes: [] }, gameTotal: view })).ok).toBe(false);
  });
});
