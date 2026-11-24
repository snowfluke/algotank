// Runs a playout queue (playout.ts) on the browser's timers for one stream: it wakes at the next
// turn's slot and hands each batch of due messages to `show`, in order. Messages that arrive
// together show in one batch, because the queue is read in the next task after an arrival. A
// hidden tab runs timers once a minute at most, so a queue longer than PLAYOUT_MAX_QUEUED is shown
// on arrival instead of waiting for the timer.

import { EMPTY_PLAYOUT, PLAYOUT_MAX_QUEUED, receivePlayout, takeDuePlayout, type Arrival, type Playout, type Queued } from "./playout.ts";

export interface PlayoutRunner<T> {
  /** Queues one message that arrived now. */
  receive(arrival: Arrival<T>, tickMs: number): void;
  /** Stops the timer; queued messages are dropped with the stream. */
  stop(): void;
}

/** `show` gets each batch with the time it shows; it may set React state. */
export function startPlayout<T>(show: (due: readonly Queued<T>[], now: number) => void): PlayoutRunner<T> {
  let playout: Playout<T> = EMPTY_PLAYOUT;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const wake = () => {
    timer = null;
    const now = Date.now();
    const { playout: rest, due, nextAt } = takeDuePlayout(playout, now);
    playout = rest;
    if (nextAt !== null) timer = setTimeout(wake, Math.max(0, nextAt - now));
    if (due.length > 0) show(due, now);
  };
  return {
    receive(arrival, tickMs) {
      playout = receivePlayout(playout, arrival, Date.now(), tickMs);
      if (timer !== null) clearTimeout(timer);
      timer = null;
      if (playout.queue.length > PLAYOUT_MAX_QUEUED) wake();
      else timer = setTimeout(wake, 0);
    },
    stop() {
      if (timer !== null) clearTimeout(timer);
      timer = null;
    },
  };
}
