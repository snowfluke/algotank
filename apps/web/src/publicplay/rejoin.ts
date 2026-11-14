// A public seat that the server no longer knows is taken again without a second form
// (docs/specs/revamp/73-after-first-timer-test.md, row 6). The server removes a person
// whose page was closed for more than 20 s when a game starts, so a page that comes back
// finds its stored token refused, or the arena without its player. In a public arena
// the page then joins again with the name and look of "My tank", once; when that join
// fails, the join form shows with the reason.
//
// | How the seat went                         | Arena            | Page                     |
// |-------------------------------------------|------------------|--------------------------|
// | the server refused the stored token       | public           | joins again, once        |
// | the arena does not list the stored player | public           | drops the seat, then the same |
// | the player tapped "Leave arena"           | any              | join form                |
// | the owner removed the player              | private          | "Join again" / join form |
// | a join again failed                       | public           | join form with the reason |

import { isPublicKind, type PublicArena } from "@game/arena";
import type { PlayerView } from "../player/playerView.ts";

/** Why the page dropped its stored seat: only a seat the server lost is taken again by itself. */
export type SeatDrop = "lost" | "left";

/** True when the page should join the public room again now, without asking. */
export function rejoinsNow(drop: SeatDrop | null, view: PlayerView): boolean {
  return drop === "lost" && view.kind === "join" && !view.full && isPublicKind(view.arena.settings.kind);
}

/**
 * True when a public arena no longer lists the stored player. `streamToken` is the token the
 * arena was seen with: right after a join the page holds the new seat a moment before the
 * stream reopens with it, and that older arena does not list the new player yet.
 */
export function seatIsGone(view: PlayerView, streamToken: string | null, sessionToken: string | null): view is { readonly kind: "lostSlot"; readonly arena: PublicArena } {
  return view.kind === "lostSlot" && isPublicKind(view.arena.settings.kind) && sessionToken !== null && streamToken === sessionToken;
}
