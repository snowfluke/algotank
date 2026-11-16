// The monthly page's clocks. Each one re-renders only the component that calls it: the day's clock
// used to tick in MonthlyPage, so every second rendered the whole view and the board of up to 512 tanks.

import { useEffect, useState } from "react";

const TICK_MS = 1000;

/** Date.now(), once a second. */
export function useNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(timer);
  }, []);
  return now;
}

/** Date.now(), once a second while `until` (a Date.now() time) is still ahead; then it stops. For a notice that ends by itself. */
export function useNowUntil(until: number): number {
  const [now, setNow] = useState(() => Date.now());
  const running = now < until;
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(timer);
  }, [running]);
  return now;
}
