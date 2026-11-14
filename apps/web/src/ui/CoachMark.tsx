// A coach mark (docs/specs/revamp/65-guidance.md, section 2): a thick guide-coloured ring
// that pulses slowly around one element, a light dim over the rest of the screen, and a
// small callout next to the element with one sentence, the controls and the step counter.
// While the element is not on the screen, a small pill says where to go instead.
//
// - Nothing here traps the player: the ring and the dim let every tap through
//   (pointer-events: none), so the element and everything else stay usable.
// - The callout is a non-modal region; Tab moves from the element into the callout and on
//   to whatever follows the element, so it is reachable right after the element.
// - The callout's place is ui/CoachPlacement.ts: beside the element, never over it, never
//   off the screen, where it covers the fewest other controls. When no side has room, or the
//   step asks for it, it goes into a `data-coach-dock` slot that the screen provides for it
//   (in the page's flow, so the screen gave it room by design: the workshop's style picker,
//   the laptop home page). Docking anywhere else would squeeze a pane that has no room to
//   spare, so a callout may cover other controls for its one step. It never meets the
//   KEEP_CLEAR boxes: the bottom bar with its tabs, a room's countdown clock, what a screen
//   marks with `data-coach-keep-clear`, and the player's own tank on a room's board (with its
//   "You" label), so the first-round tour never hides the tank it talks about; the audit checks
//   the same list (no-scroll-audit.mjs, rule e). The where-to-go pill is placed the same way.
// - It renders nothing on the server (the tests) and draws itself into document.body.

import { X } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { playSound } from "../sound/player.ts";
import { Button } from "./Button.tsx";
import { placeCallout, placePill, type Rect } from "./CoachPlacement.ts";
import { LAPTOP_QUERY } from "./layout.ts";

export interface CoachMarkProps {
  /** The element the step points at, or null while it is not on the screen (the pill shows). */
  readonly target: HTMLElement | null;
  /** While the target is missing: the element that leads to it (a tab), so the pill sits beside it. */
  readonly way: HTMLElement | null;
  /** "2 of 5", or null for a single cue. */
  readonly counter: string | null;
  readonly text: string;
  /** Where to go while the target is missing, one short sentence. */
  readonly where: string;
  /** The callout's region name for a screen reader ("Tour"). */
  readonly label: string;
  /**
   * Next (or Finish) on a "look" step; null on a "do" step, which moves on when the player does it.
   * `finish`: the button ends the tour (its last step), so the callout leaves out Skip, which would do the same.
   */
  readonly next: { readonly label: string; readonly finish: boolean; onNext(): void } | null;
  /** "Skip the tour"; null for a single cue, whose one button closes it. The where-to-go pill always shows it. */
  readonly skip: { readonly label: string; onSkip(): void } | null;
  /** Use the screen's `data-coach-dock` slot when there is one, even where a place beside the target fits. */
  readonly preferDock?: boolean;
}

/** The callout shows "Skip the tour" unless the step has none (a single cue) or its button already ends the tour. */
export function calloutShowsSkip({ next, skip }: Pick<CoachMarkProps, "next" | "skip">): boolean {
  return skip !== null && next?.finish !== true;
}

/** How often a floating callout checks its place again: controls can appear under it without the target moving (a "do" step's When to Do switch). */
const REPLACE_MS = 500;
const RING_PAD = 6;
const GAP = 8;
const EDGE = 8;
const TEXTS = "p, h1, h2, h3, dt, dd";
const CONTROLS = 'a[href], button, input, select, textarea, summary, label, [role="button"], [role="tab"], [role="radio"], [role="switch"], [role="slider"], [role="combobox"], [role="option"]';
const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
/**
 * What a callout or pill never covers (fix 8 of 70-fixes-after-guidance.md), and the own tank on a room's board
 * (73-after-first-timer-test.md, row 8): only the room's arena pane, not the workshop's test match, whose board the
 * tour itself points at. The tank moves, and the callout checks its place every REPLACE_MS. The audit's rule (e)
 * holds the same list.
 */
export const KEEP_CLEAR = '[data-shell-bottom], [data-countdown-clock], [data-coach-keep-clear], [data-arena-pane] [data-self="true"], [data-arena-pane] [data-you-marker]';

