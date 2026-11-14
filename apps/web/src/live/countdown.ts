// Whole seconds until a time the stream state anchored (the first turn of a round,
// or the server's next step). The state holds absolute times, so this hook only
// re-renders while the time lies ahead and needs no clock from the server.

import { useEffect, useState } from "react";

/** Whole seconds left, rounded up, or null when the time is unknown or has passed. */
export function secondsUntil(at: number | null, now: number): number | null {
  if (at === null) return null;
  const left = Math.ceil((at - now) / 1000);
  return left > 0 ? left : null;
}

const STEP_MS = 200;

export function useSecondsUntil(at: number | null): number | null {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    setNow(Date.now());
    if (at === null) return;
    const timer = setInterval(() => {
      const next = Date.now();
      setNow(next);
      if (next >= at) clearInterval(timer);
    }, STEP_MS);
    return () => clearInterval(timer);
  }, [at]);
  return secondsUntil(at, now);
}
