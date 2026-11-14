// The messages between the browser and the server for the play styles a player saves
// in the tank workshop ("my play styles"), kept per account. The browser keeps the same
// records on the device; apps/web/src/workshop/library.ts merges the two.
//
// GET    /api/account/strategies      (account) -> AccountStrategiesResponse
// PUT    /api/account/strategies/:id  (account) PutAccountStrategyRequest -> 204;
//          400 with details when the strategy has problems; 400 strategy_name_invalid,
//          strategy_id_invalid or strategy_time_invalid; 409 strategy_limit (a new id when
//          the account holds ACCOUNT_STRATEGY_LIMITS.perAccount); 409 strategy_stale (the
//          stored copy is newer than the one sent); 413 for a body over 64 KB
// DELETE /api/account/strategies/:id  (account) -> 204, also when it does not exist
//
// "Account" is the session cookie (auth-protocol.ts): 401 not_signed_in without one, and
// 403 bad_origin for a change that does not come from this site.

import type { StrategyInput } from "@game/engine";

export const ACCOUNT_STRATEGY_LIMITS = {
  /** Play styles one player keeps, on the device and in the account. */
  perAccount: 20,
  nameMax: 24,
} as const;

/** The client makes the id (a random id), so the same play style has one id on every side. It also names nothing on disk. */
export const ACCOUNT_STRATEGY_ID = /^[A-Za-z0-9_-]{8,40}$/;

export interface AccountStrategy {
  readonly id: string;
  /** 1 to 24 characters, see cleanStrategyName. */
  readonly name: string;
  readonly strategy: StrategyInput;
  /** Milliseconds since 1970, set by the device that made the change. The newer copy wins a merge. */
  readonly updatedAt: number;
}

export interface AccountStrategiesResponse {
  readonly strategies: readonly AccountStrategy[];
}

export type PutAccountStrategyRequest = Omit<AccountStrategy, "id">;

export type AccountStrategyErrorCode = "strategy_name_invalid" | "strategy_id_invalid" | "strategy_time_invalid" | "strategy_limit" | "strategy_stale";

// Control, format (invisible) and line or paragraph separator characters.
const FORBIDDEN_NAME_CHARACTERS = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u;

/**
 * The trimmed NFKC form of a play style's name, or null when it breaks the name rule
 * (1 to 24 characters, no control or invisible characters). The browser and the server
 * both call it, so the rule lives here once.
 * It is a different rule from a player's name (parsePlayerName in types.ts: 3 to 16
 * letters, digits and spaces), because only the player sees a play style's name, and
 * play styles saved under this rule must keep loading.
 */
export function cleanStrategyName(raw: string): string | null {
  const name = raw.normalize("NFKC").trim();
  if (FORBIDDEN_NAME_CHARACTERS.test(name)) return null;
  const length = [...name].length;
  return length < 1 || length > ACCOUNT_STRATEGY_LIMITS.nameMax ? null : name;
}