/** Visible on the screen now: not hidden, not Pager's measuring copy, with a real box in the viewport. */
function isShown(element: Element): boolean {
  if (element.closest("[data-pager-measure], [hidden]") !== null) return false;
  if (typeof element.checkVisibility === "function" && !element.checkVisibility({ visibilityProperty: true })) return false;
  const box = element.getBoundingClientRect();
  return box.width > 1 && box.height > 1 && box.bottom > 0 && box.right > 0 && box.top < window.innerHeight && box.left < window.innerWidth;
}

/** The first visible element that matches one of the selectors, in their order. */
export function firstShown(selectors: readonly string[]): HTMLElement | null {
  for (const selector of selectors) {
    for (const element of document.querySelectorAll<HTMLElement>(selector)) if (isShown(element)) return element;
  }
  return null;
}

function rectOf(element: Element): Rect {
  const box = element.getBoundingClientRect();
  return { left: box.left, top: box.top, width: box.width, height: box.height };
}

/** What a callout should not cover (controls, or headings and sentences): every visible one outside the target and the callout. */
function obstaclesAround(target: HTMLElement | null, callout: HTMLElement, selector = CONTROLS): Rect[] {
  const out: Rect[] = [];
  for (const element of document.querySelectorAll(selector)) {
    if ((target !== null && target.contains(element)) || callout.contains(element) || !isShown(element)) continue;
    out.push(rectOf(element));
  }
  return out;
}

/** The visible keep-clear boxes. A box that holds the callout (a dock in its flow) does not count. */
function keepClearBoxes(callout: HTMLElement): Rect[] {
  return [...document.querySelectorAll(KEEP_CLEAR)].filter((element) => !callout.contains(element) && isShown(element)).map(rectOf);
}

/** Follows an element's box on every frame, so the ring stays on it while the page moves. */
function useTrackedRect(element: HTMLElement | null): Rect | null {
  const [rect, setRect] = useState<Rect | null>(null);
  useLayoutEffect(() => {
    if (element === null) {
      setRect(null);
      return;
    }
    let frame = 0;
    let last = "";
    const tick = () => {
      const next = rectOf(element);
      const key = [next.left, next.top, next.width, next.height, window.innerWidth, window.innerHeight].map(Math.round).join(",");
      if (key !== last) {
        last = key;
        setRect(next);
      }
      frame = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(frame);
  }, [element]);
  return rect;
}

function GuideButton({ children, onClick }: { readonly children: string; onClick(): void }) {
  return (
    <button
      type="button"
      onClick={() => {
        playSound("tap");
        onClick();
      }}
      className="press min-h-11 min-w-16 rounded-[var(--radius-control)] border-b-4 border-guide-deep bg-guide px-4 font-display font-semibold text-guide-ink [@media(hover:hover)]:hover:brightness-95"
    >
      {children}
    </button>
  );
}

export function CoachMark(props: CoachMarkProps) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  return createPortal(props.target === null ? <WherePill {...props} /> : <Mark {...props} target={props.target} />, document.body);
}

/**
 * The screen's slot for a callout nearest to the target: a "bottom" dock for a target in the lower
 * half of the screen, else a "top" one. An empty dock is display:none, so it is found by being on the
 * page; `data-coach-dock-when="laptop"` limits a dock to the laptop layout.
 */
function nearestDock(target: Rect | null): HTMLElement | null {
  const laptop = window.matchMedia(LAPTOP_QUERY).matches;
  const docks = [...document.querySelectorAll<HTMLElement>("[data-coach-dock]")].filter(
    (element) => element.closest("[hidden], [data-pager-measure]") === null && (element.dataset.coachDockWhen !== "laptop" || laptop),
  );
  const lower = target !== null && target.top + target.height / 2 > window.innerHeight / 2;
  return docks.find((element) => (element.dataset.coachDock === "bottom") === lower) ?? docks[0] ?? null;
}

