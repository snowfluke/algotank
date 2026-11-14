// A one-line save state next to whatever is saved automatically (the player's
// tank setup). "notSaved" carries a reason sentence that says what to do.

import { CircleAlert, CircleCheck } from "lucide-react";
import { useMessages } from "../i18n/I18nProvider.tsx";

export type SaveState =
  | { readonly kind: "saving" }
  | { readonly kind: "saved" }
  | { readonly kind: "notSaved"; readonly reason: string };

export function SaveIndicator({ state }: { state: SaveState }) {
  const m = useMessages();
  return (
    <p role="status" className="flex min-w-0 items-start gap-1.5 text-caption font-semibold">
      {state.kind === "saving" ? (
        <>
          <span aria-hidden="true" className="mt-1 size-3 shrink-0 animate-pulse-soft rounded-full bg-water" />
          <span className="text-muted">{m.common.saving}</span>
        </>
      ) : state.kind === "saved" ? (
        <>
          <CircleCheck aria-hidden size={16} strokeWidth={2.5} className="mt-0.5 shrink-0 text-ok" />
          <span className="text-ok">{m.common.saved}</span>
        </>
      ) : (
        <>
          <CircleAlert aria-hidden size={16} strokeWidth={2.5} className="mt-0.5 shrink-0 text-hit" />
          <span className="min-w-0 text-hit [overflow-wrap:anywhere]">{`${m.common.notSaved}. ${state.reason}`}</span>
        </>
      )}
    </p>
  );
}
