// The authored moment of the home page: five toy tanks roll onto a sandy arena,
// your tank (orange ring) shoots a jet of water at the red tank, the splash
// lands, the red tank wobbles and "+1" pops above yours. The red tank shoots
// back and falls short. The shots repeat every 4.5 s.
//
// The markup is the still frame (jet, splash and "+1" visible), and the motion is
// added only under prefers-reduced-motion: no-preference, so reduced motion gets
// a complete picture rather than an empty floor.

import { TankShape } from "../tank/TankShape.tsx";
import type { TankColour } from "../tank/colours.ts";

const COLUMNS = 10;
const ROWS = 6;
const CELL = 10;
const TANK_SCALE = 0.95;

interface SceneTank {
  readonly colour: TankColour;
  readonly x: number;
  readonly y: number;
  readonly angle: number;
  readonly self?: boolean;
  /** Where the tank rolls in from, relative to its square. */
  readonly from: readonly [number, number];
  readonly delayMs: number;
  /** Class of the inner group that carries the recoil or the hit wobble. */
  readonly role?: "shooter" | "target";
}

const TANKS: readonly SceneTank[] = [
  { colour: 1, x: 15, y: 35, angle: 0, self: true, from: [-40, 0], delayMs: 0, role: "shooter" },
  { colour: 2, x: 75, y: 35, angle: 180, from: [45, 0], delayMs: 120, role: "target" },
  { colour: 3, x: 45, y: 15, angle: 90, from: [0, -30], delayMs: 220 },
  { colour: 5, x: 85, y: 15, angle: 150, from: [30, -10], delayMs: 320 },
  { colour: 4, x: 45, y: 50, angle: -35, from: [0, 30], delayMs: 420 },
];

const SHOT = { from: 19.8, to: 70.2, y: 35 } as const;
const MISS = { from: 70.2, to: 42, y: 35 } as const;
const SPLASH_DROPS: readonly (readonly [number, number])[] = [
  [-4.5, -3.2],
  [-1.2, -5.2],
  [3.4, -4.1],
  [-4.8, 2.6],
  [0.8, 5.1],
  [4.2, 2.9],
];

const SCENE_CSS = `
.hs-anim { transform-box: fill-box; transform-origin: center; }
.hs-miss { opacity: 0; }
@media (prefers-reduced-motion: no-preference) {
  .hs-miss { opacity: 1; }
  .hs-roll { animation: hs-roll 900ms cubic-bezier(0.16, 1, 0.3, 1) both; animation-delay: var(--delay); }
  .hs-loop { animation-duration: 4.5s; animation-delay: 1.2s; animation-iteration-count: infinite; animation-fill-mode: both; animation-timing-function: ease-out; }
  .hs-jet { animation-name: hs-jet; }
  .hs-splash { animation-name: hs-splash; }
  .hs-target { animation-name: hs-hit; }
  .hs-shooter { animation-name: hs-recoil; }
  .hs-plus { animation-name: hs-plus; }
  .hs-miss-jet { animation-name: hs-miss-jet; }
  .hs-puff { animation-name: hs-puff; }
}
@keyframes hs-roll { from { transform: translate(var(--dx), var(--dy)); opacity: 0; } to { transform: none; opacity: 1; } }
@keyframes hs-jet { 0% { stroke-dashoffset: 54; opacity: 1; } 9% { stroke-dashoffset: 0; opacity: 1; } 24% { opacity: 1; } 32%, 100% { stroke-dashoffset: 0; opacity: 0; } }
@keyframes hs-splash { 0%, 8% { opacity: 0; transform: scale(0.3); } 12% { opacity: 1; } 32%, 100% { opacity: 0; transform: scale(1.35); } }
@keyframes hs-hit { 0%, 9% { transform: none; } 13% { transform: rotate(-10deg) translateX(1.2px); } 19% { transform: rotate(6deg); } 26%, 100% { transform: none; } }
@keyframes hs-recoil { 0% { transform: none; } 3% { transform: translateX(-1.8px); } 10%, 100% { transform: none; } }
@keyframes hs-plus { 0%, 10% { opacity: 0; transform: translateY(2px) scale(0.6); } 15% { opacity: 1; transform: translateY(-1px) scale(1.15); } 38% { opacity: 1; transform: translateY(-4px) scale(1); } 46%, 100% { opacity: 0; transform: translateY(-6px) scale(1); } }
@keyframes hs-miss-jet { 0%, 55% { stroke-dashoffset: 32; opacity: 1; } 62% { stroke-dashoffset: 0; opacity: 1; } 70% { opacity: 1; } 78%, 100% { stroke-dashoffset: 0; opacity: 0; } }
@keyframes hs-puff { 0%, 61% { opacity: 0; transform: scale(0.4); } 65% { opacity: 0.9; } 80%, 100% { opacity: 0; transform: scale(1.5); } }
`;

