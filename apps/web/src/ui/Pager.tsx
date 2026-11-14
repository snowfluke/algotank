// A list that never scrolls: it shows as many items as fit the height it is given,
// and Previous, Next and a position ("2 of 3") under them when they do not all fit.
// Use it for any list in a pane whose length the screen does not control: players,
// a ranking, rule sentences, recent turns. For one big item at a time, use Carousel.
//
// How it fits: every item is rendered once more in an invisible layer of the same
// width, its height is measured, and ui/paging.ts splits the items into pages. It
// measures again when the box or the item count changes and after the fonts load.
// Before the first measurement, in a server render, and in the scrolling fallback
// (outside `fit:`), it lists every item and shows no controls.
//
// The Pager fills its parent's height: give it a parent with a height (a flex item
// with flex-1 and min-h-0, or a grid row). Items must not change height on hover.
//
// A list of equal rows (a ranking of 512 tanks, a player list) passes `uniformHeight`:
// the layer then holds the first item only, so a list that changes on every turn
// renders one extra row per turn instead of all of them.
//
// A list read from its end (the chat) passes `newestLast`: the pages are planned from the
// newest item back, the Pager opens on the newest page and stays there while items arrive,
// the items sit at the bottom of the box, and the controls row above the list says
// "Earlier messages" on the Previous button.

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { useMessages } from "../i18n/I18nProvider.tsx";
import { Button } from "./Button.tsx";
import { IconButton } from "./IconButton.tsx";
import { useFitLayout } from "./layout.ts";
import { clampPage, END_CLASSES, fitsWithoutPaging, pageOf, planPages, planPagesFromEnd, shownPage, type PagePlan } from "./paging.ts";
import { usePageGestures } from "./usePageGestures.ts";

/** Space between two items in px: 0 for rows with dividers, 8 or 12 for cards. */
export type PagerGap = 0 | 8 | 12;

/** Gap above the controls row. */
const CONTROLS_GAP_PX = 8;
/** Height of the controls row (44px buttons) plus the gap above it, until the row is measured: with a jump button it may wrap. */
const CONTROLS_PX = 44 + CONTROLS_GAP_PX;

export interface PagerProps<T> {
  /** Names the list for a screen reader, for example "Players". */
  readonly label: string;
  readonly items: readonly T[];
  /** A stable key per item, for example the player id. */
  readonly itemKey: (item: T, index: number) => string;
  /** The content of one item. The Pager wraps it in an `li`. */
  readonly renderItem: (item: T, index: number) => ReactNode;
  /**
   * Index of an item that stays in view on every page, for example the viewer's row in
   * a ranking. On a page it does not belong to, it is shown last, after a divider.
   */
  readonly keepIndex?: number | null;
  readonly gap?: PagerGap;
  /** "ol" (default) when the order means something (a ranking), "ul" when it does not. */
  readonly ordered?: boolean;
  /** True when every item is exactly as tall as the first, so one item is measured for all. */
  readonly uniformHeight?: boolean;
  /**
   * A button beside Previous and Next that turns to the page holding item `index`:
   * the ranking's cut line. On that page it is aria-disabled.
   */
  readonly jump?: { readonly label: string; readonly index: number } | null;
  /**
   * An item the owner highlights (the active choice of an open Picker). The Pager shows the page
   * that holds `index`; turning a page calls `onChange` with the first item of the new page
   * instead of turning by itself, so the owner moves its highlight and the page follows.
   */
  readonly active?: { readonly index: number; onChange(index: number): void } | null;
  /** Makes the list a listbox with this id (a Picker's): role="listbox" on the list and role="none" on each wrapper, so items with role="option" belong to it. */
  readonly listboxId?: string | null;
  /**
   * The list is read from its end, newest last (the chat): `earlier` is the Previous button's
   * visible text and `later` the Next button's accessible name. Not with `keepIndex` or `active`.
   */
  readonly newestLast?: { readonly earlier: string; readonly later: string } | null;
}

interface Measured {
  readonly heights: readonly number[];
  readonly available: number;
  /** The controls row with the gap above it. */
  readonly controls: number;
}

