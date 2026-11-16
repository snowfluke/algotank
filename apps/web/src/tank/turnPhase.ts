// One clock for the editor's turning tank (mytank/LiveTank.tsx): the hull's turn, the icon's
// counter-turn and the flag's flip (index.css) are three CSS animations, and each starts when
// its element appears. A flag or an icon picked in the middle of a turn appeared later and ran
// out of step: the flag showed upside down for part of every turn (owner, 2026-11-16). Each
// element therefore starts at the phase that this clock has reached, so all three agree.

import { useState, type CSSProperties } from "react";

/** One full turn, in ms. index.css names the same 14 s for a page without script. */
export const TURN_MS = 14_000;

/** The duration and a negative delay that place this animation at the clock's current phase. */
export function turnPhase(nowMs: number): CSSProperties {
  return { animationDuration: `${TURN_MS}ms`, animationDelay: `-${Math.round(nowMs % TURN_MS)}ms` };
}

/** The phase at the moment the element appears; it stays the same while the element lives. */
export function useTurnPhase(): CSSProperties {
  const [style] = useState(() => turnPhase(performance.now()));
  return style;
}
