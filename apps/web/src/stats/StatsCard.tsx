// The statistics card (docs/specs/revamp/81-metrics.md, K2): what the player's rules did. One
// compact pane: a heading, the three main numbers, one sentence about the rules that never ran,
// how far the tank moved, then each rule as a row with a bar and its turns, paged. It fills the
// box it is given (the pane contract, 11-foundation-guide.md 11.2) and never scrolls: in a short
// box the moved sentence, then the hit rate, then the rules heading give way, and the numbers move
// beside their labels (DETAIL_LEVELS), so
// the numbers, the never-ran sentence and at least one rule row with the page controls stay.
// Used after a round and a game in the room's "My tank" pane, after a Try it match and in the
// monthly league's "Your tank" pane.

import { useId } from "react";
import type { StatsNumbers, StatsView } from "@game/engine";
import { useFormat, useLanguage, useMessages } from "../i18n/I18nProvider.tsx";
import { useFitDetail } from "../ui/useFitDetail.ts";
import { modeName } from "../vocabulary/sentence.ts";
import { Pager } from "../ui/Pager.tsx";
import { barShare, cardRows, hitRate, QUIET_NAMED, quietRules, type CardRow, type QuietRule } from "./statsCard.ts";

export interface StatsCardProps {
  /** "Round 2", "This game" or "Today"; none where the pane's own title names it (the Try it result). */
  readonly heading?: string;
  /** The main numbers: the round's, or the whole game's. */
  readonly numbers: StatsNumbers;
  /** The rules and their turns, of the strategy that played. */
  readonly rules: StatsView;
  /** The rules part's heading: the default, or "in the last round" when the numbers are a game's. */
  readonly rulesHeading?: string;
}

/** Full; without the moved sentence; also without the hit rate; also without the rules heading; also each number beside its label. */
const DETAIL_LEVELS = 5;

export function StatsCard({ heading, numbers, rules, rulesHeading }: StatsCardProps) {
  const m = useMessages();
  const s = m.stats;
  const f = useFormat();
  const [language] = useLanguage();
  const headingId = useId();
  // Keyed on what changes the card's height, so the monthly card's poll every few seconds does not start the levels again.
  const detail = useFitDetail<HTMLElement>(DETAIL_LEVELS, `${language}|${heading ?? ""}|${rules.modes.length}|${quietRules(rules, m.vocabulary).length}|${hitRate(numbers) === null}`);
  const rows = cardRows(rules, m.vocabulary);
  const compact = detail.level >= 4;
  const rate = hitRate(numbers);
  const quiet = useQuietSentence(rules);
  const modeNameAt = (index: number) => {
    const mode = rules.modes[index];
    return mode === undefined ? "" : modeName(m.vocabulary, mode);
  };
  const ruleName = (mode: number, rule: number) => (rules.modes.length > 1 ? s.ruleInMode(rule, modeNameAt(mode)) : s.rule(rule));
  return (
    <section
      ref={detail.ref}
      data-stats-card=""
      {...(heading === undefined ? { "aria-label": rulesHeading ?? s.rulesHeading } : { "aria-labelledby": headingId })}
      className={`flex min-h-0 min-w-0 flex-1 flex-col fit:overflow-hidden ${compact ? "gap-2" : "gap-3"}`}
    >
      {heading === undefined ? null : (
        <h2 id={headingId} className="shrink-0 text-title [overflow-wrap:anywhere]">
          {heading}
        </h2>
      )}
      {/* Compact: each column as wide as its label and number, so "Tepat sasaran 16" keeps one line at 360 px; a longer number wraps a label instead of widening the page. */}
      <dl data-stats-numbers="" className={`m-0 grid shrink-0 ${compact ? "grid-cols-[repeat(3,auto)] justify-start gap-x-4 gap-y-1" : "grid-cols-3 gap-3"}`}>
        <MainNumber label={s.shots} value={f.number(numbers.shots)} compact={compact} />
        <MainNumber label={s.hits} value={f.number(numbers.hits)} note={rate === null || detail.level >= 2 ? null : s.hitRate(rate)} compact={compact} />
        <MainNumber label={s.timesHit} value={f.number(numbers.timesHit)} compact={compact} />
      </dl>
      {quiet === null ? null : (
        <p data-stats-quiet="" className="shrink-0 font-semibold text-warning [overflow-wrap:anywhere]">
          {quiet}
        </p>
      )}
      {detail.level >= 1 ? null : <p className="shrink-0 text-muted [overflow-wrap:anywhere]">{s.moved(numbers.squaresMoved, numbers.turns)}</p>}
      {detail.level >= 3 ? null : <h3 className="shrink-0 text-lead [overflow-wrap:anywhere]">{rulesHeading ?? s.rulesHeading}</h3>}
      {/* At least one row and the page controls: the Pager clips itself, so without this floor useFitDetail would never see the card overflow. */}
      <div className="flex min-h-[4.75rem] flex-1 flex-col">
        <Pager
          label={rulesHeading ?? s.rulesHeading}
          items={rows}
          itemKey={(row) => row.key}
          gap={8}
          renderItem={(row) => <Row row={row} total={rules.turns} name={row.kind === "rule" ? ruleName(row.mode, row.rule) : null} compact={compact} />}
        />
      </div>
    </section>
  );
}

