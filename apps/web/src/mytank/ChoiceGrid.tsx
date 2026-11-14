// The choices of one part of the look as a grid of large squares: a radio group, so the
// arrow keys move the choice. It measures its box and shows as many whole rows as fit;
// when not all fit, it pages them (Previous, "2 of 3", Next, a swipe or Page Up and Down)
// and opens on the page of the current choice. The chosen square has a thick ring and a
// check mark, so the choice does not depend on colour.

import { Check, ChevronLeft, ChevronRight } from "lucide-react";
import { useId, useState, type ReactNode } from "react";
import { useMessages } from "../i18n/I18nProvider.tsx";
import { IconButton } from "../ui/IconButton.tsx";
import { clampPage, END_CLASSES } from "../ui/paging.ts";
import { useFitLayout } from "../ui/layout.ts";
import { useBoxSize } from "../ui/useBoxSize.ts";
import { usePageGestures } from "../ui/usePageGestures.ts";
import { GRID_LIMITS, planGrid } from "./parts.ts";

export interface ChoiceGridProps<T> {
  /** The question the choices answer, shown above them and naming the group. */
  readonly legend: string;
  readonly items: readonly T[];
  readonly itemKey: (item: T) => string;
  /** Each choice's accessible name, for example the colour's name. */
  readonly label: (item: T) => string;
  readonly chosen: (item: T) => boolean;
  /** A sentence for a choice that cannot be taken now, or null. */
  readonly unavailable?: (item: T) => string | null;
  readonly render: (item: T) => ReactNode;
  readonly onChoose: (item: T) => void;
}

export function ChoiceGrid<T>({ legend, items, itemKey, label, chosen, unavailable, render, onChoose }: ChoiceGridProps<T>) {
  const m = useMessages();
  const name = useId();
  const { ref, box } = useBoxSize<HTMLDivElement>();
  const fit = useFitLayout();
  // Outside the fixed-height layout the page scrolls, so every choice is listed in a wrapping row; so it is before the first measurement.
  const plan = box === null || !fit ? null : planGrid(box, items.length);
  const chosenIndex = Math.max(0, items.findIndex(chosen));
  const [page, setPage] = useState<number | null>(null);
  const pages = plan?.pages ?? 1;
  const perPage = plan?.perPage ?? items.length;
  // Until the player turns a page, the grid shows the page of the current choice.
  const current = clampPage(page ?? Math.floor(chosenIndex / perPage), pages);
  const shown = items.slice(current * perPage, (current + 1) * perPage);
  const go = (next: number) => setPage(clampPage(next, pages));
  const gestures = usePageGestures((direction) => go(current + direction));
  const beside = plan !== null && plan.controls === "beside" && pages > 1;
  const position = m.common.pager.position(current + 1, pages);
  const previous = (
    <IconButton
      label={m.common.pager.previous}
      icon={<ChevronLeft aria-hidden size={22} />}
      aria-disabled={current === 0}
      className={END_CLASSES}
      data-pager-previous=""
      onClick={() => go(current - 1)}
    />
  );
  const next = (
    <IconButton
      label={m.common.pager.next}
      icon={<ChevronRight aria-hidden size={22} />}
      aria-disabled={current === pages - 1}
      className={END_CLASSES}
      data-pager-next=""
      onClick={() => go(current + 1)}
    />
  );

  const cells = (
    <div
      className={plan === null ? "flex flex-wrap gap-2" : "grid"}
      style={plan === null ? undefined : { gridTemplateColumns: `repeat(${plan.columns}, ${plan.cell}px)`, gap: `${GRID_LIMITS.gap}px` }}
    >
      {shown.map((item) => {
        const note = unavailable?.(item) ?? null;
        const isChosen = chosen(item);
        return (
          <label
            key={itemKey(item)}
            title={note ?? label(item)}
            data-choice={itemKey(item)}
            className={`press relative flex aspect-square min-h-12 min-w-12 items-center justify-center rounded-[var(--radius-control)] border-2 bg-panel p-1.5 has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-water ${
              note === null ? "cursor-pointer" : "cursor-not-allowed opacity-40"
            } ${isChosen ? "border-water shadow-[inset_0_0_0_2px_var(--color-water)]" : "border-line"} ${plan === null ? "size-14" : ""}`}
            style={plan === null ? undefined : { width: `${plan.cell}px`, height: `${plan.cell}px` }}
          >
            <input
              type="radio"
              name={name}
              checked={isChosen}
              aria-label={note === null ? label(item) : `${label(item)}. ${note}`}
              aria-disabled={note !== null}
              onChange={() => {
                if (note === null) onChoose(item);
              }}
              className="sr-only"
            />
            {render(item)}
            {isChosen ? (
              <span aria-hidden="true" className="absolute -top-1.5 -right-1.5 flex size-6 items-center justify-center rounded-full bg-water text-water-ink">
                <Check size={16} strokeWidth={3} />
              </span>
            ) : null}
          </label>
        );
      })}
    </div>
  );

  return (
    <fieldset className="m-0 flex min-w-0 flex-col gap-2 border-0 p-0 fit:min-h-0 fit:flex-1" data-choice-grid="">
      <legend className="float-left mb-2 w-full p-0 font-semibold">{legend}</legend>
      <div ref={ref} className="flex min-w-0 flex-col gap-2 fit:min-h-0 fit:flex-1" style={{ touchAction: "pan-y" }} {...gestures}>
        {beside ? (
          <div className="flex min-w-0 items-center gap-2" data-choice-pages="">
            {previous}
            {cells}
            {next}
            <span aria-live="polite" className="sr-only">
              {position}
            </span>
          </div>
        ) : (
          <>
            {cells}
            {pages > 1 ? (
              <div className="mt-auto flex min-h-11 shrink-0 flex-wrap items-center justify-center gap-3" data-choice-pages="">
                {previous}
                <span aria-live="polite" className="tabular min-w-16 text-center text-muted">
                  {position}
                </span>
                {next}
              </div>
            ) : null}
          </>
        )}
      </div>
    </fieldset>
  );
}
