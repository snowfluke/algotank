// "Play" on /play: asks the server for a room of the chosen public arena, joins it with
// the tank from "My tank" and its name (an empty name lets the game give one), and opens
// the room, where a toast says the tank's name. A visitor who already sits in that room
// keeps the seat; when the server has lost it, the room joins again by itself
// (publicplay/rejoin.ts), so no second form shows. The monthly arena is not joined here: it has
// its own page (/monthly).
//
// Problems: a name problem goes under the name field (the name draft shows it); the full
// tournament offers the practice arena; anything else is one sentence under the button.

import { useState } from "react";
import type { PublicKind } from "@game/arena";
import { joinArena, publicSeat } from "../api/client.ts";
import { describeError } from "../api/errorSentences.ts";
import { navigate } from "../app/navigation.ts";
import { paths } from "../app/route.ts";
import { useMessages } from "../i18n/I18nProvider.tsx";
import { joinRequest, NAME_CODES } from "../mytank/joinRequest.ts";
import { myTankStore } from "../mytank/useMyTank.ts";
import type { NameDraft } from "../mytank/useNameDraft.ts";
import { browserStore, readPlayerSession, saveNewSeat } from "../session/storage.ts";
import { useToast } from "../ui/Toast.tsx";

export type JoinProblem =
  | { readonly kind: "sentence"; readonly sentence: string }
  /** The tournament's one room is full: the page offers the practice arena. */
  | { readonly kind: "tournamentFull" };

export interface PublicJoin {
  readonly busy: boolean;
  readonly problem: JoinProblem | null;
  play(kind: PublicKind, name: NameDraft): Promise<void>;
  clearProblem(): void;
}

export function usePublicJoin(): PublicJoin {
  const m = useMessages();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<JoinProblem | null>(null);

  async function play(kind: PublicKind, name: NameDraft): Promise<void> {
    if (!name.commit()) return;
    setBusy(true);
    setProblem(null);
    const seat = await publicSeat(kind);
    if (!seat.ok) {
      setBusy(false);
      setProblem({ kind: "sentence", sentence: describeError(seat, "seat", m.errors).sentence });
      return;
    }
    const arenaId = seat.data.arenaId.toUpperCase();
    if (readPlayerSession(browserStore(), arenaId) !== null) {
      navigate(paths.player(arenaId));
      return;
    }
    const joined = await joinArena(arenaId, joinRequest(name.field.value, myTankStore.getSnapshot().tank.look));
    setBusy(false);
    if (!joined.ok) {
      const sentence = describeError(joined, "join", m.errors).sentence;
      const suggestion = joined.error.suggestion;
      if (joined.code === "name_blocked" && suggestion !== undefined) name.replace(suggestion, sentence);
      else if (joined.code !== null && NAME_CODES.has(joined.code)) name.replace(name.field.value, sentence);
      else if (joined.code === "arena_full" && kind === "tournament") setProblem({ kind: "tournamentFull" });
      else setProblem({ kind: "sentence", sentence });
      return;
    }
    saveNewSeat(browserStore(), arenaId, { playerId: joined.data.playerId, playerToken: joined.data.playerToken });
    myTankStore.setName(joined.data.name);
    toast.show({ message: m.room.youAre(joined.data.name) });
    navigate(paths.player(arenaId));
  }

  return { busy, problem, play, clearProblem: () => setProblem(null) };
}
