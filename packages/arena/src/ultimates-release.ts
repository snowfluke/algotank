// Release is a wall-clock rule of the live game (85-ultimates.md), shared by server and browser. Moved from
// 22 to 20 November 2026 (owner, 2026-11-20: "i think i'm gonna release it today, strip out the 22 november").
export const ULTIMATES_FROM = Date.parse("2026-11-20T00:00:00+07:00");

export function ultimatesOn(nowMs: number): boolean {
  return nowMs >= ULTIMATES_FROM;
}
