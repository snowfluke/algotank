// The one authored celebration for the end of a game: the winner's tank in the
// middle with the crown, and the next two tanks giving it a water salute. The jets
// draw in once, drops fall for a few seconds, and the picture comes to rest. Under
// reduced motion it is the same picture, still. The `win` sound plays once when it
// appears, and only after the viewer touched the page (playSound's own rule).

import { useEffect, useRef } from "react";
import { Crown } from "../board/boardShapes.tsx";
import { playSound } from "../sound/player.ts";
import { TankShape } from "../tank/TankShape.tsx";
import { plainTankLook, type TankLook } from "../tank/look.ts";

export interface CelebrationProps {
  readonly winner: TankLook;
  /** The looks of second and third place, when they exist. */
  readonly saluting: readonly TankLook[];
  /** Draw the winner with the viewer's "you" ring. */
  readonly self?: boolean;
  /** An accessible description of the picture, for example "Ana's tank wins". */
  readonly label: string;
}

const SIDE_TANKS = [
  { x: 42, y: 92, angle: -55 },
  { x: 158, y: 92, angle: -125 },
] as const;
const WINNER = { x: 100, y: 78 };
const SIDE_SCALE = 2.2;
const NOZZLE = 5.2;

function nozzle(x: number, y: number, angle: number): { x: number; y: number } {
  const r = (angle * Math.PI) / 180;
  return { x: x + NOZZLE * SIDE_SCALE * Math.cos(r), y: y + NOZZLE * SIDE_SCALE * Math.sin(r) };
}

/** Drops that fall around the winner: x, delay in ms. Fixed, so every viewer sees the same picture. */
const DROPS = [
  [70, 0],
  [82, 380],
  [94, 140],
  [106, 520],
  [118, 260],
  [130, 640],
  [76, 760],
  [124, 900],
] as const;

const STYLE = `
.cel-jet { stroke-dasharray: 1; stroke-dashoffset: 0; animation: cel-draw 700ms var(--ease-out-expo, ease-out) 200ms backwards; }
.cel-drop { animation: cel-fall 1100ms ease-in 3 both; }
.cel-winner { animation: cel-hop 600ms var(--ease-back, ease-out) 3 both; transform-box: fill-box; transform-origin: 50% 100%; }
@keyframes cel-draw { from { stroke-dashoffset: 1; } to { stroke-dashoffset: 0; } }
@keyframes cel-fall { 0% { transform: translateY(-8px); opacity: 0; } 20% { opacity: 1; } 100% { transform: translateY(34px); opacity: 0; } }
@keyframes cel-hop { 0%, 100% { transform: translateY(0); } 40% { transform: translateY(-5px); } }
@media (prefers-reduced-motion: reduce) {
  .cel-jet { animation: none; }
  .cel-drop { animation: none; opacity: 1; transform: translateY(14px); }
  .cel-winner { animation: none; }
}
`;

export function Celebration({ winner, saluting, self = false, label }: CelebrationProps) {
  const played = useRef(false);
  useEffect(() => {
    if (played.current) return;
    played.current = true;
    playSound("win");
  }, []);

  const sides = SIDE_TANKS.slice(0, saluting.length).map((pos, i) => ({ ...pos, look: saluting[i] ?? plainTankLook(1) }));
  return (
    <svg viewBox="0 0 200 120" role="img" aria-label={label} className="block h-auto w-full max-w-full overflow-visible">
      <style>{STYLE}</style>
      <rect x={4} y={60} width={192} height={58} rx={12} style={{ fill: "var(--color-arena-floor)" }} />
      {sides.map((side) => {
        const from = nozzle(side.x, side.y, side.angle);
        const top = { x: (from.x + WINNER.x) / 2, y: 6 };
        const to = { x: WINNER.x + (side.x < WINNER.x ? -10 : 10), y: WINNER.y - 22 };
        const d = `M${from.x} ${from.y} Q${top.x} ${top.y} ${to.x} ${to.y}`;
        return (
          <g key={side.x}>
            <path className="cel-jet" pathLength={1} d={d} fill="none" strokeWidth={4} strokeLinecap="round" style={{ stroke: "var(--color-water)" }} />
            <path className="cel-jet" pathLength={1} d={d} fill="none" strokeWidth={1.4} strokeLinecap="round" style={{ stroke: "var(--color-water-light)" }} />
          </g>
        );
      })}
      {saluting.length === 0
        ? null
        : DROPS.map(([x, delay], i) => (
            <circle key={`${x}-${delay}`} className="cel-drop" cx={x} cy={WINNER.y - 40 + (i % 3) * 7} r={1.8} style={{ fill: "var(--color-water)", animationDelay: `${delay + 700}ms` }} />
          ))}
      {sides.map((side) => (
        <g key={`tank-${side.x}`} transform={`translate(${side.x} ${side.y}) scale(${SIDE_SCALE})`}>
          <TankShape look={side.look} angle={side.angle} />
        </g>
      ))}
      <g className="cel-winner">
        <g transform={`translate(${WINNER.x} ${WINNER.y}) scale(3.2)`}>
          <TankShape look={winner} angle={-90} self={self} />
          <g transform="translate(0 -7.4) scale(1.3)">
            <Crown />
          </g>
        </g>
      </g>
    </svg>
  );
}
