// What a tour does next on its own, from the state of the screen: start, pause when its
// phase ends or a step does not fit the time left, resume the next time the phase comes.
// Pure, so the rules of section 2b (a tour never fights the clock) are tested here; the
// Tour component (Tour.tsx) only feeds it and dispatches what it returns.

import type { TourEvent, TourState } from "./tourMachine.ts";
import { PHASE_MARGIN_SECONDS, type TourStep } from "./tours.ts";

/** An untimed place waits for the player (the workshop, a private lobby); a timed phase has a server clock. */
export type TourClock = { readonly kind: "untimed" } | { readonly kind: "timed"; readonly secondsLeft: number | null };

export interface DriveInput {
  readonly state: TourState;
  /** The tour's phase is on the screen now (the lobby for the lobby tour, and so on). */
  readonly phaseOn: boolean;
  /**
   * The start guard: a first-timer, a first visit. Read only to leave "not started", because
   * the first-timer flag turns false at the first result, before the lobby tour's second part.
   */
  readonly eligible: boolean;
  /** Names this occurrence of the phase (one lobby, one round), so a pause lasts until the next one. */
  readonly occurrence: string;
  readonly clock: TourClock;
  /** Reading time of the step the state holds, or null when it holds none. */
  readonly stepSeconds: number | null;
  /** The step is about to show for the first time in this occurrence; a step already shown runs to its end. */
  readonly entering: boolean;
}

function fits(clock: TourClock, seconds: number | null): boolean | null {
  if (clock.kind === "untimed") return true;
  if (clock.secondsLeft === null || seconds === null) return null;
  return seconds <= clock.secondsLeft - PHASE_MARGIN_SECONDS;
}

export function driveEvent(input: DriveInput): TourEvent | null {
  const { state, phaseOn, occurrence } = input;
  switch (state.kind) {
    case "notStarted":
      return phaseOn && input.eligible ? { type: "start" } : null;
    case "running":
    case "waiting":
      if (!phaseOn) return { type: "pause", occurrence };
      return input.entering && fits(input.clock, input.stepSeconds) === false ? { type: "pause", occurrence } : null;
    case "paused":
      return phaseOn && occurrence !== state.occurrence && fits(input.clock, input.stepSeconds) === true ? { type: "resume", occurrence } : null;
    case "finished":
    case "skipped":
      return null;
  }
}

/** The events of "the step is done": Next, and in a timed phase a pause after the last step one occurrence holds. */
export function advanceEvents(state: TourState, steps: readonly TourStep[], clock: TourClock, occurrence: string): TourEvent[] {
  if (state.kind !== "running" && state.kind !== "waiting") return [];
  const next: TourEvent = { type: "next", from: state.step };
  const endsPart = steps[state.step]?.pauseAfter === true && state.step + 1 < steps.length;
  return clock.kind === "timed" && endsPart ? [next, { type: "pause", occurrence }] : [next];
}
