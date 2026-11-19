// The authored moment of the home page, a 10 s loop (owner, 2026-11-19: show the ultimates and the
// arena that changes):
// | Part of the loop | What plays                                                                 |
// |------------------|----------------------------------------------------------------------------|
// | 0-20%            | your tank (orange ring) shoots the red tank: splash, wobble, "+1"          |
// | 24-38%           | the red tank shoots back and falls short                                   |
// | 36-48%           | your tank's ultimate is ready: the gold ring of the live board             |
// | 48-68%           | Dash: your tank zooms 3 squares, bumps the red tank, "+2"                  |
// | 62-94%           | the weather changes: rain falls, puddles form, then the sand dries again   |
// | 70-82%           | your tank drives back to its square, so the loop starts where it ended     |
//
// The markup is the still frame (jet, splash, "+1" and the ready ring visible), and the motion is
// added only under prefers-reduced-motion: no-preference, so reduced motion gets a complete
// picture rather than an empty floor.

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
/** Dash: 3 squares to the right, so your tank stops 3 squares short of the red tank and bumps it from there. */
const DASH = 30;
const RAIN: readonly (readonly [number, number])[] = [
  [6, 4], [22, 10], [37, 3], [52, 9], [66, 2], [81, 8], [94, 5],
  [12, 24], [29, 30], [58, 26], [73, 31], [88, 22], [8, 44], [34, 48], [62, 45], [90, 47],
];
const PUDDLES: readonly (readonly [number, number, number])[] = [
  [26, 22, 4.5], [60, 12, 3.6], [33, 55, 5], [68, 48, 4], [90, 30, 3.4], [8, 18, 3],
];
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
  .hs-loop { animation-duration: 10s; animation-delay: 1.2s; animation-iteration-count: infinite; animation-fill-mode: both; animation-timing-function: ease-out; }
  .hs-ready { animation-name: hs-ready; }
  .hs-ready-spin { animation: hs-ready-spin 6s linear infinite; }
  .hs-dash { animation-name: hs-dash; animation-timing-function: linear; }
  .hs-streak { animation-name: hs-streak; }
  .hs-bump { animation-name: hs-bump; }
  .hs-target-dash { animation-name: hs-hit-dash; }
  .hs-plus2 { animation-name: hs-plus2; }
  .hs-rain { animation-name: hs-rain; animation-timing-function: linear; }
  .hs-drop { animation: hs-drop 600ms linear infinite; }
  .hs-puddle { animation-name: hs-puddle; }
  .hs-jet { animation-name: hs-jet; }
  .hs-splash { animation-name: hs-splash; }
  .hs-target { animation-name: hs-hit; }
  .hs-shooter { animation-name: hs-recoil; }
  .hs-plus { animation-name: hs-plus; }
  .hs-miss-jet { animation-name: hs-miss-jet; }
  .hs-puff { animation-name: hs-puff; }
}
@keyframes hs-roll { from { transform: translate(var(--dx), var(--dy)); opacity: 0; } to { transform: none; opacity: 1; } }
@keyframes hs-jet { 0% { stroke-dashoffset: 54; opacity: 1; } 4% { stroke-dashoffset: 0; opacity: 1; } 11% { opacity: 1; } 14%, 100% { stroke-dashoffset: 0; opacity: 0; } }
@keyframes hs-splash { 0%, 4% { opacity: 0; transform: scale(0.3); } 5% { opacity: 1; } 14%, 100% { opacity: 0; transform: scale(1.35); } }
@keyframes hs-hit { 0%, 4% { transform: none; } 6% { transform: rotate(-10deg) translateX(1.2px); } 8.5% { transform: rotate(6deg); } 12%, 100% { transform: none; } }
@keyframes hs-recoil { 0% { transform: none; } 1.4% { transform: translateX(-1.8px); } 4.5%, 100% { transform: none; } }
@keyframes hs-plus { 0%, 4.5% { opacity: 0; transform: translateY(2px) scale(0.6); } 7% { opacity: 1; transform: translateY(-1px) scale(1.15); } 17% { opacity: 1; transform: translateY(-4px) scale(1); } 21%, 100% { opacity: 0; transform: translateY(-6px) scale(1); } }
@keyframes hs-miss-jet { 0%, 24% { stroke-dashoffset: 32; opacity: 1; } 28% { stroke-dashoffset: 0; opacity: 1; } 31% { opacity: 1; } 35%, 100% { stroke-dashoffset: 0; opacity: 0; } }
@keyframes hs-puff { 0%, 27% { opacity: 0; transform: scale(0.4); } 29% { opacity: 0.9; } 36%, 100% { opacity: 0; transform: scale(1.5); } }
@keyframes hs-ready { 0%, 34% { opacity: 0; transform: scale(0.6); } 38% { opacity: 1; transform: scale(1.1); } 40%, 47% { opacity: 1; transform: scale(1); } 50%, 100% { opacity: 0; transform: scale(1.4); } }
@keyframes hs-ready-spin { to { transform: rotate(360deg); } }
@keyframes hs-dash { 0%, 48% { transform: none; } 53%, 70% { transform: translateX(${DASH}px); } 80%, 100% { transform: none; } }
@keyframes hs-streak { 0%, 48% { opacity: 0; stroke-dashoffset: 1; } 50% { opacity: 1; } 53% { opacity: 1; stroke-dashoffset: 0; } 60%, 100% { opacity: 0; stroke-dashoffset: 0; } }
@keyframes hs-bump { 0%, 53% { opacity: 0; transform: scale(0.2) rotate(0deg); } 55% { opacity: 1; transform: scale(1.2) rotate(20deg); } 62% { opacity: 1; transform: scale(1) rotate(40deg); } 66%, 100% { opacity: 0; transform: scale(1.3) rotate(60deg); } }
@keyframes hs-hit-dash { 0%, 53% { transform: none; } 55% { transform: translateX(2.4px) rotate(8deg); } 58% { transform: rotate(-5deg); } 62%, 100% { transform: none; } }
@keyframes hs-plus2 { 0%, 54% { opacity: 0; transform: translateY(2px) scale(0.6); } 57% { opacity: 1; transform: translateY(-1px) scale(1.2); } 66% { opacity: 1; transform: translateY(-4px) scale(1); } 70%, 100% { opacity: 0; transform: translateY(-6px) scale(1); } }
@keyframes hs-rain { 0%, 62% { opacity: 0; } 67%, 86% { opacity: 1; } 94%, 100% { opacity: 0; } }
@keyframes hs-drop { from { transform: translate(0, -5px); } to { transform: translate(-1.5px, 5px); } }
@keyframes hs-puddle { 0%, 66% { opacity: 0; transform: scale(0.2); } 74%, 86% { opacity: 0.85; transform: scale(1); } 94%, 100% { opacity: 0; transform: scale(1.1); } }
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

