// The page's part of the usage numbers (docs/specs/revamp/81-metrics.md, K1a): it sends a named
// event, and nothing else, to POST /api/metrics/event. No cookie, no identifier and no free text:
// the body is a name and a label from the lists in packages/arena/src/metrics-protocol.ts.
//
// The first visit (FIRST_TIMER_STEPS) is reported once per device and in order. The device keeps
// the list of steps it reported in localStorage (PREFERENCE_KEYS.firstVisitPath), only so it does
// not report a step twice; the list never leaves the browser.
//
// | Path state     | Event              | Guard                                        | Next state            |
// |----------------|--------------------|----------------------------------------------|-----------------------|
// | not started    | openedHome         | the device never finished a game             | [openedHome]          |
// | [s1 .. sk]     | step k+1           | the step is the one after sk                 | [s1 .. sk, step k+1]  |
// | anything else  | any                | -                                            | unchanged, not sent   |
// Terminal state: all six steps reported. A blocked store reports nothing, because it cannot
// tell a step it already sent.

import { FIRST_TIMER_STEPS, type FirstTimerStep, type MetricEventRequest } from "@game/arena";
import { PREFERENCE_KEYS, readPreference, writePreference } from "../app/preferences.ts";
import { hasFinishedGame } from "../publicplay/firstGame.ts";
import { browserStore, type KeyValueStore } from "../session/storage.ts";

export function sendMetricEvent(event: MetricEventRequest): void {
  try {
    void fetch("/api/metrics/event", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(event), keepalive: true }).catch(() => {
      // Dropped on purpose: a lost count must never show an error to a player or retry over a weak connection.
    });
  } catch {
    // A browser without fetch (a test renderer) counts nothing; play goes on.
  }
}

function readPath(store: KeyValueStore): FirstTimerStep[] | null {
  const raw = readPreference(store, PREFERENCE_KEYS.firstVisitPath);
  if (raw === null) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.every((step, i) => step === FIRST_TIMER_STEPS[i])) return parsed as FirstTimerStep[];
  } catch {
    // A damaged list ends the path for this device, so no step is reported twice.
  }
  return [...FIRST_TIMER_STEPS];
}

/** Reports `step` of the first visit when the table above allows it. */
export function reachStep(step: FirstTimerStep, store: KeyValueStore | null = browserStore(), finishedGame: () => boolean = hasFinishedGame): boolean {
  if (store === null) return false;
  const path = readPath(store);
  const next = step === "openedHome" ? path === null && !finishedGame() : path !== null && FIRST_TIMER_STEPS[path.length] === step;
  if (!next) return false;
  if (!writePreference(store, PREFERENCE_KEYS.firstVisitPath, JSON.stringify([...(path ?? []), step]))) return false;
  sendMetricEvent({ name: "firstTimer", label: step });
  return true;
}
