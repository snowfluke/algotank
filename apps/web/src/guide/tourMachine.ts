// The state machine of one tour (docs/specs/revamp/65-guidance.md, section 2). A pure
// reducer, so every legal transition is listed here and tested, and every other one is
// refused (the reducer returns null and the caller keeps the old state).
//
// States: notStarted, running (step n), waiting (step n, its target is not on the
// screen), paused (step n, until the next time the tour's phase comes), finished,
// skipped. Finished and skipped are terminal for every automatic event; only the
// player's "Show me around" leaves them.
//
// | From                | Event   | To                  | Actor                     | Guard                                                        |
// |---------------------|---------|---------------------|---------------------------|--------------------------------------------------------------|
// | notStarted          | start   | running 0           | the screen                | the device is eligible (a first-timer, a first visit)        |
// | any state           | replay  | running 0           | the player (Show me around)| none                                                        |
// | running n, waiting n| next n  | running n+1         | the player (Next), the    | the event names the current step; n+1 exists                 |
// |                     |         |                     | reading clock, a done step|                                                              |
// | running n, waiting n| next n  | finished            | same                      | n is the last step                                           |
// | running n           | lose    | waiting n           | the screen                | the step's target is not on the screen                      |
// | waiting n           | find    | running n           | the screen                | the target is back                                           |
// | running n, waiting n| pause k | paused n at k       | the screen                | the phase ended, or step n does not fit the time left, or a  |
// |                     |         |                     |                           | timed part of the tour is done; k names this phase occurrence|
// | paused n at k       | resume j| running n           | the screen                | the tour's phase is on and j differs from k (the next one)   |
// | running, waiting,   | skip    | skipped             | the player (Skip, Escape) | none                                                         |
// | paused              |         |                     |                           |                                                              |
//
// Persisted per tour id (guideStore.ts): waiting is stored as running, because the
// target is looked for again after a reload.

export type TourState =
  | { readonly kind: "notStarted" }
  | { readonly kind: "running"; readonly step: number }
  | { readonly kind: "waiting"; readonly step: number }
  | { readonly kind: "paused"; readonly step: number; readonly occurrence: string }
  | { readonly kind: "finished" }
  | { readonly kind: "skipped" };

export type TourEvent =
  | { readonly type: "start" }
  | { readonly type: "replay" }
  | { readonly type: "next"; readonly from: number }
  | { readonly type: "lose" }
  | { readonly type: "find" }
  | { readonly type: "pause"; readonly occurrence: string }
  | { readonly type: "resume"; readonly occurrence: string }
  | { readonly type: "skip" };

export const NOT_STARTED: TourState = { kind: "notStarted" };

/** The next state, or null when no rule allows the event in this state. `stepCount` is the tour's length. */
export function transition(state: TourState, event: TourEvent, stepCount: number): TourState | null {
  if (event.type === "replay") return { kind: "running", step: 0 };
  switch (state.kind) {
    case "notStarted":
      return event.type === "start" ? { kind: "running", step: 0 } : null;
    case "running":
    case "waiting":
      switch (event.type) {
        case "next":
          if (event.from !== state.step) return null;
          return state.step + 1 >= stepCount ? { kind: "finished" } : { kind: "running", step: state.step + 1 };
        case "lose":
          return state.kind === "running" ? { kind: "waiting", step: state.step } : null;
        case "find":
          return state.kind === "waiting" ? { kind: "running", step: state.step } : null;
        case "pause":
          return { kind: "paused", step: state.step, occurrence: event.occurrence };
        case "skip":
          return { kind: "skipped" };
        default:
          return null;
      }
    case "paused":
      if (event.type === "resume") return event.occurrence === state.occurrence ? null : { kind: "running", step: state.step };
      if (event.type === "skip") return { kind: "skipped" };
      return null;
    case "finished":
    case "skipped":
      return null;
  }
}

/** The step shown or kept, or null when the tour shows nothing and keeps no place. */
export function stepOf(state: TourState): number | null {
  return state.kind === "running" || state.kind === "waiting" || state.kind === "paused" ? state.step : null;
}

/** True while the tour has started and not ended: the workshop's checklist shows then. */
export function isUnderway(state: TourState): boolean {
  return stepOf(state) !== null;
}

/** Reads a stored state back; anything that is not a valid state of a tour of this length is "not started". */
export function parseTourState(value: unknown, stepCount: number): TourState {
  if (typeof value !== "object" || value === null) return NOT_STARTED;
  const record = value as Record<string, unknown>;
  const step = record.step;
  const validStep = typeof step === "number" && Number.isInteger(step) && step >= 0 && step < stepCount;
  switch (record.kind) {
    case "finished":
      return { kind: "finished" };
    case "skipped":
      return { kind: "skipped" };
    case "running":
    case "waiting":
      return validStep ? { kind: "running", step } : NOT_STARTED;
    case "paused":
      return validStep && typeof record.occurrence === "string" ? { kind: "paused", step, occurrence: record.occurrence } : NOT_STARTED;
    default:
      return NOT_STARTED;
  }
}
