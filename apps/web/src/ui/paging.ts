// Pure rules behind Pager and Carousel: which items go on which page, and which
// key or swipe moves a page. Kept apart from the components so the test runner,
// which has no DOM, can check them.

/** One page of a Pager: item indexes in list order, and the kept item appended when it belongs to another page. */
export interface PagePlan {
  readonly items: readonly number[];
  /** The kept item (for example the viewer's row) shown at the end of a page it does not belong to, or null. */
  readonly kept: number | null;
}

/**
 * Splits items of measured heights into pages that each fit `available` px.
 * `gap` is the space between two items. With `keep`, every page leaves room for that
 * item, and a page that does not hold it shows it at the end, so it is always in view.
 * An item taller than a page gets a page of its own; it will not fit, so its component
 * must keep itself shorter than the pane (the pane contract).
 */
export function planPages(heights: readonly number[], available: number, gap: number, keep: number | null): readonly PagePlan[] {
  if (heights.length === 0) return [{ items: [], kept: null }];
  const keptIndex = keep !== null && keep >= 0 && keep < heights.length ? keep : null;
  const reserve = keptIndex === null ? 0 : (heights[keptIndex] ?? 0) + gap;
  const budget = Math.max(0, available - reserve);
  const pages: number[][] = [];
  let current: number[] = [];
  let used = 0;
  heights.forEach((height, index) => {
    const needed = current.length === 0 ? height : used + gap + height;
    if (current.length > 0 && needed > budget) {
      pages.push(current);
      current = [index];
      used = height;
      return;
    }
    current.push(index);
    used = needed;
  });
  pages.push(current);
  return pages.map((items) => ({ items, kept: keptIndex === null || items.includes(keptIndex) ? null : keptIndex }));
}

/**
 * The pages of a list read from its end (the chat, newest last): the last page holds the newest
 * items that fit, and the first page holds what is left over. Pages and items stay in list order.
 */
export function planPagesFromEnd(heights: readonly number[], available: number, gap: number): readonly PagePlan[] {
  const last = heights.length - 1;
  return planPages([...heights].reverse(), available, gap, null)
    .map((page) => ({ items: page.items.map((i) => last - i).reverse(), kept: null }))
    .reverse();
}

/** The page whose own items hold `index` (a kept item shown on other pages does not count), or -1. */
export function pageOf(plan: readonly PagePlan[], index: number): number {
  return plan.findIndex((page) => page.items.includes(index));
}

/**
 * The page a Pager shows. With an active item (the highlighted choice of an open Picker) it is
 * the page that holds that item, so the list opens on the current choice and follows the arrow
 * keys; otherwise it is the page the person turned to.
 */
export function shownPage(plan: readonly PagePlan[], page: number, activeIndex: number | null): number {
  const activePage = activeIndex === null ? -1 : pageOf(plan, activeIndex);
  return activePage >= 0 ? activePage : clampPage(page, plan.length);
}

/** True when every item fits at once, so the Pager needs no controls. */
export function fitsWithoutPaging(heights: readonly number[], available: number, gap: number): boolean {
  const total = heights.reduce((sum, height) => sum + height, 0) + gap * Math.max(0, heights.length - 1);
  return total <= available;
}

/** How Previous and Next look on the first and last page, where they do nothing (aria-disabled keeps the focus on them). */
export const END_CLASSES = "aria-disabled:cursor-not-allowed aria-disabled:text-muted";

/** Keeps a page number inside 0 to count - 1. */
export function clampPage(page: number, count: number): number {
  return Math.min(Math.max(0, page), Math.max(0, count - 1));
}

/** The page step of a key: Page Down and the right arrow go forward, Page Up and the left arrow go back. */
export function keyStep(key: string): -1 | 1 | null {
  switch (key) {
    case "ArrowRight":
    case "PageDown":
      return 1;
    case "ArrowLeft":
    case "PageUp":
      return -1;
    default:
      return null;
  }
}

/** A swipe must travel this many px sideways to count, so a tap or a small drift does not turn the page. */
const SWIPE_MIN_PX = 48;

/** The page step of a finished drag: a swipe to the left goes forward. A drag that is mostly vertical is not a swipe. */
export function swipeStep(dx: number, dy: number): -1 | 1 | null {
  if (Math.abs(dx) < SWIPE_MIN_PX || Math.abs(dx) < Math.abs(dy) * 1.5) return null;
  return dx < 0 ? 1 : -1;
}
