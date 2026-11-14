// Decides what the arena room shows. One pure function from the stream, the arena
// and the stored slot to a view, so every combination of connection, kind, phase
// and player status is listed here and tested, and the page only draws.
//
// | Connection / arena          | Slot           | Phase, status                          | View          |
// |-----------------------------|----------------|----------------------------------------|---------------|
// | closed, no arena            | any            | -                                      | notFound      |
// | closed after an arena       | any            | -                                      | closed        |
// | no arena yet                | any            | -                                      | loading       |
// | arena, signed-in only (joinPolicy account or verified), account unknown | none | lobby | loading |
// | arena, signed-in only, signed out | none     | lobby                                  | signInToPlay  |
// | arena                       | none           | lobby, or any phase of a public arena  | join (full when no seat is left) |
// | arena                       | none           | private or presenter, not lobby        | cannotJoin    |
// | arena                       | not in arena   | -                                      | lostSlot      |
// | arena                       | in arena       | lobby                                  | lobby         |
// | arena                       | in arena       | running, in this round                 | live          |
// | arena                       | in arena       | running, not in it (waiting or out)    | watching      |
// | arena                       | in arena       | break, playing                         | break         |
// | arena                       | in arena       | break, eliminated                      | out           |
// | arena                       | in arena       | break, waiting                         | waitingBreak  |
// | arena                       | in arena       | finished                               | finished      |

import { isPublicKind, joinNeedsAccount, seatsOf, type PublicArena, type PublicPlayer } from "@game/arena";
import type { PlayerSession } from "../session/storage.ts";
import type { Connection } from "../stream/streamState.ts";

export type PlayerView =
  | { readonly kind: "loading" }
  | { readonly kind: "notFound" }
  | { readonly kind: "closed" }
  | { readonly kind: "join"; readonly arena: PublicArena; readonly full: boolean }
  /** No slot in a signed-in-only lobby, and nobody is signed in: only an account plays there. */
  | { readonly kind: "signInToPlay"; readonly arena: PublicArena }
  /** No slot and a private or presenter game has started: the visitor can watch or go home. */
  | { readonly kind: "cannotJoin"; readonly arena: PublicArena }
  /** A stored slot that the loaded arena does not list. A token the server refuses is cleared by useStrategy. */
  | { readonly kind: "lostSlot"; readonly arena: PublicArena }
  | { readonly kind: "lobby"; readonly arena: PublicArena; readonly me: PublicPlayer }
  | { readonly kind: "live"; readonly arena: PublicArena; readonly me: PublicPlayer }
  /** A round runs without this player: they joined during the game ("waiting") or are out. */
  | { readonly kind: "watching"; readonly arena: PublicArena; readonly me: PublicPlayer }
  | { readonly kind: "break"; readonly arena: PublicArena; readonly me: PublicPlayer }
  | { readonly kind: "out"; readonly arena: PublicArena; readonly me: PublicPlayer }
  | { readonly kind: "waitingBreak"; readonly arena: PublicArena; readonly me: PublicPlayer }
  | { readonly kind: "finished"; readonly arena: PublicArena; readonly me: PublicPlayer };

export type JoinedView = Extract<PlayerView, { readonly me: PublicPlayer }>;

/** Human players only: bots fill seats on top of the arena's limit. */
function seatsLeft(arena: PublicArena): number {
  return seatsOf(arena.settings).people - arena.players.filter((p) => !p.isBot).length;
}

/**
 * `signedIn` is whether an account is signed in on this browser, or null while that is
 * unknown. Only a signed-in-only lobby asks, because only an account may join it.
 */
export function playerView(connection: Connection, arena: PublicArena | null, session: PlayerSession | null, signedIn: boolean | null): PlayerView {
  // The stream ends with "closed" after the arena was closed, and also after a 404 on
  // reconnect. Only the first keeps an arena in the state.
  if (connection === "closed") return arena === null ? { kind: "notFound" } : { kind: "closed" };
  if (arena === null) return { kind: "loading" };

  if (session === null) {
    if (joinNeedsAccount(arena.settings.joinPolicy) && arena.phase.kind === "lobby" && signedIn !== true) {
      return signedIn === null ? { kind: "loading" } : { kind: "signInToPlay", arena };
    }
    // A signed-in account may already have a seat here from another device, and the arena does not
    // show whose seat is whose, so the join step stays open in every phase: the server hands the seat
    // back, or answers why not (wrong_phase for an account without one).
    if (joinNeedsAccount(arena.settings.joinPolicy) && signedIn === true) return { kind: "join", arena, full: false };
    if (arena.phase.kind === "lobby" || isPublicKind(arena.settings.kind)) return { kind: "join", arena, full: seatsLeft(arena) <= 0 };
    return { kind: "cannotJoin", arena };
  }

  const me = arena.players.find((p) => p.id === session.playerId);
  if (me === undefined) return { kind: "lostSlot", arena };

  const phase = arena.phase;
  switch (phase.kind) {
    case "lobby":
      return { kind: "lobby", arena, me };
    case "running":
      return phase.playerIds.includes(me.id) ? { kind: "live", arena, me } : { kind: "watching", arena, me };
    case "break":
      if (me.status.kind === "playing") return { kind: "break", arena, me };
      return me.status.kind === "waiting" ? { kind: "waitingBreak", arena, me } : { kind: "out", arena, me };
    case "finished":
      return { kind: "finished", arena, me };
  }
}
