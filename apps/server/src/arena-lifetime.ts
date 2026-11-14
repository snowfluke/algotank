// How an arena ends: its owner closes it, it expires, or the server removes an extra
// public arena nobody plays in. All three do the same thing (closeArena).
//
// Expiry: a private or presenter arena is removed when nothing happened in it for
// ARENA_TTL_HOURS (no accepted event, no running round). The sweep runs at start and
// every 10 minutes. Public arenas never expire; public-arenas.ts manages them. The same sweep
// drops chat messages older than 24 hours (chat.ts). A chat post is not an arena event, so it
// does not keep an arena alive. It also removes stored results older than 180 days (results.ts).

import { isPublicKind } from "@game/arena";
import type { AutoSteps } from "./auto-steps.ts";
import type { ChatLimits, ChatStore } from "./chat.ts";
import type { ResultStore } from "./results.ts";
import type { RoundRunner } from "./round-runner.ts";
import type { ArenaRecord, Store } from "./store.ts";
import type { StreamHub } from "./stream.ts";
import type { Clock, Scheduler } from "./timers.ts";

export const DEFAULT_ARENA_TTL_HOURS = 24;
export const EXPIRY_SWEEP_MS = 10 * 60 * 1000;

export interface ArenaParts {
  readonly store: Store;
  readonly runner: RoundRunner;
  readonly hub: StreamHub;
  readonly autoSteps: AutoSteps;
  readonly chat: ChatStore;
  readonly chatLimits: ChatLimits;
  readonly results: ResultStore;
}

/** Removes the record and its file, stops its round and timers, sends `closed`, ends its streams, and removes its chat. */
export function closeArena(parts: ArenaParts, record: ArenaRecord): void {
  // First: when the file cannot be removed, nothing else has changed and the caller gets the error.
  parts.store.remove(record);
  const arenaId = record.arena.id;
  parts.runner.stop(arenaId);
  parts.autoSteps.cancel(arenaId);
  parts.hub.closeArena(arenaId);
  parts.chatLimits.removeArena(arenaId);
  // Last: when the chat file cannot be removed, the arena is already gone, and the next start removes the file (ChatStore.keepOnly).
  parts.chat.removeArena(arenaId);
}

function isExpired(record: ArenaRecord, now: number, ttlMs: number): boolean {
  return !isPublicKind(record.arena.settings.kind) && record.arena.phase.kind !== "running" && now - record.lastActivityAt > ttlMs;
}

/** Runs one sweep now and then every 10 minutes. Returns a function that stops it. */
export function startExpirySweep(parts: ArenaParts, scheduler: Scheduler, now: Clock, ttlMs: number): () => void {
  const sweep = () => {
    for (const record of parts.store.all()) {
      if (!isExpired(record, now(), ttlMs)) continue;
      try {
        closeArena(parts, record);
      } catch (error) {
        // The arena stays as it was, and the next sweep tries again.
        console.error(`Arena ${record.arena.id} expired but could not be removed:`, error);
      }
    }
    parts.chat.pruneAll();
    parts.results.prune();
  };
  sweep();
  return scheduler.every(sweep, EXPIRY_SWEEP_MS);
}