/** The live board's ready ring (board/ultimates/UltimateEffect.tsx): gold, in the tank's own square. */
function ReadyRing() {
  return (
    <g className="hs-anim hs-loop hs-ready">
      {/* Outside your tank's orange ring, so it is not hidden under the hull. */}
      <circle r={7.6} opacity={0.3} style={{ fill: "var(--color-guide)" }} />
      <g className="hs-anim hs-ready-spin">
        <circle r={7.6} fill="none" strokeWidth={0.8} strokeDasharray="2.2 1.4" style={{ stroke: "var(--color-guide-deep)" }} />
      </g>
    </g>
  );
}

/** Rain over the arena while the condition changes: a blue tint, falling drops and puddles that form and dry. */
function Weather() {
  return (
    <g className="hs-loop hs-rain" opacity={0} aria-hidden="true">
      <rect width={COLUMNS * CELL} height={ROWS * CELL} rx={5} opacity={0.28} style={{ fill: "var(--color-water-light)" }} />
      {PUDDLES.map(([x, y, r]) => (
        <g key={`${x},${y}`} transform={`translate(${x} ${y})`}>
          <ellipse className="hs-anim hs-loop hs-puddle" rx={r} ry={r * 0.55} opacity={0} style={{ fill: "var(--color-water-light)", stroke: "var(--color-water)" }} strokeWidth={0.35} />
        </g>
      ))}
      {RAIN.map(([x, y], i) => (
        <g key={`${x},${y}`} transform={`translate(${x} ${y})`}>
          <line className="hs-drop" x1={0} y1={0} x2={-0.8} y2={2.6} strokeWidth={0.55} strokeLinecap="round" style={{ stroke: "var(--color-water)", animationDelay: `${(i % 5) * -120}ms` }} />
        </g>
      ))}
    </g>
  );
}

/** Dash: three speed lines behind your tank, a star where it bumps the red tank, and "+2". */
function DashMarks() {
  const start = TANKS[0];
  if (start === undefined) return null;
  const end = start.x + DASH;
  return (
    <g aria-hidden="true">
      {[-2.6, 0, 2.6].map((dy) => (
        <path key={dy} className="hs-loop hs-streak" d={`M ${start.x} ${start.y + dy} H ${end - 4}`} pathLength={1} strokeDasharray="1 1" fill="none" strokeLinecap="round"
          strokeWidth={dy === 0 ? 1.2 : 0.7} opacity={0} style={{ stroke: "var(--color-guide-deep)" }} />
      ))}
      {/* The ram reaches the first tank ahead from where the dash stops, as the live board draws it. */}
      <path className="hs-loop hs-streak" d={`M ${end + 4.5} ${start.y} H ${SHOT.to - 5}`} pathLength={1} strokeDasharray="1 1" fill="none" strokeLinecap="round"
        strokeWidth={1} opacity={0} style={{ stroke: "var(--color-guide-deep)", animationDelay: "calc(1.2s + 500ms)" }} />
      <g transform={`translate(${SHOT.to - 4.5} ${SHOT.y})`}>
        <path className="hs-anim hs-loop hs-bump" opacity={0} d="M0 -3.4L0.9 -0.9L3.4 0L0.9 0.9L0 3.4L-0.9 0.9L-3.4 0L-0.9 -0.9Z" strokeWidth={0.3}
          style={{ fill: "var(--color-guide)", stroke: "var(--color-guide-deep)" }} />
      </g>
      <g transform={`translate(${end + 6} 26)`}>
        <text className="hs-anim hs-loop hs-plus2" opacity={0} textAnchor="middle" dominantBaseline="central" fontFamily="var(--font-display)" fontWeight={700} fontSize={7}
          stroke="#ffffff" strokeWidth={1.4} paintOrder="stroke" style={{ fill: "var(--color-self-ink)" }}>
          +2
        </text>
      </g>
    </g>
  );
}

export function HomeScene({ label }: { label: string }) {
  return (
    <svg viewBox={`-2 -6 ${COLUMNS * CELL + 4} ${ROWS * CELL + 8}`} role="img" aria-label={label} className="block size-full">
      <style>{SCENE_CSS}</style>
      <Floor />
      <Weather />
      <DashMarks />
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
            <g className={tank.self === true ? "hs-loop hs-dash" : undefined}>
              {tank.self === true ? <ReadyRing /> : null}
              <g className={tank.role === undefined ? undefined : `hs-anim hs-loop hs-${tank.role === "target" ? "target hs-target-dash" : tank.role}`}>
                <TankShape colour={tank.colour} angle={tank.angle} self={tank.self ?? false} />
              </g>
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
