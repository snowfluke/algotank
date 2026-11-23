// A tank's rules to read, not to edit: one mode's rules as the workshop words them
// (vocabulary/sentence.ts), in the order the tank checks them, then its upgrades. The tank sheet
// shows it (TankSheet.tsx) for a game master's tank and for a month whose rules are open.
// A strategy with several modes shows one at a time, with its name between Previous and
// Next, and swipe and the arrow keys turn to the next mode (owner, 2026-11-23: every mode
// one under another made the sheet long).

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useId, useState } from "react";
import type { StrategyInput } from "@game/engine";
import { useFormat, useMessages } from "../i18n/I18nProvider.tsx";
import { ATTRIBUTE_IDS } from "../prep/upgrades.ts";
import { IconButton } from "../ui/IconButton.tsx";
import { clampPage, END_CLASSES } from "../ui/paging.ts";
import { usePageGestures } from "../ui/usePageGestures.ts";
import { fallbackText, modeName, ruleText } from "../vocabulary/sentence.ts";

export function RulesText({ strategy }: { readonly strategy: StrategyInput }) {
  const m = useMessages();
  const f = useFormat();
  const v = m.vocabulary;
  const base = useId();
  const [index, setIndex] = useState(0);
  const count = strategy.modes.length;
  const current = clampPage(index, count);
  const mode = strategy.modes[current];
  const go = (next: number) => setIndex(clampPage(next, count));
  const gestures = usePageGestures((direction) => go(current + direction));
  const upgrades = f.list(ATTRIBUTE_IDS.map((id) => `${v.attributes[id].name} ${strategy.build[id] ?? 0}`));
  if (mode === undefined) throw new Error("A strategy to read has no mode.");
  const position = m.common.carousel.position(current + 1, count);
  return (
    <div data-rules-text="" className="flex min-w-0 flex-col gap-3">
      <section id={`${base}-mode`} aria-roledescription={count > 1 ? "carousel" : undefined} className="flex min-w-0 flex-col gap-1" style={count > 1 ? { touchAction: "pan-y" } : undefined} {...(count > 1 ? gestures : {})}>
        {/* With one mode its name says nothing the list does not. */}
        {count > 1 ? (
          <div className="flex min-w-0 items-center gap-2">
            <IconButton
              label={m.common.carousel.previous}
              icon={<ChevronLeft aria-hidden size={22} />}
              aria-disabled={current === 0}
              aria-controls={`${base}-mode`}
              className={END_CLASSES}
              data-rules-mode-previous=""
              onClick={() => go(current - 1)}
            />
            <h4 data-rules-mode={mode.id} className="min-w-0 flex-1 text-center font-display font-semibold [overflow-wrap:anywhere]">
              {modeName(v, mode)}
            </h4>
            <span className="sr-only" aria-live="polite">
              {position}
            </span>
            <IconButton
              label={m.common.carousel.next}
              icon={<ChevronRight aria-hidden size={22} />}
              aria-disabled={current === count - 1}
              aria-controls={`${base}-mode`}
              className={END_CLASSES}
              data-rules-mode-next=""
              onClick={() => go(current + 1)}
            />
          </div>
        ) : null}
        {/* Room for two-digit numbers ("20."), because a mode holds up to 20 rules (LIMITS) and the sheet's scroll box cuts what sticks out. */}
        <ol className="m-0 flex min-w-0 list-decimal flex-col gap-1 pl-[2.25em] [overflow-wrap:anywhere] marker:text-muted">
          {mode.rules.map((rule) => (
            <li key={rule.id}>{ruleText(v, rule, strategy.modes)}</li>
          ))}
        </ol>
        <p className="[overflow-wrap:anywhere]">{fallbackText(v, mode.fallback)}</p>
      </section>
      <p className="text-muted [overflow-wrap:anywhere]">{m.monthly.sheet.upgrades(upgrades)}</p>
    </div>
  );
}
