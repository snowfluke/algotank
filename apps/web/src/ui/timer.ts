// A one-shot timer that can pause and resume, for the toast: it waits while the
// person hovers or focuses it, so they have time to read it and press Undo.

export interface Clock {
  now(): number;
  setTimeout(run: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

export interface PausableTimer {
  pause(): void;
  resume(): void;
  cancel(): void;
}

export const browserClock: Clock = {
  now: () => Date.now(),
  setTimeout: (run, ms) => globalThis.setTimeout(run, ms),
  clearTimeout: (handle) => globalThis.clearTimeout(handle as ReturnType<typeof setTimeout>),
};

/** Starts at once. Pausing keeps the time that is left; resuming waits only that long. */
export function startPausableTimer(run: () => void, ms: number, clock: Clock = browserClock): PausableTimer {
  let remaining = ms;
  let startedAt = clock.now();
  let handle: unknown = clock.setTimeout(run, remaining);
  let running = true;
  return {
    pause() {
      if (!running) return;
      clock.clearTimeout(handle);
      remaining -= clock.now() - startedAt;
      running = false;
    },
    resume() {
      if (running) return;
      startedAt = clock.now();
      handle = clock.setTimeout(run, Math.max(0, remaining));
      running = true;
    },
    cancel() {
      clock.clearTimeout(handle);
      running = false;
    },
  };
}
