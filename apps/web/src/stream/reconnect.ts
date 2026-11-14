// When to reopen a closed event stream. A browser gives up on an EventSource
// after an HTTP error status (a proxy that answers 502 or 503 during a restart),
// so the page has to open a new one itself.

export const RETRY_FIRST_MS = 1000;
export const RETRY_MAX_MS = 30000;

/** Doubles the wait after each failed attempt, up to RETRY_MAX_MS. */
export function nextRetryDelayMs(previousMs: number): number {
  return Math.min(previousMs * 2, RETRY_MAX_MS);
}

export interface StreamErrorPlan {
  /** True when the page says that the connection dropped. */
  readonly sayReconnecting: boolean;
  /** When to ask whether the arena still exists, or null while the browser retries by itself. */
  readonly checkArenaInMs: number | null;
  /** How long to wait after an answer that the arena exists before a new stream opens. */
  readonly reopenAfterCheckMs: number;
}

/**
 * What the page does when the stream reports an error. A stream that never opened
 * may belong to an arena that does not exist (a wrong code answers 404, and the
 * browser gives up), so the page asks at once and keeps its loading state until
 * the answer. Every other failure says "the connection dropped".
 */
export function streamErrorPlan(everOpened: boolean, browserGaveUp: boolean, waitMs: number): StreamErrorPlan {
  // Either way one wait of `waitMs` sits between two streams, so a server that keeps failing is not asked in a tight loop.
  // An HTTP error before the first open may be a wrong code, so the page asks at once and stays quiet until the answer.
  if (!everOpened && browserGaveUp) return { sayReconnecting: false, checkArenaInMs: 0, reopenAfterCheckMs: waitMs };
  // The browser still retries by itself (the network is down): that is a connection problem worth saying.
  if (!everOpened) return { sayReconnecting: true, checkArenaInMs: null, reopenAfterCheckMs: 0 };
  return { sayReconnecting: true, checkArenaInMs: browserGaveUp ? waitMs : null, reopenAfterCheckMs: 0 };
}
