// The owner's controls, shared by the arena room (private arena) and the presenter
// page: the start or "Play again" action for the bottom bar, the number of tanks, the bots
// switch and "Close arena" for the settings sheet. Each answers in place: a busy button while the
// request runs, a sentence when it fails.

import { useEffect, useId, useState } from "react";
import { isPublicKind, seatsOf, START_DELAY_MINUTES, tankCountRange, type PlayerId, type PublicArena } from "@game/arena";
import { cancelScheduledStart, closeArena, resetArena, scheduleStart, setBotFill, setTankCount, startRound, type ApiResult } from "../api/client.ts";
import { describeError, type ErrorAction, type ErrorView } from "../api/errorSentences.ts";
import { markSignedOut, refreshOwnArena } from "../auth/accountStore.ts";
import { ownerStep, readyCount, startPlanOf } from "../host/startControl.ts";
import { useMessages } from "../i18n/I18nProvider.tsx";
import { Button } from "../ui/Button.tsx";
import { Dialog } from "../ui/Dialog.tsx";
import { BotsSwitch } from "./BotsSwitch.tsx";
import { TankCountControl } from "./TankCountControl.tsx";

/** Runs one owner request at a time and keeps its failure as a sentence. */
function useOwnerRequest(action: ErrorAction) {
  const m = useMessages();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ErrorView | null>(null);
  async function run(call: () => Promise<ApiResult<void>>): Promise<boolean> {
    setBusy(true);
    setError(null);
    const result = await call();
    setBusy(false);
    if (result.ok) return true;
    if (result.code === "not_signed_in") markSignedOut();
    setError(describeError(result, action, m.errors));
    return false;
  }
  return { busy, error, setBusy, setError, run };
}

function ErrorLine({ error }: { readonly error: ErrorView | null }) {
  return error === null ? null : (
    <p role="alert" className="min-w-0 basis-full font-semibold text-hit [overflow-wrap:anywhere]">
      {error.sentence}
    </p>
  );
}

/** The bottom bar's row: the action, then its one-line explanation beside it, wrapping under it when the row is narrow. Public arenas' bars (publicplay/) use it too. */
export const BAR = "mx-auto flex w-full max-w-6xl min-w-0 flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2";

/**
 * The dominant action of the owner, for the bottom bar: start the game or the next
 * round now or after 1, 2, 3 or 5 minutes, or "Play again" after the final. Nothing
 * while a round runs, because the status line says so and there is nothing to press.
 * The owner always decides; "7 of 12 ready" only informs (spec 75, section 3). The
 * countdown itself is the status line's clock, which every viewer sees.
 *
 * | Plan      | Bar                                                                  |
 * |-----------|----------------------------------------------------------------------|
 * | waiting   | Start now, Start later (opens the minutes), ready count, who plays   |
 * | picking   | "Start the round in" 1, 2, 3, 5 minutes, Back                        |
 * | scheduled | Start now, Stop the countdown, ready count (the clock is in the status line) |
 * | missed    | as waiting, with the sentence that the round did not start           |
 */
