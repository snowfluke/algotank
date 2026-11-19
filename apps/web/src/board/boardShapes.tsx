// The drawings of the board's events: the jet, the splash of a hit, the puff
// where a missed jet lands, the drops of a dry shot and the leader's crown. The
// board and the legend draw from this one file, so the legend always shows what
// the board shows. Each shape is drawn around 0,0 in board units (a square is 10).
//
// The `className` hooks name the motion in arenaMotion.ts. A shape without
// motion is the still picture: a paused turn and reduced motion show it as is.

import type { Jet, Point } from "./boardHelpers.ts";
import { jetPath } from "./boardHelpers.ts";

const WATER = "var(--color-water)";
const OUTLINE = "var(--color-tank-outline)";
const WHITE = "var(--color-panel)";

export function JetShape({ jet, continuation, motion = "" }: { jet: Jet; continuation?: Jet; motion?: string }) {
  const d = jetPath(jet, continuation);
  return (
    // pathLength 1 lets the motion draw the jet with dash values that fit every length.
    <g className={motion} strokeLinecap="round" fill="none" strokeDasharray="1 2" strokeDashoffset={0}>
      <path d={d} pathLength={1} strokeWidth={2} style={{ stroke: WATER }} />
      <path d={d} pathLength={1} strokeWidth={0.6} style={{ stroke: WHITE }} strokeOpacity={0.75} />
    </g>
  );
}

const SPLASH_DROPS: readonly Point[] = [
  { x: -4.4, y: -3.1 },
  { x: -1.1, y: -5 },
  { x: 3.3, y: -4 },
  { x: -4.7, y: 2.5 },
  { x: 0.8, y: 4.9 },
  { x: 4.1, y: 2.8 },
];

/** A hit: a ring of water and six drops around the tank that was hit. The ring stays open in the middle, so the tank shows through. */
export function Splash({ motion = "" }: { motion?: string }) {
  return (
    <g className={motion}>
      <circle r={3.6} fill="none" strokeWidth={1} style={{ stroke: WATER }} />
      {SPLASH_DROPS.map((drop) => (
        <circle key={`${drop.x},${drop.y}`} cx={drop.x} cy={drop.y} r={1} strokeWidth={0.25} style={{ fill: WATER, stroke: WHITE }} />
      ))}
    </g>
  );
}

/** Where a missed jet lands: a dashed ring on the floor, smaller and lighter than a splash. */
export function Puff({ motion = "" }: { motion?: string }) {
  return (
    <g className={motion}>
      <circle r={2.2} fill="none" strokeWidth={0.6} strokeDasharray="1 0.9" style={{ stroke: WATER }} />
      <circle r={0.6} style={{ fill: WATER }} />
    </g>
  );
}

/** Dust at a tunnel mouth (77-monthly-league.md, owner 2026-11-19). */
export function DustRing({ colour, phase }: { colour: string; phase: "sink" | "rise" }) {
  return (
    <g className={`ab-anim ab-tunnel-dust-${phase}`} data-tunnel-dust={phase}>
      <circle r={3.4} fill="none" strokeWidth={0.8} strokeDasharray="1.7 0.8" style={{ stroke: colour }} />
    </g>
  );
}

const DROP_RADII = [0.8, 0.62, 0.45] as const;

/** A dry shot: three shrinking drops in front of the nozzle and no jet. `drops` are absolute points. */
export function DryDrops({ drops, motion = "" }: { drops: readonly Point[]; motion?: string }) {
  return (
    <g className={motion}>
      {drops.map((drop, index) => (
        <circle
          key={index}
          cx={drop.x}
          cy={drop.y}
          r={DROP_RADII[index] ?? 0.45}
          strokeWidth={0.25}
          style={{ fill: WATER, stroke: OUTLINE }}
        />
      ))}
    </g>
  );
}

/** The leader's crown, 4.4 wide and 2.8 high, outlined so it reads on any hull colour. */
export function Crown() {
  return (
    <path
      d="M-2.2 1.3V-0.9L-1.1 0.1L0 -1.5L1.1 0.1L2.2 -0.9V1.3Z"
      strokeWidth={0.4}
      strokeLinejoin="round"
      style={{ fill: "var(--color-tank-3)", stroke: OUTLINE }}
    />
  );
}
