// The body of a join from "My tank", shared by the room's join step and "Play now":
// an empty name is left out, so the server gives the tank a two-word name.

import { parsePlayerName, type JoinRequest } from "@game/arena";
import type { TankLook } from "../tank/look.ts";

/** Codes whose sentence belongs under the name field. */
export const NAME_CODES: ReadonlySet<string> = new Set(["name_taken", "name_invalid", "name_blocked"]);

export function joinRequest(typedName: string, look: TankLook): JoinRequest {
  const name = parsePlayerName(typedName);
  return name === null ? { look } : { name, look };
}
