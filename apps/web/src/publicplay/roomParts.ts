// What a public arena adds to the room (player/PlayerPage.tsx draws it). Pure functions
// of the room view, so each arena's case is listed here and tested.
//
// Every public arena shows the Ready bar in the lobby and on the result (publicplay/ReadyBar.tsx),
// and the "Other arenas" link in the status line on the result (publicplay/OtherArenasLink.tsx).
//
// | Arena      | Lobby                         | End of the game (result notes)                          |
// |------------|-------------------------------|---------------------------------------------------------|
// | practice   | -                             | none                                                    |
// | tournament | champions link                | who goes on the list of winners, or that a bot won      |

import { isPublicKind, type PublicArena, type PublicKind } from "@game/arena";
import type { JoinedView } from "../player/playerView.ts";
import type { PublicPlayText } from "./messages.ts";

/** The tournament records champions, so its room links to /champions. */
export function linksToChampions(arena: PublicArena): boolean {
  return arena.settings.kind === "tournament";
}

/**
 * The result of a public game links to the chooser of the three arenas. It is the only way there from a room,
 * because a first-timer is seated in the practice arena without the chooser. Not in a tournament break: the
 * tournament goes on. Returns the arena's kind, which the link preselects on the chooser, or null for no link.
 */
export function otherArenasFrom(arena: PublicArena): PublicKind | null {
  const kind = arena.settings.kind;
  return isPublicKind(kind) && arena.phase.kind === "finished" ? kind : null;
}

/** The players' rows show who tapped "I'm ready": in a public lobby, and in the lobby and break of an owner's arena (spec 75). */
export function showsReadyTags(arena: PublicArena): boolean {
  if (isPublicKind(arena.settings.kind)) return arena.phase.kind === "lobby";
  return arena.phase.kind === "lobby" || arena.phase.kind === "break";
}

/**
 * Whether the status line shows its sentence. A public break or result shows only its clock
 * there ("Next round", "Next game") and keeps the sentence for a screen reader: the result pane
 * under it shows the outcome, and the 20 s phase has no time to read it twice
 * (73-after-first-timer-test.md, row 7).
 */
export function statusSentenceShown(view: JoinedView): boolean {
  return !(isPublicKind(view.arena.settings.kind) && (view.kind === "break" || view.kind === "out" || view.kind === "finished"));
}

/** Sentences under the outcome at the end of a tournament. */
export function publicResultNotes(view: JoinedView, t: PublicPlayText): readonly string[] {
  const { arena, me } = view;
  const phase = arena.phase;
  if (phase.kind !== "finished") return [];
  switch (arena.settings.kind) {
    case "tournament": {
      const winner = arena.players.find((p) => p.id === phase.winnerId);
      if (winner === undefined) return [];
      if (winner.isBot) return [t.tournament.botWon];
      return [winner.id === me.id ? t.tournament.youOnList : t.tournament.onList(winner.name)];
    }
    default:
      return [];
  }
}
