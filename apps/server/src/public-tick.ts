// What a viewer sees of a snapshot and a tick, and what one player additionally sees.
// Every snapshot the server sends goes through toPublicSnapshot, so one allow-list
// (PublicBot in @game/arena) decides what leaves the server.

import { compactTick, type CompactTick, type PlayerId, type PublicBot, type PublicSnapshot, type PublicTick, type StreamMessage } from "@game/arena";
import type { BotState, Decision, Snapshot, TickResult } from "@game/engine";

function toPublicBot(bot: BotState): PublicBot {
  return {
    id: bot.id,
    x: bot.x,
    y: bot.y,
    direction: bot.direction,
    score: bot.score,
    wasHit: bot.wasHit,
    build: bot.build,
    hitsLanded: bot.hitsLanded,
    hitsTaken: bot.hitsTaken,
    water: bot.water,
    item: bot.item,
    effect: bot.effect,
  };
}

/** Copies the allowed fields one by one, so a field added to the engine stays private until PublicBot names it. */
export function toPublicSnapshot(snapshot: Snapshot): PublicSnapshot {
  return {
    width: snapshot.width,
    height: snapshot.height,
    tick: snapshot.tick,
    ticksTotal: snapshot.ticksTotal,
    survivorsAfterRound: snapshot.survivorsAfterRound,
    ruleSetId: snapshot.ruleSetId,
    bots: snapshot.bots.map(toPublicBot),
    items: snapshot.items,
  };
}

/** Drops the rules behind each move. The live stream and the replay both use it. */
export function toPublicTick(result: TickResult): PublicTick {
  return {
    tick: result.tick,
    order: result.order,
    moves: result.decisions.map((d) => ({ botId: d.botId, move: d.move })),
    throws: result.throws,
    pickups: result.pickups,
    snapshot: toPublicSnapshot(result.snapshot),
  };
}

/**
 * The form a tick takes on the wire (the stream and the replay). The engine keeps the
 * spawn's bot order for the whole round, so the snapshot's own order is the index order
 * the client knows from roundStart.
 */
export function toCompactTick(result: TickResult & Pick<PublicTick, "freshStarts">): CompactTick {
  const tick = toPublicTick(result);
  const { freshStarts } = result;
  return compactTick(freshStarts?.length ? { ...tick, freshStarts } : tick, result.snapshot.bots.map((bot) => bot.id));
}

/**
 * The roundStart message, sent when a round starts and when a viewer connects mid-round.
 * `startsInMs` is what is left of the pause before the first tick, 0 once the ticks run.
 */
export function roundStartMessage(round: number, snapshot: Snapshot, startsInMs: number): StreamMessage {
  return { type: "roundStart", round, snapshot: toPublicSnapshot(snapshot), startsInMs };
}

/** Each player's decision on this tick, by id, so a stream of 512 players does not search the list per connection. */
export function decisionsById(result: TickResult): ReadonlyMap<PlayerId, Decision> {
  return new Map(result.decisions.map((d) => [d.botId, d] as const));
}
