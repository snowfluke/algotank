// A short confirmation at the bottom of the screen, one at a time, read out by
// a screen reader. Use it for an action that already happened and can be undone
// ("Rule removed. Undo"). For a state that lasts, use StatusBanner.
//
// Setup: <ToastProvider> wraps the app (main.tsx). Use: const toast = useToast();
// toast.show({ message: m.prep.ruleRemoved, onUndo: () => restore(rule) }).
//
// It sits above the page's bottom bar (AppShell's `data-shell-bottom`: the primary action
// and the tabs), so it never covers them; without a bar on the screen, at the bottom. Its
// place follows the bar on every frame (the bar of a room appears after a join's toast),
// and its region clips it at the bar's top, so its entrance never slides over the bar.
//
// A toast without Undo only tells something, so it lets taps through to what it covers (a
// pager's Next, "Leave arena") and the first tap anywhere closes it; before, it held those
// controls for 6 s (73-after-first-timer-test.md, row 9). It has no Dismiss button, which a tap
// would miss; it closes after its time like every toast.

import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import { useMessages } from "../i18n/I18nProvider.tsx";
import { startPausableTimer, type PausableTimer } from "./timer.ts";

/** Long enough to read a sentence and reach Undo with a thumb. */
const TOAST_MS = 6000;

/** A toast with Undo holds its place, because the person may want that button; any other toast lets taps through. */
export function toastLetsTapsThrough(request: Pick<ToastRequest, "onUndo">): boolean {
  return request.onUndo === undefined;
}

export interface ToastRequest {
  /** One sentence about what just happened. */
  readonly message: string;
  /** Shows an Undo button that runs this and closes the toast. */
  readonly onUndo?: () => void;
  /**
   * Runs once when the toast closes without Undo: its time runs out, the person dismisses
   * it, or another toast replaces it. For an action that waits for its Undo time to pass.
   */
  readonly onDone?: () => void;
}

interface ToastApi {
  show(request: ToastRequest): void;
  dismiss(): void;
}

const ToastContext = createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const api = useContext(ToastContext);
  if (api === null) throw new Error("useToast needs a <ToastProvider> above it (main.tsx has one).");
  return api;
}

interface Shown extends ToastRequest {
  readonly id: number;
}

/**
 * How far above the bottom of the viewport the toast sits: above the bottom bar when the
 * bar's top is on the screen (the fit layout), else 0. `barTop` is null without a bar.
 */
export function toastLift(barTop: number | null, viewportHeight: number): number {
  if (barTop === null || barTop >= viewportHeight) return 0;
  return Math.max(0, Math.round(viewportHeight - barTop));
}

/**
 * Keeps the toast region above the bottom bar while a toast shows: the bar appears with a page
 * (a room draws it after the join's toast) and changes height with its action and the tabs.
 * The place is written to the region's style in the frame callback itself, before that frame
 * paints; a React state update would land a frame later, with the toast over the bar.
 */
function useBottomBarLift(region: RefObject<HTMLDivElement | null>, active: boolean): void {
  useLayoutEffect(() => {
    const element = region.current;
    if (!active || element === null) return;
    let frame = 0;
    const measure = () => {
      const box = document.querySelector("[data-shell-bottom]")?.getBoundingClientRect();
      const lift = toastLift(box === undefined || box.height === 0 ? null : box.top, window.innerHeight);
      element.style.bottom = `${lift}px`;
      element.toggleAttribute("data-lifted", lift > 0);
      frame = requestAnimationFrame(measure);
    };
    measure();
    // ponytail: one box read per frame while a toast shows (at most 6 s); a shared bar-height store in AppShell would remove it.
    return () => cancelAnimationFrame(frame);
  }, [region, active]);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const m = useMessages();
  const [shown, setShown] = useState<Shown | null>(null);
  const timer = useRef<PausableTimer | null>(null);
  const nextId = useRef(0);
  // The toast on screen, read by the callbacks; its onDone runs once, when it closes without Undo.
  const current = useRef<Shown | null>(null);

  const finish = useCallback(() => {
    const done = current.current?.onDone;
    current.current = null;
    done?.();
  }, []);

  const dismiss = useCallback(() => {
    timer.current?.cancel();
    timer.current = null;
    finish();
    setShown(null);
  }, [finish]);

  const show = useCallback(
    (request: ToastRequest) => {
      finish();
      nextId.current += 1;
      const next = { ...request, id: nextId.current };
      current.current = next;
      setShown(next);
    },
    [finish],
  );

  // A new toast replaces the old one and starts its own timer.
  useEffect(() => {
    if (shown === null) return;
    const started = startPausableTimer(() => {
      finish();
      setShown(null);
    }, TOAST_MS);
    timer.current = started;
    return () => started.cancel();
  }, [shown, finish]);

  // The first tap anywhere closes a toast that lets taps through; the tap still reaches what it was meant for.
  const passThrough = shown !== null && toastLetsTapsThrough(shown);
  useEffect(() => {
    if (!passThrough) return;
    const close = () => dismiss();
    document.addEventListener("pointerdown", close, true);
    return () => document.removeEventListener("pointerdown", close, true);
  }, [passThrough, dismiss]);

  const api = useMemo(() => ({ show, dismiss }), [show, dismiss]);
  const region = useRef<HTMLDivElement | null>(null);
  useBottomBarLift(region, shown !== null);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        ref={region}
        aria-live="polite"
        data-toast-region=""
        // bottom and data-lifted come from useBottomBarLift. overflow-hidden: the region ends at the bar's top, so the toast's entrance (it rises from 12 px lower) is cut there and never drawn over the bar.
        className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex justify-center overflow-hidden px-4 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] data-lifted:pb-2"
      >
        {shown === null ? null : (
          <div
            key={shown.id}
            onMouseEnter={() => timer.current?.pause()}
            onMouseLeave={() => timer.current?.resume()}
            onFocus={() => timer.current?.pause()}
            onBlur={() => timer.current?.resume()}
            data-toast-pass-through={passThrough ? "" : undefined}
            className={`${passThrough ? "pointer-events-none" : "pointer-events-auto"} flex w-full max-w-md animate-rise flex-wrap items-center gap-x-3 gap-y-2 rounded-[var(--radius-card)] bg-ink py-2 pr-2 pl-4 text-white shadow-[var(--shadow-raised)]`}
          >
            <p className="min-w-0 flex-1 basis-40 py-2 [overflow-wrap:anywhere]">{shown.message}</p>
            {shown.onUndo === undefined ? null : (
              <button
                type="button"
                onClick={() => {
                  current.current = null;
                  shown.onUndo?.();
                  dismiss();
                }}
                className="press min-h-11 min-w-16 rounded-[var(--radius-control)] px-3 font-display font-semibold text-water-light hover:bg-white/10"
              >
                {m.common.undo}
              </button>
            )}
            {/* A toast that lets taps through has no Dismiss: a tap on it would land on the control under it, and any tap closes it. */}
            {passThrough ? null : (
              <button
                type="button"
                onClick={dismiss}
                className="press min-h-11 min-w-16 rounded-[var(--radius-control)] px-3 font-display font-semibold text-white/85 hover:bg-white/10"
              >
                {m.common.dismiss}
              </button>
            )}
          </div>
        )}
      </div>
    </ToastContext.Provider>
  );
}
