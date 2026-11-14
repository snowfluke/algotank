// The round history as a picture: one column per round, oldest on the left and the final on
// the right, each a ranking with points and a mark (a check for through, a cross for out, a
// crown for the winner). The winner's rows are tinted in every column and the viewer's own
// rows carry the "you" colour, so a tank's path reads from left to right without a sentence.
// Each column is a Pager that keeps the followed tank on its page (results/history.ts), so the
// path stays in view with 512 tanks. On a laptop as many columns sit side by side as the width
// allows (at least COLUMN_MIN_PX each), and the rest are a page away; on a phone it is one
// round per page. Pane contract (11-foundation-guide 11.2): it fills the box it is given.

import { ArrowRight, ChevronLeft, ChevronRight, CircleCheck, CircleX, Crown } from "lucide-react";
import { useState } from "react";
import { useMessages } from "../i18n/I18nProvider.tsx";
import { TankBadge } from "../tank/TankBadge.tsx";
import { IconButton } from "../ui/IconButton.tsx";
import { useLaptopLayout } from "../ui/layout.ts";
import { Pager } from "../ui/Pager.tsx";
import { useBoxSize } from "../ui/useBoxSize.ts";
import type { HistoryColumn, HistoryMark, HistoryRow, RoundHistoryModel } from "./history.ts";

/** A column keeps room for the place, the tank, about 8 characters of a name, the points and the mark. */
const COLUMN_MIN_PX = 184;

/** The first column of each page of columns. Exported for its test. */
export function columnWindow(count: number, perPage: number, first: number): { readonly first: number; readonly last: number } {
  const size = Math.max(1, Math.min(perPage, count));
  const start = Math.max(0, Math.min(first, count - size));
  return { first: start, last: start + size - 1 };
}

function MarkIcon({ mark }: { readonly mark: HistoryMark }) {
  const t = useMessages().results.history;
  switch (mark) {
    case "winner":
      return (
        <span className="flex items-center justify-center" title={t.winner}>
          <Crown aria-hidden size={20} strokeWidth={2.5} style={{ fill: "var(--color-tank-3)" }} className="text-ink" />
          <span className="sr-only">{t.winner}</span>
        </span>
      );
    case "through":
      return (
        <span className="flex items-center justify-center text-ok" title={t.through}>
          <CircleCheck aria-hidden size={20} strokeWidth={2.5} />
          <span className="sr-only">{t.through}</span>
        </span>
      );
    case "out":
      return (
        <span className="flex items-center justify-center text-muted" title={t.out}>
          <CircleX aria-hidden size={20} strokeWidth={2} />
          <span className="sr-only">{t.out}</span>
        </span>
      );
  }
}

function HistoryRowView({ row }: { readonly row: HistoryRow }) {
  const t = useMessages().results.table;
  const tint = row.self ? "bg-self-soft" : row.winner ? "bg-water-soft" : "";
  return (
    <div
      data-history-row={row.tank.playerId}
      data-history-mark={row.mark}
      aria-current={row.self ? "true" : undefined}
      className={`grid min-h-9 grid-cols-[1.75em_1.75em_minmax(0,1fr)_auto_1.5em] items-center gap-x-1.5 rounded-lg px-1 ${tint} ${row.mark === "out" && !row.self && !row.winner ? "text-muted" : "text-ink"}`}
    >
      <span className="tabular text-right font-display font-semibold text-muted">{row.place}</span>
      <TankBadge look={row.tank.look} size={28} name={null} self={row.self} detail="full" angle={-90} className="h-[1.75em] w-[1.75em]" />
      <span className={`min-w-0 truncate ${row.winner || row.self ? "font-bold" : "font-semibold"}`} title={row.tank.name}>
        {row.tank.name}
        {row.self ? <span className="sr-only">{`, ${t.you}`}</span> : null}
      </span>
      <span className="tabular font-display font-semibold">{row.score}</span>
      <MarkIcon mark={row.mark} />
    </div>
  );
}

