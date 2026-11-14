// The name an arena shows in headers and headings. A public arena has no name of its
// own (the server sends ""), so it shows the translated name of its kind.

import { isPublicKind, type ArenaSettings } from "@game/arena";
import type { PublicPlayText } from "./messages.ts";

export function arenaDisplayName(settings: Pick<ArenaSettings, "kind" | "name">, names: PublicPlayText["names"]): string {
  return isPublicKind(settings.kind) ? names[settings.kind] : settings.name;
}