function MainNumber({ label, value, note = null, compact }: { label: string; value: string; note?: string | null; compact: boolean }) {
  return (
    <div className={`flex min-w-0 ${compact ? "flex-row flex-wrap items-baseline gap-x-2" : "flex-col"}`}>
      <dt className={`min-w-0 text-muted [overflow-wrap:anywhere] ${compact ? "text-caption" : ""}`}>{label}</dt>
      <dd data-numeric="" className={`m-0 font-display font-semibold leading-tight ${compact ? "text-lead" : "text-title"}`}>
        {value}
      </dd>
      {note === null ? null : <dd className="m-0 min-w-0 text-caption text-muted [overflow-wrap:anywhere]">{note}</dd>}
    </div>
  );
}

/** `compact`: the bar sits between the label and the number on one line, so a short box still holds a row and the page controls. */
function Row({ row, total, name, compact }: { row: CardRow; total: number; name: string | null; compact: boolean }) {
  const m = useMessages();
  const s = m.stats;
  if (row.kind === "mode") {
    return <p className="pt-1 font-semibold [overflow-wrap:anywhere]">{row.name}</p>;
  }
  // Under a mode heading a row shows "Rule 2"; read aloud it names the mode too.
  const label = row.kind === "rule" ? s.rule(row.rule) : m.vocabulary.rule.fallbackLead;
  const spoken = row.kind === "rule" ? (name ?? label) : label;
  const quiet = row.kind === "rule" && row.neverRan;
  const share = barShare(row.turns, total);
  return (
    <div
      data-stats-row={row.kind}
      className={`grid min-w-0 items-center gap-x-3 gap-y-1 ${compact ? "grid-cols-[minmax(0,1fr)_minmax(3rem,1fr)_auto]" : "grid-cols-[minmax(0,1fr)_auto]"}`}
    >
      <span className="sr-only">{s.ran(spoken, row.turns)}</span>
      <span aria-hidden className={`min-w-0 [overflow-wrap:anywhere] ${quiet ? "font-semibold text-warning" : ""}`}>
        {label}
      </span>
      <span aria-hidden data-numeric="" className={`shrink-0 ${compact ? "order-3" : ""} ${quiet ? "font-semibold text-warning" : row.turns === 0 ? "text-muted" : ""}`}>
        {s.turns(row.turns)}
      </span>
      {/* A plain bar: its length is the rule's share of the turns, and the number beside it says the same. */}
      <span aria-hidden className={`block h-3 min-w-0 rounded-full bg-water-soft ${compact ? "order-2" : "col-span-2"}`}>
        <span className="block h-full rounded-full bg-water" style={{ width: `${share * 100}%` }} />
      </span>
    </div>
  );
}

/** The one sentence about the rules that never ran, or null when every rule ran or its mode never played. */
function useQuietSentence(rules: StatsView): string | null {
  const m = useMessages();
  const s = m.stats;
  const f = useFormat();
  const quiet = quietRules(rules, m.vocabulary);
  if (quiet.length === 0) return null;
  const name = (q: QuietRule) => (rules.modes.length > 1 ? s.ruleInMode(q.rule, q.modeName) : s.rule(q.rule));
  if (quiet.length > QUIET_NAMED) return s.neverRanCount(quiet.length);
  const first = quiet[0];
  if (quiet.length === 1 && first !== undefined) return s.neverRanOne(name(first));
  return s.neverRanMany(f.list(quiet.map(name)));
}
