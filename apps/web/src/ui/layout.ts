// The two media queries of the no-scroll layout, for code. index.css defines the same
// queries as the `fit:` and `laptop:` variants for class names; change both together.
// Every query is in em, so a reader who enlarges the browser's default text gets the
// scrolling fallback instead of cut-off content.

import { useSyncExternalStore } from "react";

/** A screen has a fixed height that its panes must fit (360 x 560 CSS px or larger). Outside it the page scrolls. */
const FIT_QUERY = "(min-width: 22.5em) and (min-height: 35em)";
/** Panes may sit side by side (896 CSS px wide or more): the owner's 1000 x 600 window, not an upright tablet. */
export const LAPTOP_QUERY = "(min-width: 56em)";

function useMediaQuery(query: string, serverValue: boolean): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const list = window.matchMedia(query);
      list.addEventListener("change", onChange);
      return () => list.removeEventListener("change", onChange);
    },
    () => window.matchMedia(query).matches,
    () => serverValue,
  );
}

/**
 * True when the fixed-height layout applies. A server render (the tests) says false,
 * so a Pager there lists every item, which is also what the scrolling fallback shows.
 */
export function useFitLayout(): boolean {
  return useMediaQuery(FIT_QUERY, false);
}

/** True where a screen may place its panes side by side instead of behind BottomTabs. A server render says false (the phone layout). */
export function useLaptopLayout(): boolean {
  return useMediaQuery(LAPTOP_QUERY, false);
}
