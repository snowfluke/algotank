// What the browser remembers per arena: the player id and token for a player, whether
// that seat still waits for the play style used last (prep/lastStyle.ts), and the
// strategy draft the player has not saved. A refresh reads them back, so the person
// keeps the same slot. Each function takes the store, so tests use a plain object.

import type { ArenaId, PlayerId } from "@game/arena";
import { assignUltimate, hasStrategyBody, isUltimateId, type StrategyInput } from "@game/engine";

export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface PlayerSession {
  readonly playerId: PlayerId;
  readonly playerToken: string;
}

export const playerSessionKey = (arenaId: ArenaId): string => `arena:${arenaId}:player-session`;
const strategyDraftKey = (arenaId: ArenaId): string => `arena:${arenaId}:strategy-draft`;
const newSeatKey = (arenaId: ArenaId): string => `arena:${arenaId}:new-seat`;

/** localStorage, or null when the browser blocks it (a private window, blocked site data). */
export function browserStore(): KeyValueStore | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function read(store: KeyValueStore | null, key: string): string | null {
  if (store === null) return null;
  try {
    return store.getItem(key);
  } catch {
    return null;
  }
}

/** Returns false when the value could not be stored, so the page can tell the person. */
function write(store: KeyValueStore | null, key: string, value: string): boolean {
  if (store === null) return false;
  try {
    store.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

function remove(store: KeyValueStore | null, key: string): void {
  if (store === null) return;
  try {
    store.removeItem(key);
  } catch {
    // Nothing to undo: the value was not readable either.
  }
}

export function parsePlayerSession(raw: string | null): PlayerSession | null {
  if (raw === null) return null;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof value !== "object" || value === null) return null;
  const { playerId, playerToken } = value as Record<string, unknown>;
  if (typeof playerId !== "string" || typeof playerToken !== "string") return null;
  return { playerId, playerToken };
}

export const readPlayerSession = (store: KeyValueStore | null, arenaId: ArenaId): PlayerSession | null =>
  parsePlayerSession(read(store, playerSessionKey(arenaId)));
export const savePlayerSession = (store: KeyValueStore | null, arenaId: ArenaId, session: PlayerSession): boolean =>
  write(store, playerSessionKey(arenaId), JSON.stringify(session));
export const clearPlayerSession = (store: KeyValueStore | null, arenaId: ArenaId): void =>
  remove(store, playerSessionKey(arenaId));

/**
 * Stores a seat the browser just took (every join goes through here) and marks it new, so the
 * room gives its tank the play style used last once (prep/lastStyle.ts). The mark is kept apart
 * from the session, so a reload before the room applied it still applies it, and a seat stored
 * by an older version, which has no mark, is never changed. False when the seat could not be stored.
 */
export function saveNewSeat(store: KeyValueStore | null, arenaId: ArenaId, session: PlayerSession): boolean {
  const saved = savePlayerSession(store, arenaId, session);
  write(store, newSeatKey(arenaId), session.playerId);
  return saved;
}

/** True while the seat of `playerId` has not got the play style used last. */
export const isNewSeat = (store: KeyValueStore | null, arenaId: ArenaId, playerId: PlayerId): boolean =>
  read(store, newSeatKey(arenaId)) === playerId;
export const clearNewSeat = (store: KeyValueStore | null, arenaId: ArenaId): void => remove(store, newSeatKey(arenaId));

/** The unsaved draft, or null. The shape check is as shallow as the one on a strategy from the server: the editor reports the rest. */
export function parseStrategyDraft(raw: string | null): StrategyInput | null {
  if (raw === null) return null;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!hasStrategyBody(value)) return null;
  // Drafts kept before 85-ultimates.md still have rules the player has not sent.
  if (!("ultimate" in value)) return { ...value, ultimate: assignUltimate(value, Math.random) };
  return isUltimateId(value.ultimate) ? { ...value, ultimate: value.ultimate } : null;
}

export const readStrategyDraft = (store: KeyValueStore | null, arenaId: ArenaId): StrategyInput | null =>
  parseStrategyDraft(read(store, strategyDraftKey(arenaId)));
export const saveStrategyDraft = (store: KeyValueStore | null, arenaId: ArenaId, draft: StrategyInput): boolean =>
  write(store, strategyDraftKey(arenaId), JSON.stringify(draft));
export const clearStrategyDraft = (store: KeyValueStore | null, arenaId: ArenaId): void =>
  remove(store, strategyDraftKey(arenaId));