function Mark({ target, counter, text, label, next, skip, preferDock = false }: CoachMarkProps & { readonly target: HTMLElement }) {
  const rect = useTrackedRect(target);
  const callout = useRef<HTMLElement | null>(null);
  const [place, setPlace] = useState<{ readonly kind: "float"; readonly left: number; readonly top: number } | { readonly kind: "dock"; readonly dock: HTMLElement } | null>(null);
  const [size, setSize] = useState<{ readonly width: number; readonly height: number } | null>(null);
  const [recheck, setRecheck] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setRecheck((n) => n + 1), REPLACE_MS);
    return () => clearInterval(timer);
  }, []);

  // The callout's own size decides where it fits; it changes with the text and the language.
  useLayoutEffect(() => {
    const element = callout.current;
    if (element === null) return;
    const measure = () => setSize((old) => (old !== null && old.width === element.offsetWidth && old.height === element.offsetHeight ? old : { width: element.offsetWidth, height: element.offsetHeight }));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [place?.kind]);

  useLayoutEffect(() => {
    const element = callout.current;
    if (rect === null || size === null || element === null) return;
    // A docked callout is in the page's flow and moves the target with it, so it stays docked for this step.
    if (place?.kind === "dock") return;
    const float = (left: number, top: number) =>
      setPlace((old) => (old?.kind === "float" && Math.round(old.left) === Math.round(left) && Math.round(old.top) === Math.round(top) ? old : { kind: "float", left, top }));
    const viewport = { width: window.innerWidth, height: window.innerHeight };
    const keepClear = keepClearBoxes(element);
    const placed = placeCallout({ target: rect, size, viewport, obstacles: obstaclesAround(target, element), texts: obstaclesAround(target, element, TEXTS), ringPad: RING_PAD, gap: GAP, edge: EDGE, keepClear });
    if (placed !== null && !preferDock) {
      float(placed.left, placed.top);
      return;
    }
    const dock = nearestDock(rect);
    if (dock !== null) {
      setPlace({ kind: "dock", dock });
      return;
    }
    if (placed !== null) {
      float(placed.left, placed.top);
      return;
    }
    const fallback = placePill({ size, viewport, obstacles: [], ringPad: RING_PAD, gap: GAP, edge: EDGE, anchor: null, keepClear });
    float(fallback.left, fallback.top);
  }, [rect, size, target, place?.kind, preferDock, recheck]);

  // Tab from the target goes into the callout, and from the callout's last control on to what follows the target.
  useEffect(() => {
    const focusables = (root: Element, self: boolean) => [...(self && root.matches(FOCUSABLE) ? [root] : []), ...root.querySelectorAll(FOCUSABLE)].filter((e): e is HTMLElement => e instanceof HTMLElement && isShown(e));
    const onKey = (event: KeyboardEvent) => {
      const box = callout.current;
      if (event.key !== "Tab" || box === null) return;
      const active = document.activeElement;
      if (!(active instanceof HTMLElement)) return;
      const inTarget = focusables(target, true);
      const inCallout = focusables(box, false);
      if (!event.shiftKey && target.contains(active) && active === inTarget.at(-1)) {
        event.preventDefault();
        inCallout[0]?.focus();
      } else if (box.contains(active) && event.shiftKey && active === inCallout[0]) {
        event.preventDefault();
        (inTarget.at(-1) ?? target).focus();
      } else if (box.contains(active) && !event.shiftKey && active === inCallout.at(-1)) {
        const all = focusables(document.body, false).filter((e) => !box.contains(e));
        let after = -1;
        all.forEach((e, i) => {
          if (target.contains(e)) after = i;
        });
        const following = all[after + 1];
        if (following !== undefined) {
          event.preventDefault();
          following.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [target]);

  const docked = place?.kind === "dock";
  const body = (
    <section
      ref={callout}
      role="region"
      aria-label={label}
      data-coach-callout=""
      data-coach-place={place?.kind === "dock" ? "dock" : place === null ? "measuring" : "float"}
      style={place?.kind === "float" ? { left: place.left, top: place.top } : undefined}
      className={`${docked ? "relative z-[41] w-full" : `fixed z-[41] w-[min(20rem,calc(100vw-1rem))] ${place === null ? "invisible left-0 top-0" : ""}`} flex shrink-0 flex-col gap-2 rounded-[var(--radius-card)] border-[3px] border-guide bg-panel p-3 text-ink shadow-[var(--shadow-raised)]`}
    >
      {/* The counter leads the sentence, so it is read first and the buttons keep one row. */}
      <p aria-live="polite" className="[overflow-wrap:anywhere]">
        {counter === null ? null : (
          <span data-coach-counter="" className="tabular mr-2 inline-block rounded-full bg-guide px-2.5 font-display font-semibold whitespace-nowrap text-guide-ink">
            {counter}
          </span>
        )}
        {text}
      </p>
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        {next === null ? null : <GuideButton onClick={next.onNext}>{next.label}</GuideButton>}
        {!calloutShowsSkip({ next, skip }) || skip === null ? null : (
          <Button variant="quiet" onClick={skip.onSkip}>
            {skip.label}
          </Button>
        )}
      </div>
    </section>
  );

  return (
    <>
      {rect === null ? null : <Ring rect={rect} />}
      {docked ? createPortal(body, place.dock) : body}
    </>
  );
}

/** The ring, and the dim of the rest of the screen as its shadow. Decoration only. */
function Ring({ rect }: { readonly rect: Rect }) {
  return (
    <div
      aria-hidden="true"
      data-coach-ring=""
      className="pointer-events-none fixed z-40 rounded-[calc(var(--radius-control)+6px)] border-4 border-guide shadow-[0_0_0_2px_var(--color-ink),0_0_0_200vmax_rgb(27_39_51/0.2)]"
      style={{ left: rect.left - RING_PAD, top: rect.top - RING_PAD, width: rect.width + 2 * RING_PAD, height: rect.height + 2 * RING_PAD }}
    >
      <div className="coach-pulse absolute -inset-2 rounded-[calc(var(--radius-control)+12px)] border-4 border-guide" />
    </div>
  );
}

/** "Open the Rules tab": while the target is missing, beside the way to it, or at the bottom of the screen. */
function WherePill({ way, where, skip }: CoachMarkProps) {
  const anchor = useTrackedRect(way);
  const pill = useRef<HTMLDivElement | null>(null);
  const [place, setPlace] = useState<{ readonly left: number; readonly top: number } | null>(null);
  const [size, setSize] = useState<{ readonly width: number; readonly height: number } | null>(null);
  // Measured again when the font arrives or the text changes, so the pill never ends past the screen's edge.
  useLayoutEffect(() => {
    const element = pill.current;
    if (element === null) return;
    const measure = () => setSize((old) => (old !== null && old.width === element.offsetWidth && old.height === element.offsetHeight ? old : { width: element.offsetWidth, height: element.offsetHeight }));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [where]);
  // A resized window (a phone turned, a laptop window dragged) moves the bottom of the screen.
  const [viewport, setViewport] = useState(() => ({ width: window.innerWidth, height: window.innerHeight }));
  useEffect(() => {
    const onResize = () => setViewport({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  useLayoutEffect(() => {
    const element = pill.current;
    if (element === null || size === null) return;
    setPlace(placePill({ size, viewport, obstacles: obstaclesAround(way, element), ringPad: 2, gap: GAP, edge: EDGE, anchor, keepClear: keepClearBoxes(element) }));
  }, [anchor, way, size, viewport]);
  if (where === "") return null;
  return (
    <div
      ref={pill}
      role="status"
      data-coach-pill=""
      style={place === null ? undefined : { left: place.left, top: place.top }}
      className={`fixed z-[41] flex max-w-[calc(100vw-1rem)] items-center gap-1 rounded-full border-b-4 border-guide-deep bg-guide py-1 pr-1 pl-4 font-semibold text-guide-ink shadow-[var(--shadow-raised)] ${place === null ? "invisible left-0 top-0" : ""}`}
    >
      <span className="min-w-0 [overflow-wrap:anywhere]">{where}</span>
      {skip === null ? null : <SkipIcon label={skip.label} onSkip={skip.onSkip} />}
    </div>
  );
}

function SkipIcon({ label, onSkip }: { readonly label: string; onSkip(): void }): ReactNode {
  return (
    <button type="button" aria-label={label} onClick={onSkip} className="press flex size-11 shrink-0 items-center justify-center rounded-full text-guide-ink [@media(hover:hover)]:hover:bg-guide-deep/20">
      <X aria-hidden size={20} strokeWidth={2.5} />
    </button>
  );
}
