// The way back to a room from Home (owner, 2026-11-19: "When i joined some arena, then i pressed home, the home
// should display a quick button to get back to see the arena"). The room records itself when it opens
// (session/storage.ts saveLastRoom); Home asks the server whether this browser's tank still sits there.

import { useEffect, useState } from "react";
import type { ArenaId, ArenaSettings, PlayerId, PublicArena } from "@game/arena";
import { getArena } from "../api/client.ts";
import { browserStore, clearLastRoom, readLastRoom, readPlayerSession } from "../session/storage.ts";

export interface ReturnRoom {
  readonly id: ArenaId;
  readonly settings: Pick<ArenaSettings, "kind" | "name">;
}

/** The room to offer, or null when this browser's tank no longer sits in it (it left, or was removed). */
export function returnRoomOf(arena: PublicArena, playerId: PlayerId): ReturnRoom | null {
  return arena.players.some((player) => player.id === playerId) ? { id: arena.id, settings: arena.settings } : null;
}

/** The last room with this browser's tank in it, once the server has answered; null until then and when there is none. */
export function useReturnRoom(): ReturnRoom | null {
  const [room, setRoom] = useState<ReturnRoom | null>(null);
  useEffect(() => {
    const store = browserStore();
    const id = readLastRoom(store);
    const session = id === null ? null : readPlayerSession(store, id);
    if (id === null || session === null) return;
    let live = true;
    void getArena(id).then((result) => {
      if (!live) return;
      if (result.ok) setRoom(returnRoomOf(result.data, session.playerId));
      // A room the server no longer has is gone for good; another failure (offline) only hides the button this time.
      else if (result.status === 404) clearLastRoom(store);
    });
    return () => {
      live = false;
    };
  }, []);
  return room;
}
