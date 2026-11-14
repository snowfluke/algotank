// Measures how many CSS pixels one square of the board gets, so the board picks
// the tank detail and decides whether labels can be read. At 64 players on a
// 390px phone one square is about 10 to 15px wide: a two-letter label is then
// smaller than 5px and only adds noise, so the scoreboard names the tanks instead.

import { useEffect, useRef, useState, type RefObject } from "react";

/**
 * Pixels per square of an SVG drawn with `meet` scaling, or null without a view box.
 * `span` is the view box in squares, wall included. An empty box (a board in a hidden
 * tab, which stays mounted for its sound) gives 0: the board then draws no tanks.
 */
export function cellPixels(boxWidth: number, boxHeight: number, spanX: number, spanY: number): number | null {
  if (spanX <= 0 || spanY <= 0) return null;
  if (boxWidth <= 0 || boxHeight <= 0) return 0;
  return Math.min(boxWidth / spanX, boxHeight / spanY);
}

/**
 * `ref` goes on the SVG. Before the first measurement, and where ResizeObserver
 * does not exist (a server render), the size is null; while the board is hidden it is 0.
 */
export function useCellPixels(spanX: number, spanY: number): { ref: RefObject<SVGSVGElement | null>; cellPx: number | null } {
  const ref = useRef<SVGSVGElement | null>(null);
  const [cellPx, setCellPx] = useState<number | null>(null);

  useEffect(() => {
    const svg = ref.current;
    if (svg === null || typeof ResizeObserver === "undefined") return;
    const measure = () => {
      const box = svg.getBoundingClientRect();
      const px = cellPixels(box.width, box.height, spanX, spanY);
      // Whole pixels, so a resize of a fraction of a pixel does not render the board again.
      setCellPx(px === null ? null : Math.floor(px));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(svg);
    return () => observer.disconnect();
  }, [spanX, spanY]);

  return { ref, cellPx };
}