export function StartControl({ arena, ownId = null }: { readonly arena: PublicArena; readonly ownId?: PlayerId | null }) {
  const m = useMessages();
  const t = m.room.owner;
  const step = ownerStep(arena);
  const plan = startPlanOf(arena);
  const detailId = useId();
  const request = useOwnerRequest(step.kind === "reset" ? "reset" : "startRound");
  const [picking, setPicking] = useState(false);
  const { setBusy, setError } = request;
  const planKind = plan?.kind ?? null;
  // A start succeeds before the stream reports it, so the button stays busy until the phase, the game or the plan changes.
  useEffect(() => {
    setBusy(false);
    setError(null);
    setPicking(false);
  }, [arena.phase.kind, arena.game, planKind, setBusy, setError]);

  if (step.kind === "running") return null;
  if (step.kind === "reset") {
    return (
      <div data-start-bar="" className={BAR}>
        <Button
          size="lg"
          loading={request.busy}
          className="shrink-0"
          onClick={() => void request.run(() => resetArena(arena.id)).then((ok) => request.setBusy(ok))}
        >
          {t.playAgain}
        </Button>
        <p className="min-w-0 flex-1 basis-40 text-caption text-muted [overflow-wrap:anywhere]">{t.playAgainDetail}</p>
        <ErrorLine error={request.error} />
      </div>
    );
  }
  if (picking) {
    return (
      <div data-start-bar="" data-start-picker="" className={BAR}>
        <fieldset className="m-0 flex min-w-0 flex-wrap items-center gap-2 border-0 p-0">
          <legend className="float-left mr-2 font-semibold">{t.startInLegend}</legend>
          {START_DELAY_MINUTES.map((minutes) => (
            <Button
              key={minutes}
              variant="secondary"
              data-start-in={minutes}
              disabled={request.busy}
              // No busy hold after the answer: the plan's change swaps the bar, and it may arrive before the answer.
              onClick={() => void request.run(() => scheduleStart(arena.id, minutes))}
            >
              {t.startIn(minutes)}
            </Button>
          ))}
          <Button variant="quiet" onClick={() => setPicking(false)}>
            {t.back}
          </Button>
        </fieldset>
        <ErrorLine error={request.error} />
      </div>
    );
  }
  const label = arena.phase.kind === "lobby" ? t.startGame : step.isFinal ? t.startFinal : t.startRound(step.round);
  const detail =
    step.blocked === null ? t.willPlay(step.tanks, step.botsAdded) : step.blocked.kind === "noPlayers" ? t.noPlayers : t.tooFew(step.blocked.tanks);
  const ready = readyCount(arena, ownId);
  const scheduled = plan?.kind === "scheduled";
  return (
    <div data-start-bar="" data-start-plan={plan?.kind ?? "none"} className={BAR}>
      <Button
        // During a countdown both buttons share one row on a phone, so the player list keeps its room.
        size={scheduled ? "md" : "lg"}
        loading={request.busy}
        disabled={step.blocked !== null}
        aria-describedby={detailId}
        className="shrink-0"
        onClick={() => void request.run(() => startRound(arena.id)).then((ok) => request.setBusy(ok))}
      >
        {scheduled ? t.startNow : label}
      </Button>
      {scheduled ? (
        <Button variant="secondary" data-start-cancel="" className="shrink-0" disabled={request.busy} onClick={() => void request.run(() => cancelScheduledStart(arena.id))}>
          {t.cancelTimer}
        </Button>
      ) : (
        <Button variant="secondary" data-start-later="" className="shrink-0" disabled={request.busy} onClick={() => setPicking(true)}>
          {t.startLater}
        </Button>
      )}
      <div id={detailId} className="flex min-w-0 flex-1 basis-48 flex-col">
        {ready.of === 0 ? null : (
          <span data-ready-count="" className="font-semibold text-ok">
            {t.readyCount(ready.ready, ready.of)}
          </span>
        )}
        {/* While a countdown runs, the status line's clock says when the round starts, so a phone keeps the room for the list. */}
        {/* The missed notice below already says why the round did not start. */}
        {(scheduled && step.blocked === null) || plan?.kind === "missed" ? null : (
          // On a phone the bar keeps to the buttons and the ready count, so the player list keeps its rows; a reason that blocks the start always shows.
          <span className={`text-caption text-muted [overflow-wrap:anywhere] ${step.blocked === null ? "hidden laptop:inline" : ""}`}>{detail}</span>
        )}
      </div>
      {plan?.kind === "missed" ? (
        <p role="alert" data-start-missed="" className="min-w-0 basis-full font-semibold text-hit [overflow-wrap:anywhere]">
          {t.missed}
        </p>
      ) : null}
      <ErrorLine error={request.error} />
    </div>
  );
}

/** The bots switch. The server accepts a change only in the lobby. */
export function BotFillControl({ arena }: { readonly arena: PublicArena }) {
  const request = useOwnerRequest("settings");
  if (arena.phase.kind !== "lobby") return null;
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <BotsSwitch
        on={arena.settings.botFill}
        tanks={seatsOf(arena.settings).botsFillTo}
        disabled={request.busy}
        onChange={(on) => void request.run(() => setBotFill(arena.id, on))}
      />
      <ErrorLine error={request.error} />
    </div>
  );
}

/** "Number of tanks". The server accepts a change only in the lobby, and never below the people already in. */
export function TankCountSetting({ arena, brief }: { readonly arena: PublicArena; readonly brief: boolean }) {
  const request = useOwnerRequest("settings");
  const { kind } = arena.settings;
  if (arena.phase.kind !== "lobby" || isPublicKind(kind)) return null;
  const people = arena.players.filter((p) => !p.isBot).length;
  return (
    <div className="flex w-full min-w-0 flex-col gap-1">
      <TankCountControl
        kind={kind}
        value={seatsOf(arena.settings).people}
        min={Math.max(tankCountRange(kind).min, people)}
        disabled={request.busy}
        onChange={(tankCount) => void request.run(() => setTankCount(arena.id, tankCount))}
        brief={brief}
      />
      <ErrorLine error={request.error} />
    </div>
  );
}

export function CloseArenaControl({ arena, name }: { readonly arena: PublicArena; readonly name: string }) {
  const m = useMessages();
  const t = m.room.owner;
  const [asking, setAsking] = useState(false);
  const request = useOwnerRequest("close");
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <Button variant="danger" className="self-start" loading={request.busy} onClick={() => setAsking(true)}>
        {t.close}
      </Button>
      <ErrorLine error={request.error} />
      <Dialog
        open={asking}
        title={t.closeTitle(name)}
        body={t.closeBody}
        confirmLabel={t.close}
        onCancel={() => setAsking(false)}
        onConfirm={() => {
          setAsking(false);
          // The stream then sends "closed", and the page shows it.
          void request.run(() => closeArena(arena.id)).then((ok) => {
            if (ok) refreshOwnArena();
          });
        }}
      />
    </div>
  );
}
