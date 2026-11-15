// The drawings of the items on the board (docs/specs/revamp/84-items.md): the four items, the
// small one a tank holds, the open umbrella of a blocked throw, and the two effects. The board
// and the legend draw from this one file, like boardShapes.tsx. Each shape is drawn around 0,0
// in board units (a square is 10) in the toy style of the tanks: flat fills from the tank
// palette and the tank outline.
//
// The `className` hooks name the motion in arenaMotion.ts. Without motion (a paused turn,
// reduced motion) every shape is its still picture.

import type { ItemKind } from "@game/engine";

const OUTLINE = "var(--color-tank-outline)";
const WHITE = "var(--color-panel)";
const WATER = "var(--color-water)";
const WATER_LIGHT = "var(--color-water-light)";
const LINE = 0.42;

/** A blue bucket with a handle and water up to the rim. */
function Bucket() {
  return (
    <g strokeLinejoin="round" strokeLinecap="round">
      <path d="M-2.5 -1.3C-2.5 -4.6 2.5 -4.6 2.5 -1.3" fill="none" strokeWidth={0.55} style={{ stroke: OUTLINE }} />
      <path d="M-3 -1.3H3L2.25 2.85Q2.15 3.3 1.7 3.3H-1.7Q-2.15 3.3 -2.25 2.85Z" strokeWidth={LINE} style={{ fill: "var(--color-tank-1)", stroke: OUTLINE }} />
      <path d="M-2.62 0.75H2.62" strokeWidth={0.5} style={{ stroke: "var(--color-tank-1-dark)" }} />
      <ellipse cy={-1.3} rx={3} ry={0.85} strokeWidth={LINE} style={{ fill: "var(--color-tank-1-dark)", stroke: OUTLINE }} />
      <ellipse cy={-1.2} rx={2.3} ry={0.5} style={{ fill: WATER_LIGHT }} />
      <path d="M-1.85 -0.2L-1.5 2.4" strokeWidth={0.45} strokeOpacity={0.7} style={{ stroke: WHITE }} />
    </g>
  );
}

/** A closed purple umbrella, strapped, with a brown hooked handle. */
function ClosedUmbrella() {
  return (
    <g strokeLinejoin="round" strokeLinecap="round">
      <path d="M0 -4.4V-3.4" strokeWidth={0.55} style={{ stroke: OUTLINE }} />
      <path d="M0 1.9V3.3Q0 4.4 -1 4.4Q-1.9 4.4 -1.9 3.5" fill="none" strokeWidth={1.1} style={{ stroke: OUTLINE }} />
      <path d="M0 1.9V3.3Q0 4.4 -1 4.4Q-1.9 4.4 -1.9 3.5" fill="none" strokeWidth={0.5} style={{ stroke: "var(--color-tank-10)" }} />
      <path d="M0 -3.6C1.5 -2 1.9 0.6 1.1 2.1H-1.1C-1.9 0.6 -1.5 -2 0 -3.6Z" strokeWidth={LINE} style={{ fill: "var(--color-tank-5)", stroke: OUTLINE }} />
      <path d="M0 -3.1L0.35 2" fill="none" strokeWidth={0.3} style={{ stroke: "var(--color-tank-5-dark)" }} />
      <rect x={-1.55} y={-0.2} width={3.1} height={0.8} rx={0.3} strokeWidth={0.3} style={{ fill: "var(--color-tank-3)", stroke: OUTLINE }} />
    </g>
  );
}

const BLADE_COLOURS = ["var(--color-tank-2)", "var(--color-tank-3)", "var(--color-tank-1)", "var(--color-tank-4)"] as const;

/** A four-blade toy pinwheel on a stick. `spin` names the motion of the blades. */
function Pinwheel({ spin = "", stick = true }: { spin?: string; stick?: boolean }) {
  return (
    <g strokeLinejoin="round">
      {stick ? <path d="M0 0.5V4.6" strokeWidth={0.7} strokeLinecap="round" style={{ stroke: "var(--color-tank-10)" }} /> : null}
      <g className={spin}>
        {/* An empty ring as wide as the blades, so the turn's centre is the pin. */}
        <circle r={3.9} fill="none" />
        {BLADE_COLOURS.map((colour, i) => (
          <path
            key={colour}
            d="M0 0V-3.8C2 -3.8 3.3 -2.4 2.8 -0.5Z"
            transform={`rotate(${i * 90})`}
            strokeWidth={0.38}
            style={{ fill: colour, stroke: OUTLINE }}
          />
        ))}
      </g>
      <circle r={0.65} strokeWidth={0.3} style={{ fill: WHITE, stroke: OUTLINE }} />
    </g>
  );
}

/** A lumpy brown ball of mud with darker spots. */
function MudBall() {
  return (
    <g>
      <path
        d="M-2.9 0.2C-3.2 -1.9 -1.5 -3.2 0.3 -3C2.2 -3.3 3.4 -1.6 3.1 0.3C3.3 2.1 1.8 3.2 0 3C-2 3.3 -3.3 1.9 -2.9 0.2Z"
        strokeWidth={LINE}
        strokeLinejoin="round"
        style={{ fill: "var(--color-tank-10)", stroke: OUTLINE }}
      />
      <circle cx={-0.9} cy={0.6} r={0.62} style={{ fill: "var(--color-tank-10-dark)" }} />
      <circle cx={1.3} cy={1.1} r={0.45} style={{ fill: "var(--color-tank-10-dark)" }} />
      <circle cx={1} cy={-1.4} r={0.38} style={{ fill: "var(--color-tank-10-dark)" }} />
      <ellipse cx={-1.3} cy={-1.75} rx={0.85} ry={0.42} transform="rotate(-30 -1.3 -1.75)" fillOpacity={0.55} style={{ fill: WHITE }} />
    </g>
  );
}

