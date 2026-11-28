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
  /**
   * Points behind the tank just above in points, shown before the points like a race board's interval (owner,
   * 2026-11-28: "kinda like motogp scoreboard, GM is also counted", then "gap above only"). None on the top row.
   */
  readonly behind?: number;
  /**
   * Places 1 to 3 of the monthly ranking: a gold, silver or bronze nameplate with a crown in its art and a medal for the place
   * (owner, 2026-11-28). It takes the place of the own row's tint; the ring and the word "You" still mark it.
   */
  readonly podium?: 1 | 2 | 3;
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
   * A button over the whole row that opens the tank (monthly/TankSheet.tsx), named by `label`. A row
   * with `cue` (the GM's "See rules") ends in it; the others show nothing extra (owner, 2026-11-17: a
   * chevron on every row promised more than a player's sheet holds and hid the GM's cue).
   */
  readonly open?: { readonly label: string; readonly cue: string | null; onOpen(): void } | undefined;
}

/** One ranked tank. board/Scoreboard.tsx draws its rows with it too, so every ranking marks "you" the same way. */
export function RankingRow({ tank, place, isSelf, score, verdict, truncate, note, tag, badge, behind, podium, element = "li", open }: RankingRowProps) {
  const m = useMessages();
  const t = m.results.table;
  const Row = element;
  return (
    <Row
      aria-current={isSelf ? "true" : undefined}
      data-player-id={tank.playerId}
      data-podium={podium}
      className={`relative isolate grid ${open === undefined || open.cue === null ? "grid-cols-[1.6em_1.5em_minmax(0,1fr)_auto]" : "grid-cols-[1.6em_1.5em_minmax(0,1fr)_auto_auto]"} items-center gap-x-[0.5em] overflow-hidden rounded-[0.5em] py-[0.25em] pr-[0.5em] pl-[0.25em] ${
        podium !== undefined ? `podium podium-${podium}` : isSelf ? "bg-self-soft" : ""
      } ${verdict !== null && !verdict.through && !isSelf ? "text-muted" : "text-ink"}`}
    >
      {podium === undefined ? null : <PodiumArt place={podium} />}
      {podium === undefined ? (
        <span className="tabular text-right font-display font-semibold text-muted">{place}</span>
      ) : (
        <span className="tabular flex size-[1.45em] items-center justify-center justify-self-end rounded-full border-2 border-[var(--podium-edge)] bg-[var(--podium)] font-display text-[0.85em] font-bold text-medal-ink">
          {place}
        </span>
      )}
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
        {/* Below 480px a row with a cue (the GM's "See rules") has no room for it: a 4-digit gap cut the name to two letters at 360px. */}
        {behind === undefined ? null : (
          <span data-gap="" className={`tabular ${ROW_LABEL_TEXT} font-semibold text-muted ${open?.cue == null ? "" : "max-[479px]:hidden"}`}>
            <span aria-hidden="true">{formatBehind(behind)}</span>
            <span className="sr-only">{t.behindAbove(behind)}</span>
          </span>
        )}
        {score === null ? null : <span className="tabular font-display font-semibold">{score}</span>}
        {verdict === null ? null : (
          <span className={`min-w-[4.5em] text-right ${ROW_LABEL_TEXT} font-semibold ${verdict.through ? "text-ok" : "text-muted"}`}>
            {verdict.through ? t.through : t.out}
          </span>
        )}
      </span>
      {note === undefined ? null : <span className={`col-start-3 col-end-5 ${ROW_LABEL_TEXT} text-muted [overflow-wrap:anywhere]`}>{note}</span>}
      {/* The cue says what the row opens; the button over the whole row is the target. */}
      {open === undefined || open.cue === null ? null : (
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

/**
 * The crown of each place, in a 64 x 48 box (owner, 2026-11-28: "1 2 3 having different crown illustration"): an
 * imperial crown with five points for 1st, a crown with three ball tips for 2nd, and a low tiara for 3rd. Each lists its
 * outline, its band and the gems drawn in the edge colour.
 */
const PODIUM_CROWNS: Record<1 | 2 | 3, { readonly outline: string; readonly band: readonly [number, number, number, number]; readonly gems: readonly (readonly [number, number, number])[] }> = {
  1: {
    outline: "M6 36 L3 13 L14 23 L18 6 L25 21 L32 1 L39 21 L46 6 L50 23 L61 13 L58 36 Z",
    band: [5, 35, 54, 9],
    gems: [[3, 13, 3.5], [18, 6, 3.5], [32, 1, 4], [46, 6, 3.5], [61, 13, 3.5], [20, 39.5, 2.5], [32, 39.5, 3], [44, 39.5, 2.5]],
  },
  2: {
    outline: "M8 38 L4 14 L19 26 L32 8 L45 26 L60 14 L56 38 Z",
    band: [7, 37, 50, 7],
    gems: [[4, 13, 4.5], [32, 7, 4.5], [60, 13, 4.5]],
  },
  3: {
    outline: "M6 42 L9 30 L18 35 L24 24 L32 30 L40 24 L46 35 L55 30 L58 42 Z",
    band: [6, 40, 52, 5],
    gems: [[32, 26, 3.5]],
  },
};

/**
 * The nameplate's art (owner, 2026-11-28: "the crown is illustration inside the nameplate, part of the bg art"): the
 * place's crown in its metal (index.css .podium-1 to .podium-3), tilted near the right end, behind the text and left of
 * the points, faint enough that the interval over it stays readable.
 */
function PodiumArt({ place }: { readonly place: 1 | 2 | 3 }) {
  const crown = PODIUM_CROWNS[place];
  const [x, y, width, height] = crown.band;
  const metal = { fill: "var(--podium)", stroke: "var(--podium-edge)" };
  return (
    <svg aria-hidden="true" data-crown={place} viewBox="0 0 64 48" className="themed-svg pointer-events-none absolute top-1/2 right-[4.25em] -z-10 h-[2.3em] w-auto -translate-y-1/2 rotate-[-12deg] opacity-40">
      <path d={crown.outline} strokeWidth={3} strokeLinejoin="round" style={metal} />
      <rect x={x} y={y} width={width} height={height} rx={2} strokeWidth={3} style={metal} />
      {crown.gems.map(([cx, cy, r]) => (
        <circle key={`${cx} ${cy}`} cx={cx} cy={cy} r={r} style={{ fill: "var(--podium-edge)" }} />
      ))}
    </svg>
  );
}

/** An interval as a race board writes it: "−213" behind (a minus sign, not a hyphen), "0" level. */
export function formatBehind(behind: number): string {
  return behind === 0 ? "0" : `\u2212${behind}`;
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
