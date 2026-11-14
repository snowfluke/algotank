// One tour on a screen: reads its state (guideStore.ts), lets tourDriver.ts decide when
// it starts, pauses and resumes, finds the step's target on the screen, and draws the
// coach mark (ui/CoachMark.tsx). A screen renders <Tour> with what only it knows: whether
// the tour's phase is on, whether this device is eligible, which occurrence of the phase
// this is, and the clock. Tours never delay, pause or block the game (section 2b): the
// tour follows the screen, never the other way round.

import { useEffect, useRef, useState } from "react";
import { useMessages } from "../i18n/I18nProvider.tsx";
import { CoachMark, firstShown } from "../ui/CoachMark.tsx";
import { guideStore, useTourState } from "./guideStore.ts";
import { advanceEvents, driveEvent, type TourClock } from "./tourDriver.ts";
import { stepOf } from "./tourMachine.ts";
import { PROGRESS_ON_SCREEN, readingSeconds, tourSteps, type TourId, type TourVariant } from "./tours.ts";

export interface TourProps {
  readonly id: TourId;
  readonly variant?: TourVariant;
  /** The tour's phase is on the screen now. */
  readonly phaseOn: boolean;
  /** The device may start this tour (a first-timer, a first visit). Read only to start it. */
  readonly eligible: boolean;
  /** Names this occurrence of the phase, such as the room's frame key. Untimed places pass a constant. */
  readonly occurrence: string;
  readonly clock: TourClock;
  /** The player finished the last step (not skipped). */
  readonly onFinish?: () => void;
}

/** How often the tour looks for its target: the target can appear with a tab, a page or a step. */
const LOOK_MS = 250;

export function Tour({ id, variant, phaseOn, eligible, occurrence, clock, onFinish }: TourProps) {
  const m = useMessages();
  const g = m.guide;
  const state = useTourState(id);
  const steps = tourSteps(id, variant);
  const index = stepOf(state);
  const step = index === null ? undefined : steps[index];
  const text = step === undefined ? null : g.steps[step.key];
  const seconds = text === null ? null : readingSeconds(text.text);
  const active = phaseOn && (state.kind === "running" || state.kind === "waiting") && step !== undefined;
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const [way, setWay] = useState<HTMLElement | null>(null);
  // The step that has been on the screen in this occurrence: it runs to its end whatever the clock says.
  const shown = useRef<string | null>(null);
  const stepKey = `${occurrence}:${index ?? "none"}`;
  const latest = useRef({ steps, clock, occurrence, onFinish });
  latest.current = { steps, clock, occurrence, onFinish };

  const secondsLeft = clock.kind === "timed" ? clock.secondsLeft : null;
  useEffect(() => {
    const event = driveEvent({ state, phaseOn, eligible, occurrence, clock: clock.kind === "timed" ? { kind: "timed", secondsLeft } : clock, stepSeconds: seconds, entering: shown.current !== stepKey });
    if (event !== null) guideStore.dispatch(id, event);
    // `clock` is rebuilt on every render; its content is secondsLeft.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, state, phaseOn, eligible, occurrence, secondsLeft, seconds, stepKey]);

  // Looks for the target while the step is active; waiting shows the pill instead of pointing at nothing.
  useEffect(() => {
    if (!active || step === undefined) {
      setTarget(null);
      setWay(null);
      return;
    }
    const look = () => {
      const found = firstShown(step.targets);
      setTarget(found);
      setWay(found === null ? firstShown(step.way ?? []) : null);
      guideStore.dispatch(id, { type: found === null ? "lose" : "find" });
    };
    look();
    const timer = setInterval(look, LOOK_MS);
    return () => clearInterval(timer);
  }, [active, step, id]);

  const visible = active && state.kind === "running" && target !== null;
  useEffect(() => {
    if (visible) shown.current = stepKey;
  }, [visible, stepKey]);

  function advance(): void {
    const { steps: all, clock: now, occurrence: here, onFinish: finished } = latest.current;
    let last = guideStore.stateOf(id);
    for (const event of advanceEvents(last, all, now, here)) last = guideStore.dispatch(id, event) ?? last;
    if (last.kind === "finished") finished?.();
  }

  // A "look" step in a timed phase moves on by itself when its reading time is over.
  const timed = clock.kind === "timed";
  useEffect(() => {
    if (!visible || step?.done.kind !== "look" || !timed || seconds === null) return;
    const timer = setTimeout(advance, seconds * 1000);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, stepKey, timed, seconds]);

  // A "do" step moves on when the player taps the thing, or when the screen signals it.
  useEffect(() => {
    if (!active || step === undefined) return;
    const done = step.done;
    if (done.kind === "tap") {
      const onClick = (event: MouseEvent) => {
        if (event.target instanceof Element && event.target.closest(done.selector) !== null) advance();
      };
      document.addEventListener("click", onClick, true);
      return () => document.removeEventListener("click", onClick, true);
    }
    if (done.kind === "signal") return guideStore.onSignal((signal) => signal === done.signal && advance());
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, step]);

  // Escape skips, unless something on the page used it first (a step sheet goes back, a dialog closes).
  useEffect(() => {
    if (!active) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented || document.querySelector("dialog[open]") !== null) return;
      guideStore.dispatch(id, { type: "skip" });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, id]);

  if (!active || step === undefined || text === null || index === null) return null;
  const single = steps.length === 1;
  const last = index === steps.length - 1;
  return (
    <CoachMark
      key={stepKey}
      target={state.kind === "running" ? target : null}
      way={way}
      counter={single || PROGRESS_ON_SCREEN.has(id) ? null : g.counter(index + 1, steps.length)}
      text={text.text}
      where={text.where}
      label={g.calloutLabel}
      preferDock={step.dock === true}
      next={step.done.kind === "look" ? { label: single ? m.common.close : last ? g.finish : g.next, finish: last, onNext: advance } : null}
      skip={single ? null : { label: g.skip, onSkip: () => guideStore.dispatch(id, { type: "skip" }) }}
    />
  );
}
