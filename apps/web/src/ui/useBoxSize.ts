// Measures an element's content box, so a big-screen layout can size its text and
// columns from the room it really has instead of from a guess about the viewport.

import { useLayoutEffect, useRef, useState, type RefObject } from "react";
import type { Box } from "./fitList.ts";

/**
 * `ref` goes on the element. The size is null before the first measurement and in a
 * server render. Whole pixels, so a resize of a fraction of a pixel does not render again.
 */
export function useBoxSize<T extends HTMLElement>(): { ref: RefObject<T | null>; box: Box | null } {
  const ref = useRef<T | null>(null);
  const [box, setBox] = useState<Box | null>(null);

  // A layout effect measures before the first paint, so the list never shows at a wrong size.
  useLayoutEffect(() => {
    const element = ref.current;
    if (element === null || typeof ResizeObserver === "undefined") return;
    const measure = () => {
      const width = Math.floor(element.clientWidth);
      const height = Math.floor(element.clientHeight);
      setBox((old) => (old !== null && old.width === width && old.height === height ? old : { width, height }));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return { ref, box };
}
