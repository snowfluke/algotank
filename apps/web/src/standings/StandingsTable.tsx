// The ranking tables: live during a round, after a round with who goes through,
// and the final ranking. Every row draws the player's tank. The viewer's own row
// is marked three ways that do not depend on colour alone: the badge's "you" ring,
// a tinted row and the word "You". Sizes are in em, so a FitList on the big screen
// scales the rows with its font size.

import { ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import { useMessages } from "../i18n/I18nProvider.tsx";
import { TankBadge } from "../tank/TankBadge.tsx";
import { FitList } from "../ui/FitList.tsx";
import { Pager } from "../ui/Pager.tsx";
import { ROW_LABEL_TEXT, type FitSize } from "../ui/fitList.ts";
import type { FinalPlace, LiveRanking as LiveRankingData, RowTank, StandingRow } from "./standings.ts";

export interface RankingRowProps {
  readonly tank: RowTank;
  /** null for a tank that has no place yet (the monthly arena's "not ranked yet"). */
  readonly place: number | null;
  readonly isSelf: boolean;
  /** Points, or null for the final ranking, which lists places only. */
  readonly score: number | null;
  /** "Through" or "Out" after a round, or null. */
  readonly verdict: { readonly through: boolean } | null;
  readonly truncate: boolean;
  /** A line under the name, such as the own tank's water on the test match board. */
  readonly note?: string;
  /** A short word after the name, such as "Left" for a tank that quit the monthly arena today. */
  readonly tag?: string;
  /**
   * A badge before the name: "GM" for the monthly arena's game master (the organizer's tank, which
   * takes no place). `title` says it in words on hover.
   */
  readonly badge?: { readonly text: string; readonly title: string };
  /** "li" in a list of rows (default); "div" inside a Pager, which wraps each item in its own `li`. */
  readonly element?: "li" | "div";
  /**
   * A button over the whole row that opens the tank (monthly/TankSheet.tsx), named by `label`. The
   * row ends in a chevron, or in `cue` (the GM's "See rules") when the row has more to show.
   */
  readonly open?: { readonly label: string; readonly cue: string | null; onOpen(): void } | undefined;
}

/** One ranked tank. board/Scoreboard.tsx draws its rows with it too, so every ranking marks "you" the same way. */
export function RankingRow({ tank, place, isSelf, score, verdict, truncate, note, tag, badge, element = "li", open }: RankingRowProps) {
  const m = useMessages();
  const t = m.results.table;
  const Row = element;
  return (
    <Row
      aria-current={isSelf ? "true" : undefined}
      data-player-id={tank.playerId}
      className={`relative grid ${open === undefined ? "grid-cols-[1.6em_1.5em_minmax(0,1fr)_auto]" : open.cue === null ? "grid-cols-[1.6em_1.5em_minmax(0,1fr)_auto_1em]" : "grid-cols-[1.6em_1.5em_minmax(0,1fr)_auto_auto]"} items-center gap-x-[0.5em] rounded-[0.5em] py-[0.25em] pr-[0.5em] pl-[0.25em] ${
        isSelf ? "bg-self-soft" : ""
      } ${verdict !== null && !verdict.through && !isSelf ? "text-muted" : "text-ink"}`}
    >
      <span className="tabular text-right font-display font-semibold text-muted">{place}</span>
      {/* The name next to it names the tank, so a screen reader skips the badge. */}
      <TankBadge look={tank.look} size={28} name={null} self={isSelf} detail="full" angle={-90} className="h-[1.5em] w-[1.5em]" />
      <span className="flex min-w-0 items-baseline gap-x-[0.5em]">
        {badge === undefined ? null : <NameBadge text={badge.text} title={badge.title} />}
        <span className={`min-w-0 font-semibold ${truncate ? "truncate" : "[overflow-wrap:anywhere]"}`} title={tank.name}>
          {tank.name}
        </span>
        {isSelf ? <span className={`shrink-0 ${ROW_LABEL_TEXT} font-bold text-self-ink`}>{t.you}</span> : null}
        {tank.isBot ? <span className={`shrink-0 ${ROW_LABEL_TEXT} text-muted`}>{t.bot}</span> : null}
        {tag === undefined ? null : <span className={`shrink-0 ${ROW_LABEL_TEXT} text-muted`}>{tag}</span>}
      </span>
      <span className="flex items-baseline gap-x-[0.75em]">
        {score === null ? null : <span className="tabular font-display font-semibold">{score}</span>}
        {verdict === null ? null : (
          <span className={`min-w-[4.5em] text-right ${ROW_LABEL_TEXT} font-semibold ${verdict.through ? "text-ok" : "text-muted"}`}>
            {verdict.through ? t.through : t.out}
          </span>
        )}
      </span>
      {note === undefined ? null : <span className={`col-start-3 col-end-5 ${ROW_LABEL_TEXT} text-muted [overflow-wrap:anywhere]`}>{note}</span>}
      {/* The chevron says the row opens; the button over the whole row is the target. */}
      {open === undefined ? null : open.cue === null ? (
        <ChevronRight aria-hidden className="h-[1em] w-[1em] text-muted" />
      ) : (
        <span aria-hidden className={`flex items-center whitespace-nowrap ${ROW_LABEL_TEXT} font-semibold text-water`}>
          {open.cue}
          <ChevronRight className="h-[1em] w-[1em]" />
        </span>
      )}
      {open === undefined ? null : (
        <button
          type="button"
          aria-label={open.label}
          data-open-tank=""
          onClick={open.onOpen}
          className="absolute inset-0 cursor-pointer rounded-[0.5em] focus-visible:outline-2 focus-visible:outline-water hover:bg-ink/5"
        />
      )}
    </Row>
  );
}

/** A short badge before a name, such as the monthly arena's "GM"; the admin page draws it too. */
export function NameBadge({ text, title }: { readonly text: string; readonly title: string }) {
  return (
    <span data-badge="" title={title} className="shrink-0 self-center rounded-[0.35em] bg-ink px-[0.4em] py-[0.05em] font-display text-[0.75em] leading-tight font-bold text-panel">
      {text}
    </span>
  );
}

/** The cut line with its label in words, so it reads without its colour. As tall as a ranking row (2em), so a scrolled list stops on whole rows. */
export function CutLine({ label, element = "li" }: { label: string; element?: "li" | "div" }) {
  const Line = element;
  return (
    <Line role="separator" aria-label={label} data-cut-line="true" className="flex h-[2em] min-w-0 items-center gap-[0.5em]">
      <span aria-hidden="true" className="h-0 min-w-[1em] flex-1 border-t-2 border-dashed border-hit" />
      <span aria-hidden="true" className={`min-w-0 truncate ${ROW_LABEL_TEXT} leading-none font-semibold text-hit`}>
        {label}
      </span>
      <span aria-hidden="true" className="h-0 min-w-[1em] flex-1 border-t-2 border-dashed border-hit" />
    </Line>
  );
}

interface LiveRankingProps {
  readonly ranking: LiveRankingData;
  readonly highlightId: string | null;
  readonly fit?: FitSize | undefined;
}

/** The ranking while a round runs. Tanks with the same points share a place. */
export function LiveRanking({ ranking, highlightId, fit }: LiveRankingProps) {
  const m = useMessages();
  const t = m.results.table;
  const items: ReactNode[] = [];
  ranking.rows.forEach((row, i) => {
    if (i === ranking.cut) items.push(<CutLine key="cut" label={t.topGoThrough(ranking.cut)} />);
    items.push(
      <RankingRow key={row.playerId} tank={row} place={row.place} isSelf={row.playerId === highlightId} score={row.score} verdict={null} truncate={fit !== undefined} />,
    );
  });
  // The cut line sits at index `cut` of the items, so a shortened big-screen list keeps it and its neighbours.
  const fitOptions = fit === undefined ? undefined : { size: fit, focus: ranking.cut, more: t.moreInRound };
  return (
    <FitList label={t.live} fit={fitOptions}>
      {items}
    </FitList>
  );
}

export function FinalRanking({ places, fit, highlightId = null }: { places: readonly FinalPlace[]; fit?: FitSize | undefined; highlightId?: string | null }) {
  const m = useMessages();
  const fitOptions = fit === undefined ? undefined : { size: fit, focus: null, more: m.results.table.moreBelow };
  return (
    <FitList label={m.results.table.final} fit={fitOptions}>
      {places.map((p) => (
        <RankingRow key={p.playerId} tank={p} place={p.place} isSelf={p.playerId === highlightId} score={null} verdict={null} truncate={fit !== undefined} />
      ))}
    </FitList>
  );
}

// --- Paged rankings, for a pane that does not scroll ---------------------------------
// A ranking can hold 512 tanks, so a pane shows a page of rows that fit its height,
// with Previous and Next under it, and keeps the viewer's row on every page.

/** One entry of a paged ranking: a ranked tank, or the cut line between who goes through and who is out. */
export type RankingItem =
  | { readonly kind: "row"; readonly row: Omit<RankingRowProps, "element" | "isSelf" | "truncate"> }
  | { readonly kind: "cut"; readonly label: string };

/** Index of the viewer's row among the items, or null when the viewer has no row. */
function ownItemIndex(items: readonly RankingItem[], highlightId: string | null): number | null {
  if (highlightId === null) return null;
  const index = items.findIndex((item) => item.kind === "row" && item.row.tank.playerId === highlightId);
  return index === -1 ? null : index;
}

/** The live ranking as items, with the cut line where the tanks that go through end. */
export function liveRankingItems(ranking: LiveRankingData, cutLabel: (through: number) => string): RankingItem[] {
  const items: RankingItem[] = [];
  ranking.rows.forEach((row, i) => {
    if (i === ranking.cut) items.push({ kind: "cut", label: cutLabel(ranking.cut) });
    items.push({ kind: "row", row: { tank: row, place: row.place, score: row.score, verdict: null } });
  });
  return items;
}

/** A finished round as items, with the cut line between the last tank through and the first tank out. */
export function roundStandingItems(rows: readonly StandingRow[], cutLabel: (through: number) => string): RankingItem[] {
  const through = rows.filter((row) => row.advanced).length;
  const items: RankingItem[] = [];
  rows.forEach((row, i) => {
    if (i > 0 && !row.advanced && rows[i - 1]?.advanced === true) items.push({ kind: "cut", label: cutLabel(through) });
    items.push({ kind: "row", row: { tank: row, place: row.place, score: row.score, verdict: { through: row.advanced } } });
  });
  return items;
}

export function finalRankingItems(places: readonly FinalPlace[]): RankingItem[] {
  return places.map((p) => ({ kind: "row", row: { tank: p, place: p.place, score: null, verdict: null } }));
}

/**
 * A ranking that fills its parent's height: give it a parent with `flex-1 min-h-0`.
 * Rows and the cut line are both 2em tall, so the Pager measures one of them. With
 * a cut line on another page, a button under the list turns to it.
 */
export function PagedRanking({
  label,
  items,
  highlightId,
  jumpLabel,
  open,
}: {
  label: string;
  items: readonly RankingItem[];
  highlightId: string | null;
  /** The button that turns to the line's page; default "to the cut line", null for none. */
  jumpLabel?: string | null;
  /** Makes a row a button that opens its tank: `label` names it, `can` says which rows open, `cue` is its words at the end or null. */
  open?: { label(name: string, playerId: string): string; cue(playerId: string): string | null; can(playerId: string): boolean; onOpen(playerId: string): void };
}) {
  const m = useMessages();
  const cutIndex = items.findIndex((item) => item.kind === "cut");
  const toLine = jumpLabel === undefined ? m.results.table.toCutLine : jumpLabel;
  const cut = toLine === null ? -1 : cutIndex;
  return (
    <Pager
      label={label}
      items={items}
      gap={0}
      uniformHeight
      jump={cut < 0 || toLine === null ? null : { label: toLine, index: cut }}
      keepIndex={ownItemIndex(items, highlightId)}
      itemKey={(item) => (item.kind === "cut" ? "cut" : item.row.tank.playerId)}
      renderItem={(item) =>
        item.kind === "cut" ? (
          <CutLine label={item.label} element="div" />
        ) : (
          <RankingRow
            {...item.row}
            isSelf={item.row.tank.playerId === highlightId}
            truncate
            element="div"
            open={
              open !== undefined && open.can(item.row.tank.playerId)
                ? { label: open.label(item.row.tank.name, item.row.tank.playerId), cue: open.cue(item.row.tank.playerId), onOpen: () => open.onOpen(item.row.tank.playerId) }
                : undefined
            }
          />
        )
      }
    />
  );
}
