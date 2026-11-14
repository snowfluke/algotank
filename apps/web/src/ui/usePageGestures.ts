// Keyboard and swipe page turning for Pager and Carousel. Arrow keys are left to the
// control that has focus when it uses them itself (a text field, a radio group, tabs).

import { useRef, type KeyboardEvent, type PointerEvent } from "react";
import { keyStep, swipeStep } from "./paging.ts";

/** Focus inside one of these keeps its own arrow keys. */
const OWN_ARROWS = 'input, textarea, select, [contenteditable="true"], [role="radiogroup"], [role="tablist"], [role="slider"], [role="listbox"], [role="menu"]';

export interface PageGestureHandlers {
  readonly onKeyDown: (event: KeyboardEvent<HTMLElement>) => void;
  readonly onPointerDown: (event: PointerEvent<HTMLElement>) => void;
  readonly onPointerUp: (event: PointerEvent<HTMLElement>) => void;
  readonly onPointerCancel: () => void;
}

/** Spread the result on the element that holds the pages. `step` gets -1 or 1. */
export function usePageGestures(step: (direction: -1 | 1) => void): PageGestureHandlers {
  const start = useRef<{ x: number; y: number } | null>(null);
  return {
    onKeyDown(event) {
      const direction = keyStep(event.key);
      if (direction === null || event.altKey || event.ctrlKey || event.metaKey) return;
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest(OWN_ARROWS) && (event.key === "ArrowLeft" || event.key === "ArrowRight")) return;
      event.preventDefault();
      step(direction);
    },
    onPointerDown(event) {
      // A mouse drag selects text; only touch and pen swipe.
      start.current = event.pointerType === "mouse" ? null : { x: event.clientX, y: event.clientY };
    },
    onPointerUp(event) {
      const from = start.current;
      start.current = null;
      if (from === null) return;
      const direction = swipeStep(event.clientX - from.x, event.clientY - from.y);
      if (direction !== null) step(direction);
    },
    onPointerCancel() {
      start.current = null;
    },
  };
}
