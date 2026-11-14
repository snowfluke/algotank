// What the save line says, from the session state. One pure function, so the
// panel, the kit page and the tests agree on every case.

import type { ErrorText } from "../api/messages.ts";
import type { SaveFailureReason } from "./strategySession.ts";
import type { StrategyHandle } from "./useStrategySession.ts";
import type { PrepText } from "./messages.ts";

export type SaveProblem = "invalid" | SaveFailureReason;

export type SaveView =
  | { readonly kind: "saving" }
  | { readonly kind: "saved" }
  | { readonly kind: "notSaved"; readonly problem: SaveProblem; readonly reason: string; readonly canRetry: boolean };

/** `errors` turns a stored failure into a sentence in the language shown now. */
export function saveView(handle: Pick<StrategyHandle, "save" | "dirty" | "pending" | "valid">, text: PrepText, errors: ErrorText): SaveView {
  const { save } = handle;
  if (save.kind === "saving" || handle.pending) return { kind: "saving" };
  if (save.kind === "failed") {
    const reason =
      save.reason === "roundRunning" ? text.save.roundRunning : save.reason === "offline" ? text.save.offline : save.describe(errors).sentence;
    // A refused token cannot be fixed by sending again; the page asks the player to join again.
    return { kind: "notSaved", problem: save.reason, reason, canRetry: save.reason !== "refused" };
  }
  if (handle.dirty && !handle.valid) return { kind: "notSaved", problem: "invalid", reason: text.save.invalid, canRetry: false };
  // A valid change with no timer and no request waits for the session to schedule it, which happens in the same tick.
  return handle.dirty ? { kind: "saving" } : { kind: "saved" };
}
