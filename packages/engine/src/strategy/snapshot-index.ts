// Lookups over one snapshot, built once and shared by every bot that decides from it.
//
// Why: every bot decides from the same snapshot (types.ts, rule 2), and the
// conditions, selectors and actions ask "who stands on this cell" and "who is
// aimed at me" many times per bot. Answered by a scan of all bots, "aimed at me"
// was a scan inside a scan per bot, so a tick cost about n^3: 1 s per tick with
// 512 bots (docs/decisions, "Large arenas, 2026-11-12"). With this index a cell is
// one map lookup and "aimed at me" walks the 8 lines around the bot.
//
// The index is kept in a WeakMap keyed by the snapshot object, so it adds no field to
// the contract and goes away with the snapshot. Snapshots are never changed in place
// (every field is readonly and the round builds a new one per tick), which is what
// makes the cache valid.
//
// Every lookup returns what the scan it replaces returned, in the same order: bots
// on one cell keep their snapshot order, and lists are sorted by snapshot position.

import type { BotId, BotState, Snapshot } from "../types.ts";

/** Room for coordinates from -2048 to 6143, far past any arena and any test grid. */
const KEY_OFFSET = 2048;
const KEY_STRIDE = 8192;

function cellKey(x: number, y: number): number {
  return (x + KEY_OFFSET) * KEY_STRIDE + (y + KEY_OFFSET);
}

export interface SnapshotIndex {
  /** The bots on a cell, in snapshot order, or undefined when the cell is empty. */
  botsAt(x: number, y: number): readonly BotState[] | undefined;
  /** The snapshot's bot with this id. */
  botById(id: BotId): BotState | undefined;
  /** The position of a bot in `snapshot.bots`. */
  positionOf(id: BotId): number;
  /** Every score, highest first. */
  readonly scoresHighFirst: readonly number[];
  /** Memo of botsThatCanHit, by target id. */
  readonly canHit: Map<BotId, readonly BotState[]>;
}

const cache = new WeakMap<Pick<Snapshot, "bots">, SnapshotIndex>();

function build(snapshot: Pick<Snapshot, "bots">): SnapshotIndex {
  const cells = new Map<number, BotState[]>();
  const byId = new Map<BotId, BotState>();
  const position = new Map<BotId, number>();
  snapshot.bots.forEach((bot, i) => {
    const key = cellKey(bot.x, bot.y);
    const list = cells.get(key);
    if (list === undefined) cells.set(key, [bot]);
    else list.push(bot);
    // The first bot with an id wins, as a scan that stops at the first match would find it.
    if (!byId.has(bot.id)) {
      byId.set(bot.id, bot);
      position.set(bot.id, i);
    }
  });
  let scores: number[] | null = null;
  return {
    botsAt: (x, y) => cells.get(cellKey(x, y)),
    botById: (id) => byId.get(id),
    positionOf: (id) => {
      const i = position.get(id);
      if (i === undefined) throw new Error(`bot "${id}" is not in the snapshot`);
      return i;
    },
    get scoresHighFirst() {
      scores ??= snapshot.bots.map((bot) => bot.score).sort((a, b) => b - a);
      return scores;
    },
    canHit: new Map(),
  };
}

export function indexOf(snapshot: Pick<Snapshot, "bots">): SnapshotIndex {
  let index = cache.get(snapshot);
  if (index === undefined) {
    index = build(snapshot);
    cache.set(snapshot, index);
  }
  return index;
}

/** Calls `visit` for every bot within `radius` cells (Chebyshev) of a cell, the cell's own bots included. */
export function forEachBotNear(snapshot: Pick<Snapshot, "bots">, x: number, y: number, radius: number, visit: (bot: BotState) => void): void {
  const index = indexOf(snapshot);
  for (let dx = -radius; dx <= radius; dx++) {
    for (let dy = -radius; dy <= radius; dy++) {
      const bots = index.botsAt(x + dx, y + dy);
      if (bots !== undefined) for (const bot of bots) visit(bot);
    }
  }
}
