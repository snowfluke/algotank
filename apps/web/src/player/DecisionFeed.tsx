// "What your tank did": the player's recent turns as sentences, newest first. It
// fills the pane it is placed in and pages the turns when they do not all fit.

import { useId } from "react";
import type { StrategyInput } from "@game/engine";
import { useMessages } from "../i18n/I18nProvider.tsx";
import type { OwnDecision } from "../stream/streamState.ts";
import { Pager } from "../ui/Pager.tsx";
import { describeDecision } from "./feed.ts";

export function DecisionFeed({ decisions, strategy }: { decisions: readonly OwnDecision[]; strategy: StrategyInput }) {
  const m = useMessages();
  const t = m.live.feed;
  const headingId = useId();
  const lines = [...decisions].reverse().map((entry) => describeDecision(entry, strategy, m.vocabulary, t));
  return (
    <section className="flex min-h-0 min-w-0 flex-1 flex-col gap-2" aria-labelledby={headingId}>
      <h2 id={headingId} className="shrink-0 text-title">
        {t.heading}
      </h2>
      {lines.length === 0 ? (
        <p className="text-muted">{t.empty}</p>
      ) : (
        <Pager
          label={t.heading}
          items={lines}
          gap={0}
          itemKey={(line) => String(line.turn)}
          renderItem={(line) => (
            <div className="flex min-w-0 flex-col gap-0.5 border-b border-line py-2">
              <span className="tabular text-caption font-semibold text-muted">{t.turn(line.turn)}</span>
              <span className="min-w-0 [overflow-wrap:anywhere]">{line.text}</span>
            </div>
          )}
        />
      )}
    </section>
  );
}
