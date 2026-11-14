// What a player can change about their own seat: the tank's look (lobby, break,
// finished; the "My tank" editor without the name, opened from the Players pane or the
// settings) and leaving (lobby only, the one phase the server allows it).

import { useEffect, useState } from "react";
import type { PublicArena, PublicPlayer } from "@game/arena";
import { leaveArena, setMyLook } from "../api/client.ts";
import { describeError, type ErrorView } from "../api/errorSentences.ts";
import { useMessages } from "../i18n/I18nProvider.tsx";
import { MyTankSheet } from "../mytank/MyTankSheet.tsx";
import { myTankStore } from "../mytank/useMyTank.ts";
import { sameLook, type TankLook } from "../tank/look.ts";
import { Button } from "../ui/Button.tsx";

/** The server accepts a new look outside a round only. */
export function canChangeLook(arena: PublicArena): boolean {
  return arena.phase.kind !== "running";
}

export interface LookSheetProps {
  readonly arena: PublicArena;
  readonly me: PublicPlayer;
  readonly playerToken: string;
  onBack(): void;
}

export function LookSheet({ arena, me, playerToken, onBack }: LookSheetProps) {
  const m = useMessages();
  const [error, setError] = useState<ErrorView | null>(null);
  // The new look shows at once; the stream then confirms it, or a failure puts the old one back.
  const [pending, setPending] = useState<TankLook | null>(null);
  useEffect(() => {
    if (pending !== null && sameLook(pending, me.look)) setPending(null);
  }, [pending, me.look]);

  async function changeLook(look: TankLook): Promise<void> {
    setError(null);
    setPending(look);
    // "My tank" follows, so the next arena starts with this look too.
    myTankStore.setLook(look);
    const result = await setMyLook(arena.id, playerToken, { look });
    if (result.ok) return;
    setPending(null);
    setError(describeError(result, "look", m.errors));
  }

  return (
    <MyTankSheet
      look={pending ?? me.look}
      onLook={(look) => void changeLook(look)}
      tankName={me.name}
      name={null}
      onClose={onBack}
      notice={error?.sentence ?? null}
    />
  );
}

export interface LeaveButtonProps {
  readonly arena: PublicArena;
  readonly playerToken: string;
  /** Runs after the server accepted the leave, so the page forgets the slot. */
  onLeft(): void;
}

export function LeaveButton({ arena, playerToken, onLeft }: LeaveButtonProps) {
  const m = useMessages();
  const [error, setError] = useState<ErrorView | null>(null);
  const [leaving, setLeaving] = useState(false);

  async function leave(): Promise<void> {
    setLeaving(true);
    setError(null);
    const result = await leaveArena(arena.id, playerToken);
    setLeaving(false);
    // A refused token means the seat is already gone, which is what the player wanted.
    if (result.ok || result.status === 403) onLeft();
    else setError(describeError(result, "leave", m.errors));
  }

  if (arena.phase.kind !== "lobby") return null;
  return (
    <>
      <Button variant="quiet" loading={leaving} onClick={() => void leave()}>
        {m.room.leave}
      </Button>
      {error === null ? null : (
        <p role="alert" className="basis-full font-semibold text-hit [overflow-wrap:anywhere]">
          {error.sentence}
        </p>
      )}
    </>
  );
}