function Floor() {
  const width = COLUMNS * CELL;
  const height = ROWS * CELL;
  return (
    <g>
      <rect width={width} height={height} rx={5} style={{ fill: "var(--color-arena-floor)" }} />
      <g style={{ stroke: "var(--color-arena-grid)" }} strokeWidth={0.45}>
        {Array.from({ length: COLUMNS - 1 }, (_, i) => (
          <line key={`c${i}`} x1={(i + 1) * CELL} y1={0} x2={(i + 1) * CELL} y2={height} />
        ))}
        {Array.from({ length: ROWS - 1 }, (_, i) => (
          <line key={`r${i}`} x1={0} y1={(i + 1) * CELL} x2={width} y2={(i + 1) * CELL} />
        ))}
      </g>
    </g>
  );
}

function Jet({ from, to, y, className }: { from: number; to: number; y: number; className: string }) {
  const length = Math.abs(to - from) + 2;
  const d = `M ${from} ${y} Q ${(from + to) / 2} ${y - 1.6} ${to} ${y}`;
  return (
    <g className={`${className} hs-loop`} strokeLinecap="round" fill="none" strokeDasharray={`${length} ${length + 10}`}>
      <path d={d} strokeWidth={2.6} style={{ stroke: "var(--color-water)" }} />
      <path d={d} strokeWidth={0.8} stroke="#ffffff" strokeOpacity={0.7} />
    </g>
  );
}

export function HomeScene({ label }: { label: string }) {
  return (
    <svg viewBox={`-2 -6 ${COLUMNS * CELL + 4} ${ROWS * CELL + 8}`} role="img" aria-label={label} className="block size-full">
      <style>{SCENE_CSS}</style>
      <Floor />
      <Jet {...SHOT} className="hs-jet" />
      <g className="hs-miss">
        <Jet {...MISS} className="hs-miss-jet" />
      </g>
      {TANKS.map((tank) => (
        <g key={tank.colour} transform={`translate(${tank.x} ${tank.y}) scale(${TANK_SCALE})`}>
          <g
            className="hs-roll"
            style={{ ["--dx" as string]: `${tank.from[0]}px`, ["--dy" as string]: `${tank.from[1]}px`, ["--delay" as string]: `${tank.delayMs}ms` }}
          >
            <g className={tank.role === undefined ? undefined : `hs-anim hs-loop hs-${tank.role}`}>
              <TankShape colour={tank.colour} angle={tank.angle} self={tank.self ?? false} />
            </g>
          </g>
        </g>
      ))}
      {/* The splash on the red tank */}
      <g transform={`translate(${SHOT.to + 1} ${SHOT.y})`}>
        <g className="hs-anim hs-splash hs-loop">
          <circle r={3.4} fill="none" strokeWidth={0.9} style={{ stroke: "var(--color-water)" }} />
          {SPLASH_DROPS.map(([dx, dy]) => (
            <circle key={`${dx},${dy}`} cx={dx} cy={dy} r={0.95} style={{ fill: "var(--color-water)" }} />
          ))}
        </g>
      </g>
      {/* The red tank's answer lands short: a puff on the floor */}
      <g transform={`translate(${MISS.to - 1} ${MISS.y})`} className="hs-miss">
        <g className="hs-anim hs-puff hs-loop">
          <circle r={2.4} fill="none" strokeWidth={0.6} strokeDasharray="1 1" style={{ stroke: "var(--color-water)" }} />
        </g>
      </g>
      {/* "+1" above your tank: a hit moves a point to the shooter */}
      <g transform="translate(15 22)">
        <g className="hs-anim hs-plus hs-loop">
          <text
            textAnchor="middle"
            dominantBaseline="central"
            fontFamily="var(--font-display)"
            fontWeight={700}
            fontSize={7}
            stroke="#ffffff"
            strokeWidth={1.4}
            paintOrder="stroke"
            style={{ fill: "var(--color-self-ink)" }}
            aria-hidden="true"
          >
            +1
          </text>
        </g>
      </g>
    </svg>
  );
}
