// The round's arena condition (its round rules) beside the day clock. The league draws a new one
// at every new round and every few minutes (server league-day.ts). A tap opens a short note on what it changes.
// A native popover: it sits in the top layer, so opening it moves nothing on the page, and the
// browser closes it on Escape and on a tap outside. Owner, 2026-11-16: "beside the timer ... with
// click to show what that means", after a label over the board's corner covered tanks.

import { Info } from "lucide-react";
import type { RuleSetId } from "@game/engine";
import { useId } from "react";
import { useMessages } from "../i18n/I18nProvider.tsx";

/** `short`: the phone's line beside the time left ("Kondisi: …"); the note names it in full either way. */
export function ArenaCondition({ ruleSetId, short }: { readonly ruleSetId: RuleSetId; readonly short: boolean }) {
  const m = useMessages();
  const t = m.monthly;
  const rules = m.vocabulary.roundRules[ruleSetId];
  const id = `arena-condition-${useId().replace(/:/g, "")}`;
  return (
    <>
      {/* -my-2 keeps the 40 px touch target from adding height under the clock. */}
      <button
        type="button"
        popoverTarget={id}
        data-arena-condition={ruleSetId}
        className="press -my-2 inline-flex min-h-10 min-w-0 max-w-full items-center gap-1.5 rounded-[var(--radius-control)] font-display font-semibold text-water"
      >
        <span className="min-w-0 truncate">{short ? t.conditionShort(rules.name) : t.condition(rules.name)}</span>
        <Info aria-hidden size={18} strokeWidth={2.5} className="shrink-0" />
      </button>
      <div
        id={id}
        popover="auto"
        data-arena-condition-note=""
        className="m-auto w-[min(24rem,calc(100%-2rem))] rounded-[var(--radius-card)] border-0 bg-panel p-6 text-ink shadow-[var(--shadow-raised)] backdrop:bg-ink/30"
      >
        <div className="flex flex-col gap-3">
          <h2 className="text-title [overflow-wrap:anywhere]">{t.condition(rules.name)}</h2>
          <p className="[overflow-wrap:anywhere]">{rules.summary}</p>
          <p className="text-muted [overflow-wrap:anywhere]">{t.conditionChanges}</p>
          <button type="button" popoverTarget={id} popoverTargetAction="hide" className="press min-h-11 min-w-24 self-end rounded-[var(--radius-control)] px-4 font-display font-semibold text-water">
            {m.common.close}
          </button>
        </div>
      </div>
    </>
  );
}
