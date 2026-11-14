// One item at a time, with Previous and Next, dots that show the position, swipe,
// and the arrow keys. Use it where each item deserves the whole pane, such as one
// play style with its drawing large. For a list of rows, use Pager.
//
// The index is controlled by the screen, so the screen can open the carousel on the
// chosen item. Choosing an item is the item's own button; the carousel only moves.
// It fills its parent's height (give the parent one), and the item gets the rest of
// the height after the controls row: lay the item out with flex and min-h-0.
// The dots are a picture of the position for sighted people, not targets (eight 44px
// targets do not fit a 360px phone beside the buttons); the position text is read aloud.

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useId, type ReactNode } from "react";
import { useMessages } from "../i18n/I18nProvider.tsx";
import { IconButton } from "./IconButton.tsx";
import { clampPage, END_CLASSES } from "./paging.ts";
import { usePageGestures } from "./usePageGestures.ts";

export interface CarouselProps<T> {
  /** Names the carousel, for example "Play styles". */
  readonly label: string;
  readonly items: readonly T[];
  readonly itemKey: (item: T, index: number) => string;
  readonly renderItem: (item: T, index: number) => ReactNode;
  readonly index: number;
  readonly onIndexChange: (index: number) => void;
}

export function Carousel<T>({ label, items, itemKey, renderItem, index, onIndexChange }: CarouselProps<T>) {
  const m = useMessages();
  const base = useId();
  const count = items.length;
  const current = clampPage(index, count);
  const item = items[current];
  const go = (next: number) => {
    const target = clampPage(next, count);
    if (target !== current) onIndexChange(target);
  };
  const gestures = usePageGestures((direction) => go(current + direction));
  const position = m.common.carousel.position(current + 1, count);

  return (
    <section
      aria-roledescription="carousel"
      aria-label={label}
      data-carousel=""
      className="flex min-h-0 min-w-0 flex-1 flex-col gap-2"
      style={{ touchAction: "pan-y" }}
      {...gestures}
    >
      <div
        id={`${base}-slide`}
        role="group"
        aria-roledescription="slide"
        aria-label={position}
        data-carousel-slide={current}
        className="flex min-h-0 min-w-0 flex-1 flex-col"
      >
        {item === undefined ? null : <div key={itemKey(item, current)} className="flex min-h-0 min-w-0 flex-1 flex-col">{renderItem(item, current)}</div>}
      </div>
      <div className="flex min-h-11 shrink-0 flex-wrap items-center justify-center gap-3">
        <IconButton
          label={m.common.carousel.previous}
          icon={<ChevronLeft aria-hidden size={22} />}
          aria-disabled={current === 0}
          className={END_CLASSES}
          aria-controls={`${base}-slide`}
          data-carousel-previous=""
          onClick={() => go(current - 1)}
        />
        <span aria-hidden="true" className="flex min-w-0 items-center gap-1.5">
          {items.map((dotItem, i) => (
            <span
              key={itemKey(dotItem, i)}
              // The current dot is wider as well as blue, so the position does not depend on colour.
              className={`block h-2.5 rounded-full ${i === current ? "w-6 bg-water" : "w-2.5 bg-line-strong"}`}
            />
          ))}
        </span>
        <span className="sr-only" aria-live="polite">
          {position}
        </span>
        <IconButton
          label={m.common.carousel.next}
          icon={<ChevronRight aria-hidden size={22} />}
          aria-disabled={current === count - 1}
          className={END_CLASSES}
          aria-controls={`${base}-slide`}
          data-carousel-next=""
          onClick={() => go(current + 1)}
        />
      </div>
    </section>
  );
}