/** One item as it lies on the floor, about 7 units tall. `spin` turns the pinwheel's blades. */
export function ItemShape({ kind, spin = "" }: { kind: ItemKind; spin?: string }) {
  switch (kind) {
    case "bucket":
      return <Bucket />;
    case "umbrella":
      return <ClosedUmbrella />;
    case "pinwheel":
      return <Pinwheel spin={spin} />;
    case "mudBall":
      return <MudBall />;
  }
}

/** The item a tank holds: a white disc with the item inside, so it reads on every hull colour. */
export function HeldBadge({ kind }: { kind: ItemKind }) {
  return (
    <g>
      <circle r={2.35} strokeWidth={0.35} style={{ fill: WHITE, stroke: OUTLINE }} />
      <g transform="scale(0.43)">{kind === "pinwheel" ? <Pinwheel stick={false} /> : <ItemShape kind={kind} />}</g>
    </g>
  );
}

/**
 * A blocked throw: the umbrella opens with its dome toward the shooter, and the jet breaks into
 * drops at its rim. Drawn with the dome up; the board turns it toward the jet.
 */
export function OpenUmbrella({ motion = "" }: { motion?: string }) {
  return (
    <g className={motion} strokeLinejoin="round" strokeLinecap="round">
      <path d="M0 -0.3V3.3Q0 4.3 -1 4.3Q-1.8 4.3 -1.8 3.5" fill="none" strokeWidth={1} style={{ stroke: OUTLINE }} />
      <path d="M0 -0.3V3.3Q0 4.3 -1 4.3Q-1.8 4.3 -1.8 3.5" fill="none" strokeWidth={0.45} style={{ stroke: "var(--color-tank-10)" }} />
      <path
        d="M-4.6 0Q-4.6 -4.3 0 -4.3Q4.6 -4.3 4.6 0Q3.45 -0.95 2.3 0Q1.15 -0.95 0 0Q-1.15 -0.95 -2.3 0Q-3.45 -0.95 -4.6 0Z"
        strokeWidth={LINE}
        style={{ fill: "var(--color-tank-5)", stroke: OUTLINE }}
      />
      <path d="M0 -4.3L-2.3 0M0 -4.3L0 0M0 -4.3L2.3 0" fill="none" strokeWidth={0.3} style={{ stroke: "var(--color-tank-5-dark)" }} />
      {[
        { x: -5.4, y: -2.6, r: 0.7 },
        { x: -5.6, y: -0.6, r: 0.5 },
        { x: 5.4, y: -2.6, r: 0.7 },
        { x: 5.6, y: -0.6, r: 0.5 },
      ].map((drop) => (
        <circle key={`${drop.x},${drop.y}`} cx={drop.x} cy={drop.y} r={drop.r} strokeWidth={0.25} style={{ fill: WATER, stroke: WHITE }} />
      ))}
    </g>
  );
}

const STAR = "M0 -1.1L0.3 -0.3L1.1 0L0.3 0.3L0 1.1L-0.3 0.3L-1.1 0L-0.3 -0.3Z";
const RING = 3.6;

/** Dizzy: three yellow stars that circle the tank. `motion` turns the ring. */
export function DizzyStars({ motion = "" }: { motion?: string }) {
  return (
    <g className={motion}>
      {/* An empty ring as wide as the stars' path, so the turn's centre is the tank's. */}
      <circle r={RING + 1.1} fill="none" />
      {[0, 120, 240].map((angle) => {
        const rad = (angle * Math.PI) / 180;
        return (
          <path
            key={angle}
            d={STAR}
            transform={`translate(${(RING * Math.cos(rad)).toFixed(2)} ${(RING * Math.sin(rad)).toFixed(2)}) scale(1.15)`}
            strokeWidth={0.22}
            strokeLinejoin="round"
            style={{ fill: "var(--color-tank-3)", stroke: OUTLINE }}
          />
        );
      })}
    </g>
  );
}

/** Stuck, under the tank: a puddle of mud around its treads. */
export function MudPuddle() {
  return (
    <path
      d="M-4.3 1.4C-4.6 0 -3.2 -0.4 -2.2 -0.1C-1.3 -0.9 1.2 -0.9 2.2 -0.1C3.3 -0.5 4.7 0.3 4.3 1.6C4.6 2.9 3.1 3.7 1.6 3.4C0.4 4.2 -1.2 4.1 -2.2 3.4C-3.6 3.7 -4.8 2.7 -4.3 1.4Z"
      strokeWidth={0.3}
      strokeLinejoin="round"
      style={{ fill: "var(--color-tank-10)", stroke: "var(--color-tank-10-dark)" }}
    />
  );
}

/** Stuck, over the tank: splats of mud on the treads. */
export function MudSplats() {
  return (
    <g strokeWidth={0.25} style={{ fill: "var(--color-tank-10)", stroke: "var(--color-tank-10-dark)" }}>
      <path d="M-3.9 -1.7C-3.9 -2.5 -2.7 -2.6 -2.5 -1.9C-2 -2.1 -1.6 -1.3 -2.2 -1C-2.4 -0.4 -3.5 -0.6 -3.4 -1.1C-3.9 -1 -4.2 -1.4 -3.9 -1.7Z" />
      <path d="M2.4 2.6C2.5 1.9 3.6 1.9 3.7 2.5C4.2 2.5 4.3 3.2 3.8 3.4C3.6 3.9 2.6 3.8 2.6 3.3C2.1 3.3 2 2.8 2.4 2.6Z" />
      <circle cx={-1.2} cy={3.3} r={0.5} />
    </g>
  );
}
