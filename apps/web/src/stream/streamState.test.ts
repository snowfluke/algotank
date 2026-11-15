/// <reference types="bun" />
import { describe, expect, test } from "bun:test";
import type { Decision, ThrowEvent } from "@game/engine";
import { decision, emptyCompactTick, engineRound, lobbyArena, snapshotAt } from "./fixtures.ts";
import { compactTick, type CompactTick, type PublicArena } from "@game/arena";
import { INITIAL_STREAM_STATE, OWN_DECISIONS_KEPT, reduceStream, snapshotFor, type ArenaStreamState } from "./streamState.ts";

function apply(state: ArenaStreamState, ...actions: Parameters<typeof reduceStream>[1][]): ArenaStreamState {
  return actions.reduce(reduceStream, state);
}

const roundStart = (round: number) =>
  ({ kind: "message", message: { type: "roundStart", round, snapshot: snapshotAt(0), startsInMs: 0 }, receivedAt: 0 }) as const;
const tick = (round: number, n: number, own: Decision | null = decision(`r${n}`)) =>
  ({ kind: "message", message: { type: "tick", round, tick: emptyCompactTick(n), own }, receivedAt: 0 }) as const;

describe("reduceStream", () => {
  test("stores the arena", () => {
    const next = apply(INITIAL_STREAM_STATE, { kind: "message", message: { type: "arena", arena: lobbyArena() }, receivedAt: 0 });
    expect(next.arena?.id).toBe("a1");
  });

  test("keeps only the latest decisions of the round", () => {
    const actions = Array.from({ length: OWN_DECISIONS_KEPT + 3 }, (_, n) => tick(1, n));
    const next = apply(INITIAL_STREAM_STATE, roundStart(1), ...actions);
    expect(next.ownDecisions).toHaveLength(OWN_DECISIONS_KEPT);
    expect(next.ownDecisions.at(-1)?.tick).toBe(OWN_DECISIONS_KEPT + 2);
  });

  test("a new round clears the feed", () => {
    const next = apply(INITIAL_STREAM_STATE, roundStart(1), tick(1, 0), roundStart(2));
    expect(next.ownDecisions).toHaveLength(0);
    expect(next.snapshotRound).toBe(2);
  });

  test("a roundStart resent on reconnect keeps the feed", () => {
    const next = apply(INITIAL_STREAM_STATE, roundStart(1), tick(1, 0), tick(1, 1), roundStart(1));
    expect(next.ownDecisions).toHaveLength(2);
  });

  test("the feed keeps what the player's own throw did, and nothing for another bot's throw", () => {
    const tank = (id: string, x: number) => ({ id, x, y: 0, direction: "E" as const, score: 0, wasHit: false, build: {}, hitsLanded: 0, hitsTaken: 0, water: 9, item: null, effect: null });
    const spawn = { ...snapshotAt(0), bots: [tank("p1", 0), tank("p2", 1)] };
    const start = { kind: "message", message: { type: "roundStart", round: 1, snapshot: spawn, startsInMs: 0 }, receivedAt: 0 } as const;
    // Compact throws: [thrower, outcome (0 empty, 1 dry), target, distance, hit chance].
    const withThrows = (n: number, throws: readonly (readonly number[])[]) => {
      const tick: CompactTick = { tick: n, bots: [[0, 0, 2, 0, 9, 0, 0, 0], [1, 0, 2, 0, 9, 0, 0, 0]], moves: [[0, 0], [1, 0]], throws, items: [], pickups: [] };
      return { kind: "message", message: { type: "tick", round: 1, tick, own: decision(`r${n}`) }, receivedAt: 0 } as const;
    };
    const next = apply(INITIAL_STREAM_STATE, start, withThrows(0, [[1, 0, -1, -1, -1], [0, 1, 1, 1, -1]]), withThrows(1, [[1, 0, -1, -1, -1]]));
    const dry: ThrowEvent = { throwerId: "p1", outcome: "dry", targetId: "p2", distance: 1 };
    expect(next.protocolError).toBeNull();
    expect(next.ownDecisions.map((entry) => entry.throwEvent)).toEqual([dry, null]);
  });

  test("ignores a tick of an older round", () => {
    const next = apply(INITIAL_STREAM_STATE, roundStart(2), tick(1, 5));
    expect(next.snapshotRound).toBe(2);
    expect(next.snapshot?.tick).toBe(0);
  });

  test("a viewer's ticks add nothing to the feed", () => {
    const next = apply(INITIAL_STREAM_STATE, roundStart(1), tick(1, 0, null));
    expect(next.ownDecisions).toHaveLength(0);
    expect(next.snapshot?.tick).toBe(1);
  });

  test("an unreadable message sets the error and the next valid one clears it", () => {
    const broken = apply(INITIAL_STREAM_STATE, { kind: "unreadable", reason: "bad" });
    expect(broken.protocolError).toBe("bad");
    expect(apply(broken, roundStart(1)).protocolError).toBeNull();
  });

  test("a reset drops the arena, so a new token never meets the old arena", () => {
    const withArena = apply(INITIAL_STREAM_STATE, { kind: "message", message: { type: "arena", arena: lobbyArena() }, receivedAt: 0 });
    expect(withArena.arena).not.toBeNull();
    expect(apply(withArena, { kind: "reset", playerToken: null })).toEqual(INITIAL_STREAM_STATE);
  });

  test("a reset names the token the new stream belongs to, so a page can tell an arena seen with an older seat", () => {
    const withArena = apply(INITIAL_STREAM_STATE, { kind: "message", message: { type: "arena", arena: lobbyArena() }, receivedAt: 0 });
    const reset = apply(withArena, { kind: "reset", playerToken: "new" });
    expect(reset.playerToken).toBe("new");
    expect(reset.arena).toBeNull();
  });

  test("snapshotFor returns the snapshot only for its own round", () => {
    const next = apply(INITIAL_STREAM_STATE, roundStart(1));
    expect(snapshotFor(next, 1)).not.toBeNull();
    expect(snapshotFor(next, 2)).toBeNull();
    expect(snapshotFor(INITIAL_STREAM_STATE, 1)).toBeNull();
  });

  test("a closed message marks the connection closed and keeps the last arena", () => {
    const withArena = apply(INITIAL_STREAM_STATE, { kind: "message", message: { type: "arena", arena: lobbyArena() }, receivedAt: 0 });
    const closed = apply(withArena, { kind: "message", message: { type: "closed" }, receivedAt: 0 });
    expect(closed.connection).toBe("closed");
    expect(closed.arena).toEqual(lobbyArena());
  });

  test("the pause before the first turn becomes a time, anchored to when the message arrived, and the first tick clears it", () => {
    const start = { kind: "message", message: { type: "roundStart", round: 1, snapshot: snapshotAt(0), startsInMs: 3000 }, receivedAt: 10_000 } as const;
    const counting = apply(INITIAL_STREAM_STATE, start);
    expect(counting.firstTurnAt).toBe(13_000);
    expect(apply(counting, tick(1, 0)).firstTurnAt).toBeNull();
    expect(apply(INITIAL_STREAM_STATE, roundStart(1)).firstTurnAt).toBeNull();
  });

  test("the server's next step becomes a time, and an arena without one clears it", () => {
    const withAuto: PublicArena = { ...lobbyArena(), auto: { action: "start", inMs: 20_000 } };
    const next = apply(INITIAL_STREAM_STATE, { kind: "message", message: { type: "arena", arena: withAuto }, receivedAt: 5_000 });
    expect(next.nextStep).toEqual({ action: "start", at: 25_000 });
    expect(apply(next, { kind: "message", message: { type: "arena", arena: lobbyArena() }, receivedAt: 6_000 }).nextStep).toBeNull();
  });

  test("a new game starts its rounds at 1 again, so the old game's round data is dropped", () => {
    const game1 = apply(
      INITIAL_STREAM_STATE,
      { kind: "message", message: { type: "arena", arena: lobbyArena() }, receivedAt: 0 },
      roundStart(1),
      roundStart(2),
      tick(2, 0),
    );
    const game2 = apply(game1, { kind: "message", message: { type: "arena", arena: { ...lobbyArena(), game: 2 } }, receivedAt: 0 });
    expect(game2.snapshotRound).toBeNull();
    expect(game2.ownDecisions).toHaveLength(0);
    const started = apply(game2, roundStart(1), tick(1, 0));
    expect(started.snapshotRound).toBe(1);
    expect(started.snapshot?.tick).toBe(1);
  });

  test("the same game keeps its round data when the arena changes", () => {
    const next = apply(
      INITIAL_STREAM_STATE,
      { kind: "message", message: { type: "arena", arena: lobbyArena() }, receivedAt: 0 },
      roundStart(1),
      { kind: "message", message: { type: "arena", arena: lobbyArena() }, receivedAt: 0 },
    );
    expect(next.snapshotRound).toBe(1);
  });


  describe("compact turns", () => {
    const { spawn, ticks } = engineRound(6, 12);
    const order = spawn.bots.map((bot) => bot.id);
    const start = { kind: "message", message: { type: "roundStart", round: 1, snapshot: spawn, startsInMs: 0 }, receivedAt: 0 } as const;
    const compact = (c: CompactTick, round = 1) => ({ kind: "message", message: { type: "tick", round, tick: c, own: null }, receivedAt: 0 }) as const;

    test("expand into the same snapshots and throws as the full turns", () => {
      let state = apply(INITIAL_STREAM_STATE, start);
      for (const full of ticks) {
        state = apply(state, compact(compactTick(full, order)));
        expect(state.protocolError).toBeNull();
        expect(state.snapshot).toEqual(full.snapshot);
        expect(state.throws).toEqual(full.throws);
      }
    });

    test("a compact turn before its round start is a protocol error that keeps the last state", () => {
      const first = ticks[0]!;
      const next = apply(INITIAL_STREAM_STATE, compact(compactTick(first, order)));
      expect(next.protocolError).not.toBeNull();
      expect(next.snapshot).toBeNull();
      const otherRound = apply(INITIAL_STREAM_STATE, start, compact(compactTick(first, order), 2));
      expect(otherRound.protocolError).not.toBeNull();
      expect(otherRound.snapshot).toEqual(spawn);
    });

    test("a malformed compact turn is a protocol error, not a crash", () => {
      const good = compactTick(ticks[0]!, order);
      const broken: CompactTick[] = [
        { ...good, bots: good.bots.slice(1) },
        { ...good, bots: good.bots.map((row, i) => (i === 0 ? row.slice(0, 7) : row)) },
        { ...good, bots: good.bots.map((row, i) => (i === 0 ? [row[0]!, row[1]!, 99, ...row.slice(3)] : row)) },
        { ...good, bots: good.bots.map((row, i) => (i === 0 ? [spawn.width, ...row.slice(1)] : row)) },
        { ...good, moves: good.moves.slice(1) },
        { ...good, throws: [[0, 3, 40, 1, 50]] },
        { ...good, throws: [[0, 9, 1, 1, 50]] },
      ];
      for (const tick of broken) {
        const next = apply(INITIAL_STREAM_STATE, start, compact(tick));
        expect(next.protocolError).not.toBeNull();
        expect(next.snapshot).toEqual(spawn);
      }
    });
  });
});

describe("the player's own statistics (K2)", () => {
  const view = { turns: 10, shots: 4, hits: 2, timesHit: 1, squaresMoved: 3, noRuleTurns: 5, modes: [{ name: "Only", rules: [5], fallback: 5 }] };
  const stats = (game: number) => ({ kind: "message", message: { type: "stats", stats: { game, round: 1, last: view, gameTotal: view } }, receivedAt: 0 }) as const;
  const arenaOfGame = (game: number) => ({ kind: "message", message: { type: "arena", arena: { ...lobbyArena(), game } }, receivedAt: 0 }) as const;

  test("are kept from the stats message and stay through the arena message of the same game", () => {
    const next = apply(INITIAL_STREAM_STATE, arenaOfGame(1), stats(1), arenaOfGame(1));
    expect(next.ownStats?.last.shots).toBe(4);
  });

  test("go when the arena starts another game", () => {
    const next = apply(INITIAL_STREAM_STATE, arenaOfGame(1), stats(1), arenaOfGame(2));
    expect(next.ownStats).toBeNull();
  });
});
