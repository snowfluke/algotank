// Release is a wall-clock rule of the live game (85-ultimates.md), shared by server and browser.
export const ULTIMATES_FROM = Date.parse("2026-11-22T00:00:00+07:00");

export function ultimatesOn(nowMs: number): boolean {
  return nowMs >= ULTIMATES_FROM;
}
