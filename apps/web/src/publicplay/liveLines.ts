// The live line on each tile of the chooser, from GET /api/public. Pure, so every case is tested.
//
// | Arena      | Answer                                    | Line                                              |
// |------------|-------------------------------------------|---------------------------------------------------|
// | any        | not loaded yet / failed before any answer | "checking" / "cannot check, you can still play"   |
// | practice   | humans                                    | how many players are here, or that bots join you  |
// | tournament | lobby with a countdown                    | "starts in 0:42" (the page's own clock)           |
// | tournament | lobby without a countdown                 | starts soon after the first player joins          |
// | tournament | running / break / finished                | the round that runs or comes next, or that it ended |
// | monthly    | seated tanks of every league              | how many tanks play, or that none does yet        |

import type { PublicStatusResponse } from "@game/arena";
import { formatClock } from "../live/clock.ts";
import type { ChooserKind } from "./chooserKinds.ts";
import type { PublicPlayText } from "./messages.ts";

/** GET /api/public as the chooser holds it. A failed poll keeps the last good answer. */
export type PublicStatusLoad =
  | { readonly kind: "loading" }
  | { readonly kind: "failed" }
  /** `startsAt` anchors the tournament's countdown to Date.now() time when the answer arrived. */
  | { readonly kind: "ready"; readonly status: PublicStatusResponse; readonly startsAt: number | null };

export interface LiveContext {
  /** Whole seconds until the tournament's next round, from the page's clock, or null. */
  readonly tournamentSeconds: number | null;
}

function tournamentLine(status: PublicStatusResponse["tournament"], seconds: number | null, t: PublicPlayText["live"]): string {
  switch (status.phase) {
    case "lobby":
      return status.startsInMs === null ? t.tournamentWaits : t.tournamentStartsIn(formatClock((seconds ?? 0) * 1000));
    case "running":
      return t.tournamentRunning(status.round ?? 1);
    case "break":
      return t.tournamentBreak(status.round ?? 2);
    case "finished":
      return t.tournamentEnded;
  }
}

export function liveLines(load: PublicStatusLoad, context: LiveContext, t: PublicPlayText["live"]): Record<ChooserKind, string> {
  if (load.kind !== "ready") {
    const line = load.kind === "loading" ? t.loading : t.failed;
    return { practice: line, tournament: line, monthly: line };
  }
  const { status } = load;
  return {
    practice: t.practice(status.practice.humans),
    tournament: tournamentLine(status.tournament, context.tournamentSeconds, t),
    monthly: t.monthly(status.monthly.tanks),
  };
}
