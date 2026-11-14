// "I'm ready" in the bottom bar of a public lobby and of a public result
// (docs/specs/revamp/67-public-arenas.md, "Ready"; 73-after-first-timer-test.md). The server
// keeps who is ready (PublicPlayer.ready) and shortens the lobby's countdown when every
// person in the room is ready. On a result, ready carries into the next lobby, so the next
// game starts right after the result when everyone is ready; the result itself stays as
// long as it is. There is no way back: a player who changes their mind waits for the
// normal countdown. The button stays busy until the stream reports the change, so it
// cannot be pressed twice.
//
// In a private or presenter arena (spec 75, section 3) the same bar shows in the lobby and
// the break for a player who plays the next round. There ready only tells the host, who
// always decides when the round starts, so it says that and can be taken back.

import { CircleCheck } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { isPublicKind, readyIsOpen, type PublicArena, type PublicPlayer } from "@game/arena";
import { setReady } from "../api/client.ts";
import { describeError } from "../api/errorSentences.ts";
import { useMessages } from "../i18n/I18nProvider.tsx";
import { BAR } from "../room/OwnerControls.tsx";
import { Button } from "../ui/Button.tsx";

/**
 * The bar shows where the server accepts "I'm ready" (readyIsOpen): the lobby and the result of a
 * public arena, and the lobby and break of an owner's arena for a tank that plays the next round.
 */
export function showsReadyBar(arena: PublicArena, me: PublicPlayer): boolean {
  return readyIsOpen(arena) && (isPublicKind(arena.settings.kind) || me.status.kind === "playing");
}

export function ReadyBar({ arena, me, playerToken }: { readonly arena: PublicArena; readonly me: PublicPlayer; readonly playerToken: string }) {
  const m = useMessages();
  const t = m.publicplay.ready;
  const own = m.room.ready;
  const informs = !isPublicKind(arena.settings.kind);
  const onResult = arena.phase.kind === "finished";
  const detailId = useId();
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  // The answer arrives before the stream says so; the new player list ends the wait.
  useEffect(() => setBusy(false), [me.ready]);

  async function ready(on = true): Promise<void> {
    setBusy(true);
    setProblem(null);
    const result = await setReady(arena.id, playerToken, on);
    if (result.ok) return;
    setBusy(false);
    setProblem(describeError(result, "ready", m.errors).sentence);
  }

  const problemLine =
    problem === null ? null : (
      <p role="alert" className="min-w-0 basis-full font-semibold text-hit [overflow-wrap:anywhere]">
        {problem}
      </p>
    );

  if (me.ready) {
    return (
      <div data-ready-bar="done" className={BAR}>
        <p role="status" className="flex min-w-0 flex-1 basis-48 items-center gap-2 font-semibold text-ok [overflow-wrap:anywhere]">
          <CircleCheck aria-hidden size={24} className="shrink-0" />
          <span className="min-w-0">{informs ? own.done : onResult ? t.doneOnResult : t.done}</span>
        </p>
        {informs ? (
          <Button variant="secondary" loading={busy} data-ready-undo="" className="shrink-0" onClick={() => void ready(false)}>
            {own.undo}
          </Button>
        ) : null}
        {problemLine}
      </div>
    );
  }

  return (
    <div data-ready-bar="" className={BAR}>
      <Button size={informs ? "md" : "lg"} loading={busy} {...(informs ? {} : { "aria-describedby": detailId })} className="shrink-0" onClick={() => void ready()}>
        {t.button}
      </Button>
      {/* In an owner's arena the button is enough: the done line says that the host starts the round, and the panes keep the room. */}
      {informs ? null : (
        <p id={detailId} className="min-w-0 flex-1 basis-40 text-caption text-muted [overflow-wrap:anywhere]">
          {onResult ? t.detailOnResult : t.detail}
        </p>
      )}
      {problem === null ? null : (
        <p role="alert" className="min-w-0 basis-full font-semibold text-hit [overflow-wrap:anywhere]">
          {problem}
        </p>
      )}
    </div>
  );
}