function ColumnView({ column }: { readonly column: HistoryColumn }) {
  const t = useMessages().results.history;
  const title = column.isFinal ? t.final : t.round(column.round);
  const count = column.isFinal ? t.finalCount(column.rows.length) : t.count(column.rows.length, column.through);
  return (
    <section data-history-column={column.round} aria-label={title} className="flex min-h-0 min-w-0 flex-col gap-2">
      <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-0.5 border-b-2 border-line pb-1">
        <h3 className="min-w-0 font-display text-title font-semibold">{title}</h3>
        {/* The number of tanks and how many went on, as a picture; read aloud as one sentence. */}
        <p className="flex items-center gap-1 tabular font-display font-semibold text-muted">
          <span className="sr-only">{count}</span>
          <span aria-hidden className="flex items-center gap-1">
            {column.rows.length}
            {column.isFinal ? (
              <Crown size={18} strokeWidth={2.5} style={{ fill: "var(--color-tank-3)" }} className="text-ink" />
            ) : (
              <>
                <ArrowRight size={18} strokeWidth={2.5} />
                <span className="text-ok">{column.through}</span>
              </>
            )}
          </span>
        </p>
      </div>
      <div className="flex min-h-0 flex-1 flex-col">
        <Pager
          label={title}
          items={column.rows}
          itemKey={(row) => row.tank.playerId}
          renderItem={(row) => <HistoryRowView row={row} />}
          keepIndex={column.keepIndex}
          uniformHeight
          gap={0}
        />
      </div>
    </section>
  );
}

/**
 * `columnMinPx`: the big screen's larger type needs wider columns. `opensAt`: the first page of
 * columns shown; "last" puts the final in view first (the big screen, which has nobody at the
 * buttons during the celebration).
 */
export function RoundHistory({ model, columnMinPx = COLUMN_MIN_PX, opensAt = "first" }: { readonly model: RoundHistoryModel; readonly columnMinPx?: number; readonly opensAt?: "first" | "last" }) {
  const t = useMessages().results.history;
  const laptop = useLaptopLayout();
  const { ref, box } = useBoxSize<HTMLDivElement>();
  const count = model.columns.length;
  // "last" starts past the end; columnWindow pulls the window back so it ends on the final.
  const [first, setFirst] = useState(opensAt === "first" ? 0 : count);
  const perPage = laptop && box !== null ? Math.max(1, Math.floor(box.width / columnMinPx)) : 1;
  const shown = columnWindow(count, perPage, first);
  const paged = count > perPage;
  const columns = model.columns.slice(shown.first, shown.last + 1);

  return (
    <div ref={ref} data-round-history="" className="flex min-h-0 min-w-0 flex-1 flex-col gap-2">
      <h2 className="sr-only">{t.heading}</h2>
      {count === 0 ? (
        <p className="text-muted">{t.empty}</p>
      ) : (
        <div className="grid min-h-0 flex-1 gap-4" style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(0, 1fr))` }}>
          {columns.map((column) => (
            <ColumnView key={column.round} column={column} />
          ))}
        </div>
      )}
      {paged ? (
        <div data-history-pages="" className="flex shrink-0 flex-wrap items-center justify-center gap-3">
          <IconButton
            label={t.earlier}
            icon={<ChevronLeft aria-hidden size={22} />}
            aria-disabled={shown.first === 0}
            data-history-previous=""
            onClick={() => shown.first > 0 && setFirst(Math.max(0, shown.first - columns.length))}
          />
          <p aria-live="polite" className="min-w-0 text-center font-semibold text-muted">
            {t.position(shown.first + 1, shown.last + 1, count)}
          </p>
          <IconButton
            label={t.later}
            icon={<ChevronRight aria-hidden size={22} />}
            aria-disabled={shown.last === count - 1}
            data-history-next=""
            onClick={() => shown.last < count - 1 && setFirst(shown.last + 1)}
          />
        </div>
      ) : null}
    </div>
  );
}
