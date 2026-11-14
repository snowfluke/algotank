// The next round's rules, once, in one line that opens every round rule in a step. Shown only in an arena that changes the rules between rounds.

import { ChevronRight, Info } from "lucide-react";
import { RULE_SET_IDS } from "@game/engine";
import { useMessages } from "../i18n/I18nProvider.tsx";
import type { NextRules } from "../rules/nextRules.ts";
import { Pager } from "../ui/Pager.tsx";
import { StepSheet } from "../ui/StepSheet.tsx";

export function RoundRulesNotice({ nextRules, onOpen }: { readonly nextRules: NextRules; onOpen(): void }) {
  const m = useMessages();
  const v = m.vocabulary;
  const sentence = nextRules.kind === "known" ? m.prep.nextRules.known(v.roundRules[nextRules.ruleSetId].name) : nextRules.kind === "hidden" ? m.prep.nextRules.hidden : m.prep.roundRules.open;
  // One row: the sentence itself opens every round rule, so the notice costs one control's height.
  return (
    <button
      type="button"
      data-focus-key="round-rules"
      onClick={onOpen}
      className="press flex min-h-11 w-full min-w-0 shrink-0 items-center gap-2 rounded-[var(--radius-control)] px-1 text-left font-semibold [@media(hover:hover)]:hover:bg-water-soft"
    >
      <Info aria-hidden size={18} strokeWidth={2.5} className="shrink-0 text-water" />
      <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">{sentence}</span>
      <ChevronRight aria-hidden size={20} className="shrink-0 text-water" />
      <span className="sr-only">{m.prep.roundRules.open}</span>
    </button>
  );
}

export function RoundRulesStep({ onBack }: { onBack(): void }) {
  const m = useMessages();
  const v = m.vocabulary;
  return (
    <StepSheet title={m.prep.roundRules.title} onBack={onBack}>
      <Pager
        label={m.prep.roundRules.title}
        items={RULE_SET_IDS}
        itemKey={(id) => id}
        gap={0}
        ordered={false}
        renderItem={(id) => (
          <div className="flex min-w-0 flex-col gap-0.5 border-b-2 border-line py-2">
            <p className="font-semibold">{v.roundRules[id].name}</p>
            <p className="text-muted [overflow-wrap:anywhere]">{v.roundRules[id].summary}</p>
          </div>
        )}
      />
    </StepSheet>
  );
}