export function Pager<T>({ label, items, itemKey, renderItem, keepIndex = null, gap = 8, ordered = true, uniformHeight = false, jump = null, active = null, listboxId = null, newestLast = null }: PagerProps<T>) {
  const m = useMessages();
  const fit = useFitLayout();
  // The root's height does not change when the controls appear, so it is what the pages are planned against.
  const rootRef = useRef<HTMLDivElement | null>(null);
  const measureRef = useRef<HTMLDivElement | null>(null);
  const [measured, setMeasured] = useState<Measured | null>(null);
  // State, not a ref: the controls appear after the first plan, and their height then joins the measurement.
  const [nav, setNav] = useState<HTMLElement | null>(null);
  // With newestLast the page is counted from the end (0 is the newest page), so new items keep the newest page in view.
  const [page, setPage] = useState(0);
  const [fontsReady, setFontsReady] = useState(0);
  const List = ordered ? "ol" : "ul";

  useEffect(() => {
    let live = true;
    // Text measured before the bundled fonts load is wider or narrower than the final text.
    void document.fonts?.ready.then(() => {
      if (live) setFontsReady((n) => n + 1);
    });
    return () => {
      live = false;
    };
  }, []);

  useLayoutEffect(() => {
    const box = rootRef.current;
    const layer = measureRef.current;
    if (!fit || box === null || layer === null || typeof ResizeObserver === "undefined") return;
    const measure = () => {
      const measuredHeights = Array.from(layer.children, (child) => Math.ceil(child.getBoundingClientRect().height));
      const heights = uniformHeight ? items.map(() => measuredHeights[0] ?? 0) : measuredHeights;
      const available = Math.floor(box.clientHeight);
      const controls = nav === null ? CONTROLS_PX : Math.ceil(nav.getBoundingClientRect().height) + CONTROLS_GAP_PX;
      setMeasured((old) =>
        old !== null &&
        old.available === available &&
        old.controls === controls &&
        old.heights.length === heights.length &&
        old.heights.every((h, i) => h === heights[i])
          ? old
          : { heights, available, controls },
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(box);
    observer.observe(layer);
    if (nav !== null) observer.observe(nav);
    return () => observer.disconnect();
  }, [fit, items, fontsReady, uniformHeight, nav]);

  const plan: readonly PagePlan[] | null = (() => {
    if (!fit || measured === null || measured.heights.length !== items.length) return null;
    if (fitsWithoutPaging(measured.heights, measured.available, gap)) return null;
    const room = measured.available - measured.controls;
    return newestLast === null ? planPages(measured.heights, room, gap, keepIndex) : planPagesFromEnd(measured.heights, room, gap);
  })();
  const pageCount = plan?.length ?? 1;
  const current = plan === null ? 0 : newestLast === null ? shownPage(plan, page, active?.index ?? null) : clampPage(pageCount - 1 - page, pageCount);
  const turn = (to: number) => {
    const target = clampPage(to, pageCount);
    const first = plan?.[target]?.items[0];
    if (active !== null && first !== undefined) active.onChange(first);
    else setPage(newestLast === null ? target : pageCount - 1 - target);
  };
  const gestures = usePageGestures((direction) => turn(current + direction));

  const shown = plan?.[current] ?? null;
  const jumpPage = plan === null || jump === null ? -1 : pageOf(plan, jump.index);
  const measuredItems = uniformHeight ? items.slice(0, 1) : items;
  const visible = shown === null ? items.map((_, i) => i) : shown.items;
  const gapClass = gap === 0 ? "gap-0" : gap === 8 ? "gap-2" : "gap-3";

  return (
    <div ref={rootRef} data-pager="" className="relative flex min-h-0 min-w-0 flex-1 flex-col" style={{ touchAction: "pan-y" }} {...gestures}>
      <div className={`relative min-h-0 flex-1 ${fit ? "overflow-hidden" : ""} ${newestLast === null ? "" : "flex flex-col justify-end"}`}>
        <List aria-label={label} id={listboxId ?? undefined} role={listboxId === null ? undefined : "listbox"} className={`m-0 flex list-none flex-col p-0 ${gapClass}`}>
          {visible.map((index) => {
            const item = items[index];
            return item === undefined ? null : (
              <li key={itemKey(item, index)} role={listboxId === null ? undefined : "none"} data-pager-item="" className="min-w-0">
                {renderItem(item, index)}
              </li>
            );
          })}
          {shown?.kept === null || shown?.kept === undefined
            ? null
            : (() => {
                const item = items[shown.kept];
                return item === undefined ? null : (
                  <li key={`kept-${itemKey(item, shown.kept)}`} data-pager-item="" data-pager-kept="" className="relative min-w-0 before:absolute before:inset-x-0 before:-top-px before:border-t-2 before:border-dashed before:border-line before:content-['']">
                    {renderItem(item, shown.kept)}
                  </li>
                );
              })()}
        </List>
        {fit ? (
          // The measuring layer: the same items at the same width, invisible and out of the tab order.
          <div ref={measureRef} data-pager-measure="" aria-hidden="true" inert className="invisible absolute inset-x-0 top-0 flex flex-col">
            {measuredItems.map((item, index) => (
              <div key={itemKey(item, index)} className="min-w-0">
                {renderItem(item, index)}
              </div>
            ))}
          </div>
        ) : null}
      </div>
      {plan === null ? null : (
        // Read from the end, the earlier pages lie above the list, so the controls row goes there.
        <nav ref={setNav} aria-label={label} data-pager-controls="" className={`flex min-h-11 shrink-0 flex-wrap items-center justify-center gap-3 ${newestLast === null ? "mt-2" : "order-first mb-2"}`}>
          {newestLast === null ? (
            <IconButton
              label={m.common.pager.previous}
              icon={<ChevronLeft aria-hidden size={22} />}
              // aria-disabled, not disabled: a disabled button drops the keyboard focus on the first or last page.
              aria-disabled={current === 0}
              className={END_CLASSES}
              data-pager-previous=""
              onClick={() => turn(current - 1)}
            />
          ) : (
            <Button variant="quiet" icon={<ChevronLeft aria-hidden size={22} />} aria-disabled={current === 0} className={END_CLASSES} data-pager-previous="" onClick={() => turn(current - 1)}>
              {newestLast.earlier}
            </Button>
          )}
          {/* Read from the end, "Earlier messages" says where the pages go, so the position is for a screen reader only and the row fits a side column. */}
          <p aria-live="polite" className={newestLast === null ? "tabular min-w-16 text-center font-display font-semibold text-muted" : "sr-only"}>
            {m.common.pager.position(current + 1, pageCount)}
          </p>
          <IconButton
            label={newestLast === null ? m.common.pager.next : newestLast.later}
            icon={<ChevronRight aria-hidden size={22} />}
            aria-disabled={current === pageCount - 1}
            className={END_CLASSES}
            data-pager-next=""
            onClick={() => turn(current + 1)}
          />
          {/* Shown on every page, so the row keeps its height while the pages turn; on the page it leads to, it does nothing. */}
          {jump === null || jumpPage < 0 ? null : (
            <Button variant="secondary" aria-disabled={jumpPage === current} className={END_CLASSES} data-pager-jump="" onClick={() => turn(jumpPage)}>
              {jump.label}
            </Button>
          )}
        </nav>
      )}
    </div>
  );
}
