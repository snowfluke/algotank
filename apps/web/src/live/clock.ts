// Time left in a round. The server sends ticks, so the clock is the ticks left
// times the tick length, and it needs no timer of its own in the browser.

import type { PublicSnapshot } from "@game/arena";

export function timeLeftMs(snapshot: Pick<PublicSnapshot, "tick" | "ticksTotal">, tickMs: number): number {
  return Math.max(0, snapshot.ticksTotal - snapshot.tick) * tickMs;
}

/** Whole seconds rounded up, as m:ss. */
export function formatClock(ms: number): string {
  const totalSeconds = Math.ceil(Math.max(0, ms) / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}
