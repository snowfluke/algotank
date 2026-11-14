// The timers of the server: round ticks, the pause before a round, the public arena
// countdowns and the sweeps. Every timer goes through a Scheduler, so a test can
// replace it with a manual one and run a whole game without waiting.

/** Milliseconds since 1970. One clock serves the store, the stream hub, the timers and the auth module. */
export type Clock = () => number;

export interface Scheduler {
  /** Calls `run` every `everyMs` milliseconds. Returns a function that stops it. */
  every(run: () => void, everyMs: number): () => void;
  /** Calls `run` once after `afterMs` milliseconds. Returns a function that cancels it. */
  after(run: () => void, afterMs: number): () => void;
}

export const realTimeScheduler: Scheduler = {
  every(run, everyMs) {
    const timer = setInterval(run, everyMs);
    return () => clearInterval(timer);
  },
  after(run, afterMs) {
    const timer = setTimeout(run, afterMs);
    return () => clearTimeout(timer);
  },
};
