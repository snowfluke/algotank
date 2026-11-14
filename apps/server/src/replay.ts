// A replay is recomputed from the stored seed, the rule set and the strategies played. It is
// computed once per completed round and kept on the arena record. The ticks are compact
// (compact-tick.ts in @game/arena). Measured for 512 players (docs/decisions, "Large arenas"):
// 90 turns take 352 ms of the single event loop and give 1.59 MB of JSON (0.43 MB gzip, 33 ms);
// 300 turns take 1,133 ms and give 5.58 MB (1.48 MB gzip, 101 ms).
// The gzip form is kept beside it, per audience, because `own` differs per player.
// ponytail: the first request blocks the event loop for the round's length (other arenas'
// ticks wait), and each player who asks costs one gzip. A worker for the recompute and one
// gzip of the shared part would clear it. The web client does not request replays today.
// Neither is saved to disk. After a restart the first request computes the replay again
// from the round config, and a round is deterministic, so the result is the same.

import type { PlayerId } from "@game/arena";
import { runRound, type Decision } from "@game/engine";
import { toCompactTick, toPublicSnapshot } from "./public-tick.ts";
import type { ArenaRecord, StoredReplay } from "./store.ts";

/** Undefined for a round that has not completed. Rounds that completed never change, so the result stays valid. */
function storedReplay(record: ArenaRecord, round: number): StoredReplay | undefined {
  // An aborted round reuses its number, so a stored config alone does not mean the round completed.
  if (!record.arena.rounds.some((summary) => summary.round === round)) return undefined;
  const cached = record.replays.get(round);
  if (cached !== undefined) return cached;

  const config = record.roundConfigs.get(round);
  if (config === undefined) return undefined;
  const { spawn, ticks } = runRound(config);

  const ownByPlayer = new Map<PlayerId, Decision[]>();
  for (const tick of ticks) {
    for (const decision of tick.decisions) {
      const list = ownByPlayer.get(decision.botId);
      if (list === undefined) ownByPlayer.set(decision.botId, [decision]);
      else list.push(decision);
    }
  }
  const stored: StoredReplay = {
    spawnJson: JSON.stringify(toPublicSnapshot(spawn)),
    ticksJson: JSON.stringify(ticks.map(toCompactTick)),
    ownByPlayer,
    gzipByAudience: new Map(),
  };
  record.replays.set(round, stored);
  return stored;
}

/**
 * The JSON text of a ReplayResponse, or undefined for a round that has not
 * completed. The large public part is shared; only `own` differs per player.
 * `own` is null for a viewer and empty for a player who was not in the round.
 */
export function replayJson(record: ArenaRecord, round: number, playerId: PlayerId | null): string | undefined {
  const stored = storedReplay(record, round);
  return stored === undefined ? undefined : bodyOf(stored, round, playerId);
}

/** The same body as replayJson, gzip-compressed once per audience (a player, or null for viewers) and then kept. */
export function replayGzip(record: ArenaRecord, round: number, playerId: PlayerId | null): Uint8Array<ArrayBuffer> | undefined {
  const stored = storedReplay(record, round);
  if (stored === undefined) return undefined;
  let bytes = stored.gzipByAudience.get(playerId);
  if (bytes === undefined) {
    bytes = Bun.gzipSync(bodyOf(stored, round, playerId));
    stored.gzipByAudience.set(playerId, bytes);
  }
  return bytes;
}

function bodyOf(stored: StoredReplay, round: number, playerId: PlayerId | null): string {
  const own = playerId === null ? null : (stored.ownByPlayer.get(playerId) ?? []);
  return `{"round":${round},"spawn":${stored.spawnJson},"ticks":${stored.ticksJson},"own":${JSON.stringify(own)}}`;
}
