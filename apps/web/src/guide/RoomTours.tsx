// The tours of the arena room for a first-timer (docs/specs/revamp/65-guidance.md,
// section 3): the lobby tour, the first-round tour and the tour after the first game.
// The player page renders this once; each tour shows only in its own phase.
//
// | Tour   | Phase on the screen        | Starts when                                   | Clock                                   |
// |--------|----------------------------|-----------------------------------------------|-----------------------------------------|
// | lobby  | lobby                      | a first-timer (hasFinishedGame() is false)    | public: the lobby countdown; private: none |
// | round  | live (the tank plays)      | a first-timer                                 | the round's time left                   |
// | result | finished, not public       | the result is this device's first (firstResult) | none (the host starts the next game)  |
//
// A public result has a clock of 12 to 30 s and already states the place and the reason,
// so it has no tour; the "do better" sentence is the lobby tour's step 3 in the next lobby.

import { isPublicKind } from "@game/arena";
import { timeLeftMs } from "../live/clock.ts";
import type { JoinedView } from "../player/playerView.ts";
import { hasFinishedGame } from "../publicplay/firstGame.ts";
import { frameKey } from "../room/roomFrame.ts";
import { snapshotFor, type ArenaStreamState } from "../stream/streamState.ts";
import { showAround } from "./guideStore.ts";
import { Tour } from "./Tour.tsx";
import type { TourId } from "./tours.ts";

export interface RoomToursProps {
  readonly view: JoinedView;
  readonly stream: ArenaStreamState;
  readonly isOwner: boolean;
  /** Whole seconds until the server's next step (a public lobby's countdown), or null. */
  readonly autoSeconds: number | null;
  /** This finished game is the first one this device played to the end. */
  readonly firstResult: boolean;
}

/** The tour that "Show me around" replays in this view, or null. */
export function roomTourOf(view: JoinedView): TourId | null {
  if (view.kind === "lobby") return "lobby";
  // Only a player whose tank plays this round: the round tour points at the own status row.
  if (view.kind === "live") return "round";
  if (view.kind === "finished" && !isPublicKind(view.arena.settings.kind)) return "result";
  return null;
}

export function replayRoomTour(view: JoinedView): (() => void) | null {
  const tour = roomTourOf(view);
  return tour === null ? null : () => showAround(tour);
}

export function RoomTours({ view, stream, isOwner, autoSeconds, firstResult }: RoomToursProps) {
  const { arena } = view;
  const isPublic = isPublicKind(arena.settings.kind);
  const occurrence = frameKey(view);
  // Read on every render, but the driver uses it only to start a tour (tourDriver.ts).
  const firstTimer = !hasFinishedGame();
  const phase = arena.phase;
  const snapshot = phase.kind === "running" ? snapshotFor(stream, phase.round) : null;
  const roundSeconds = snapshot === null ? null : Math.floor(timeLeftMs(snapshot, arena.settings.tickMs) / 1000);
  return (
    <>
      <Tour
        id="lobby"
        variant={{ lobbyStart: isPublic ? "public" : isOwner ? "owner" : "guest" }}
        phaseOn={view.kind === "lobby"}
        eligible={firstTimer}
        occurrence={occurrence}
        clock={isPublic ? { kind: "timed", secondsLeft: autoSeconds } : { kind: "untimed" }}
      />
      <Tour id="round" phaseOn={view.kind === "live"} eligible={firstTimer} occurrence={occurrence} clock={{ kind: "timed", secondsLeft: roundSeconds }} />
      <Tour id="result" phaseOn={view.kind === "finished" && !isPublic} eligible={firstResult} occurrence={occurrence} clock={{ kind: "untimed" }} />
    </>
  );
}
