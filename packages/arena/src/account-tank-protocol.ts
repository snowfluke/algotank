// The messages between the browser and the server for "My tank": the name and the look
// a signed-in player keeps in their account. The browser keeps the same record on the
// device, and the newer copy wins a merge, as for the play styles (strategies-protocol.ts).
//
// GET /api/account/tank  (account) -> AccountTankResponse
// PUT /api/account/tank  (account) AccountTank -> 204;
//       400 name_invalid (parsePlayerName), 400 name_blocked with a `suggestion` (a name
//       from the game), 400 look_invalid (parseTankLook), 400 tank_time_invalid;
//       409 tank_stale (the stored copy is newer than the one sent)
//
// "Account" is the session cookie (auth-protocol.ts): 401 not_signed_in without one, and
// 403 bad_origin for a change that does not come from this site.

import type { TankLook } from "./types.ts";

export interface AccountTank {
  /** The result of parsePlayerName, and free of blocked words. */
  readonly name: string;
  readonly look: TankLook;
  /** Milliseconds since 1970, set by the device that made the change. The newer copy wins a merge. */
  readonly updatedAt: number;
}

/** `tank` is null until the account saved one. */
export interface AccountTankResponse {
  readonly tank: AccountTank | null;
}

export type AccountTankErrorCode = "name_invalid" | "name_blocked" | "look_invalid" | "tank_time_invalid" | "tank_stale";

/** The body of a refused PUT. */
export interface AccountTankErrorResponse {
  readonly error: string;
  readonly code: AccountTankErrorCode;
  /** With name_blocked: a name from the game to offer instead. */
  readonly suggestion?: string;
}
