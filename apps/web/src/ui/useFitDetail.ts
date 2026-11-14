// Fits a pane by leaving out optional detail, measured instead of guessed from the
// viewport. The pane renders its fullest version first (level 0); when its content is
// taller than its box, the hook moves to the next level before the browser paints, and
// so on until it fits or the last level is reached. A change of the box size or of
// `content` (the language, the text) starts again at level 0. Content that grows inside
// the element (an error sentence) moves to a briefer level when it no longer fits.
//
// Use it only for detail that a person can do without, such as the sentence under a
// title. Content that matters is paged (Pager, Carousel) or moved to a step, not dropped.
// In the scrolling fallback the level stays 0: the page grows instead.

import { useEffect, useLayoutEffect, useState } from "react";
import { useFitLayout } from "./layout.ts";

/** The next level, or the same one when the content fits or no level is left. Pure, for the test. */
export function nextDetailLevel(level: number, levels: number, contentHeight: number, boxHeight: number): number {
  return contentHeight > boxHeight + 1 && level < levels - 1 ? level + 1 : level;
}

/**
 * The level after a measurement of the page drawn at `drawn`, when `queued` is the level React
 * will draw next. A measurement says something only about the level it was taken at: when a
 * reset in the same commit queued level 0 while the page still shows level 1, applying it to 0
 * gave 1 again, React saw no change and drew nothing more, and the hook stayed on a level whose
 * content overflowed (the upgrade bench after 768 x 1024 then 1000 x 600 in a 22rem column,
 * 73-after-first-timer-test.md, row 12). So the queued level wins until the page shows it.
 */
export function measuredLevel(queued: number, drawn: number, levels: number, contentHeight: number, boxHeight: number): number {
  return queued === drawn ? nextDetailLevel(drawn, levels, contentHeight, boxHeight) : queued;
}

/**
 * `ref` (a callback ref) goes on the element whose content must fit its own height (it
 * needs a height of its own and `overflow: hidden` in the fit layout). It follows the
 * element when the screen unmounts and mounts it again (a step sheet opened and closed).
 * `levels` counts the versions the screen can draw; `content` is any value that changes
 * when the text changes.
 */
export function useFitDetail<T extends HTMLElement>(levels: number, content: unknown): { ref: (element: T | null) => void; level: number } {
  const fit = useFitLayout();
  const [element, setElement] = useState<T | null>(null);
  const [level, setLevel] = useState(0);
  const [round, setRound] = useState(0);

  // Start again from the fullest version when the box or the content changes.
  useLayoutEffect(() => {
    setLevel(0);
  }, [content, round, fit, element]);

  useLayoutEffect(() => {
    if (!fit || element === null) return;
    // `level` is the level this commit drew; the measurement belongs to it.
    const contentHeight = element.scrollHeight;
    const boxHeight = element.clientHeight;
    setLevel((queued) => measuredLevel(queued, level, levels, contentHeight, boxHeight));
  });

  useEffect(() => {
    if (!fit || element === null || typeof ResizeObserver === "undefined") return;
    let last = { width: element.clientWidth, height: element.clientHeight };
    const observer = new ResizeObserver(() => {
      const size = { width: element.clientWidth, height: element.clientHeight };
      if (size.width !== last.width || size.height !== last.height) {
        last = size;
        setRound((n) => n + 1);
        return;
      }
      // Same box, other content (an error sentence appeared): only check whether it still fits.
      // This never goes back to a fuller level, so the levels cannot flip back and forth.
      setLevel((current) => nextDetailLevel(current, levels, element.scrollHeight, element.clientHeight));
    });
    observer.observe(element);
    // The children's sizes change when content inside them changes; new children are observed as they come.
    const watchChildren = () => {
      for (const child of Array.from(element.children)) observer.observe(child);
    };
    watchChildren();
    const mutations = new MutationObserver(watchChildren);
    mutations.observe(element, { childList: true });
    let live = true;
    // Fallback fonts have other widths, so the fit is checked again with the bundled ones.
    void document.fonts?.ready.then(() => {
      if (live) setRound((n) => n + 1);
    });
    return () => {
      live = false;
      observer.disconnect();
      mutations.disconnect();
    };
  }, [fit, element, levels]);

  return { ref: setElement, level: fit ? level : 0 };
}
