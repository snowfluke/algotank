// Whether a pane is wide enough for two columns (the rules list beside the open rule,
// the play styles as a grid). Decided from the pane's own width, not the viewport's:
// the room may place the pane in a narrow middle column on a laptop.

import { useBoxSize } from "../ui/useBoxSize.ts";

/** Two columns of at least about 340px each, with the gap between them. */
const WIDE_PANE_PX = 720;

/** `width` is null before the first measurement and in a server render. */
export function usePaneWidth<T extends HTMLElement>() {
  const { ref, box } = useBoxSize<T>();
  return { ref, wide: box !== null && box.width >= WIDE_PANE_PX, width: box?.width ?? null };
}
