// "Remove from arena" for the owner of a private or presenter arena, in the lobby and in a break
// (spec 75, section 4). Every removal first asks in a dialog (RemovalDialog in PlayerList.tsx):
//
// | Arena                 | Question                        | Answer                     | What happens                         |
// |-----------------------|---------------------------------|----------------------------|--------------------------------------|
// | signed-in only        | "May this player join again?"   | Yes                        | removal with Undo (below)            |
// | signed-in only        | "May this player join again?"   | No                         | removal and ban at once, no Undo;    |
// |                       |                                 |                            | "Allow again" in the settings lifts it|
// | anyone may join       | says nothing can keep them out  | Remove                     | removal with Undo (below)            |
// | any                   |                                 | Cancel, Escape             | nothing                              |
//
// Removal with Undo: the server cannot undo a removal (the removed player's token stops working
// and they would have to join again), so the page hides the row at once, shows a toast with Undo,
// and sends the DELETE only when the toast closes without Undo: its time runs out, it is dismissed,
// or another toast replaces it. Named limit: when the tab closes during those seconds, the request
// is not sent and the player stays.

import { useState } from "react";
import { isPublicKind, joinNeedsAccount, type PublicArena, type PublicPlayer } from "@game/arena";
import { removePlayer } from "../api/client.ts";
import { describeError } from "../api/errorSentences.ts";
import { useMessages } from "../i18n/I18nProvider.tsx";
import { useToast } from "../ui/Toast.tsx";

export interface PlayerRemoval {
  /** Ids hidden while their removal waits or runs. */
  readonly hidden: ReadonlySet<string>;
  /** The last removal the server refused, as a sentence, or null. */
  readonly problem: string | null;
  /** The player the dialog asks about, or null when it is closed. */
  readonly asking: PublicPlayer | null;
  /** True when the dialog offers "No, keep them out". */
  readonly canBan: boolean;
  /** Opens the dialog. */
  remove(player: PublicPlayer): void;
  cancel(): void;
  /** The dialog's answer: `ban` keeps the account out. */
  confirm(ban: boolean): void;
}

/** The owner may remove people (not bots, not themselves) in the lobby and the break of a private or presenter arena. */
export function canRemovePlayers(arena: PublicArena, isOwner: boolean): boolean {
  return isOwner && !isPublicKind(arena.settings.kind) && (arena.phase.kind === "lobby" || arena.phase.kind === "break");
}

/** `onBanned` runs after a ban the server accepted (the settings sheet's list reads again). */
export function usePlayerRemoval(arena: PublicArena, onBanned: () => void = () => {}): PlayerRemoval {
  const m = useMessages();
  const toast = useToast();
  const arenaId = arena.id;
  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set());
  const [problem, setProblem] = useState<string | null>(null);
  const [asking, setAsking] = useState<PublicPlayer | null>(null);
  const show = (id: string) =>
    setHidden((old) => {
      const next = new Set(old);
      next.delete(id);
      return next;
    });
  const hide = (id: string) => setHidden((old) => new Set(old).add(id));
  const failed = (id: string, result: Parameters<typeof describeError>[0]) => {
    show(id);
    setProblem(describeError(result, "remove", m.errors).sentence);
  };

  function withUndo(player: PublicPlayer): void {
    hide(player.id);
    toast.show({
      message: m.room.players.removed(player.name),
      onUndo: () => show(player.id),
      onDone: () => {
        void removePlayer(arenaId, player.id).then((result) => {
          if (!result.ok) failed(player.id, result);
        });
      },
    });
  }

  function withBan(player: PublicPlayer): void {
    hide(player.id);
    void removePlayer(arenaId, player.id, true).then((result) => {
      if (!result.ok) {
        failed(player.id, result);
        return;
      }
      toast.show({ message: m.room.players.keptOut(player.name) });
      onBanned();
    });
  }

  return {
    hidden,
    problem,
    asking,
    canBan: joinNeedsAccount(arena.settings.joinPolicy),
    remove(player) {
      setProblem(null);
      setAsking(player);
    },
    cancel() {
      setAsking(null);
    },
    confirm(ban) {
      const player = asking;
      setAsking(null);
      if (player === null) return;
      if (ban) withBan(player);
      else withUndo(player);
    },
  };
}
