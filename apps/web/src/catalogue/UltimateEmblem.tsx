import type { UltimateId, UltimateState } from "@game/engine";
import type { ReactNode } from "react";

/**
 * Each ultimate's emblem, drawn like the board: flat fills, a thick ink outline, and a gold rim, the colour that marks
 * ultimates everywhere in the game (owner, 2026-11-19: "a game, not a website"). A shape gets its outline from an ink
 * copy drawn 2.5 units wider underneath, as the tanks do.
 */
const INK = "var(--color-ink)";
const WHITE = "var(--color-panel)";

interface Look {
  readonly disc: string;
  readonly art: ReactNode;
}

function outlined(d: string, width: number, color: string) {
  return (
    <>
      <path d={d} fill="none" stroke={INK} strokeWidth={width + 3} strokeLinecap="round" strokeLinejoin="round" />
      <path d={d} fill="none" stroke={color} strokeWidth={width} strokeLinecap="round" strokeLinejoin="round" />
    </>
  );
}

function blobs(circles: readonly (readonly [number, number, number])[], color: string) {
  return (
    <>
      {circles.map(([x, y, r]) => <circle key={`o${x},${y}`} cx={x} cy={y} r={r + 1.6} fill={INK} />)}
      {circles.map(([x, y, r]) => <circle key={`f${x},${y}`} cx={x} cy={y} r={r} fill={color} />)}
    </>
  );
}

const DROP = "M32 14C32 14 21 28 21 36A11 11 0 0 0 43 36C43 28 32 14 32 14Z";
const CANOPY = "M13 35A19 19 0 0 1 51 35Q47 31 42.5 35Q37 31 32 35Q27 31 21.5 35Q17 31 13 35Z";

const LOOKS: Readonly<Record<UltimateId, Look>> = {
  dash: {
    disc: "var(--color-tank-9)",
    art: (
      <>
        {outlined("M12 24H19M10 32H18M12 40H19", 3, WHITE)}
        {outlined("M24 19L36 32L24 45M35 19L47 32L35 45", 5.5, WHITE)}
      </>
    ),
  },
  smoke: {
    disc: "var(--color-tank-8)",
    art: blobs([[22, 37, 8], [33, 30, 11], [44, 37, 8], [32, 40, 8]], "var(--color-tank-11)"),
  },
  splash: {
    disc: "var(--color-tank-1)",
    art: (
      <>
        <path d={DROP} fill={WHITE} stroke={INK} strokeWidth={3} strokeLinejoin="round" />
        <path d="M27 36A5 5 0 0 0 31 41" fill="none" stroke="var(--color-tank-1)" strokeWidth={2.5} strokeLinecap="round" />
        {blobs([[14, 22, 2.6], [50, 22, 2.6], [12, 42, 2.6], [52, 42, 2.6]], WHITE)}
      </>
    ),
  },
  fullTank: {
    disc: "var(--color-tank-6)",
    art: (
      <>
        <rect x={26} y={10} width={12} height={7} rx={2} fill={WHITE} stroke={INK} strokeWidth={3} />
        <rect x={20} y={16} width={24} height={36} rx={7} fill={WHITE} stroke={INK} strokeWidth={3} />
        <rect x={24} y={21} width={16} height={27} rx={4} fill="var(--color-water)" />
        <path d="M28 25V42" stroke="var(--color-water-light)" strokeWidth={2.5} strokeLinecap="round" />
      </>
    ),
  },
  mudBomb: {
    disc: "var(--color-tank-4)",
    art: (
      <>
        {blobs([[15, 45, 3], [49, 46, 3.4], [47, 19, 2.6]], "var(--color-tank-10)")}
        <circle cx={32} cy={33} r={14} fill="var(--color-tank-10)" stroke={INK} strokeWidth={3} />
        <circle cx={27} cy={28} r={3.5} fill="var(--color-arena-clay-mark)" />
        <circle cx={37} cy={37} r={2.4} fill="var(--color-tank-10-dark)" />
      </>
    ),
  },
  whirlwind: {
    disc: "var(--color-tank-5)",
    art: outlined("M15 19H49M19 27H45M23 35H40M27 43H35M30 50H32", 4.5, WHITE),
  },
  bigUmbrella: {
    disc: "var(--color-tank-7)",
    art: (
      <>
        {outlined("M32 35V48A4 4 0 0 1 24 48", 3.5, INK)}
        <path d={CANOPY} fill="var(--color-tank-5)" stroke={INK} strokeWidth={3} strokeLinejoin="round" />
        <path d="M32 16V34M22 20Q25 27 26.5 34M42 20Q39 27 37.5 34" fill="none" stroke="var(--color-tank-5-dark)" strokeWidth={2} strokeLinecap="round" />
      </>
    ),
  },
  magnet: {
    disc: "var(--color-tank-12)",
    art: (
      <>
        {outlined("M20 16V32A12 12 0 0 0 44 32V16", 9, "var(--color-tank-2)")}
        <rect x={15.5} y={12} width={9} height={8} fill={WHITE} stroke={INK} strokeWidth={2.5} />
        <rect x={39.5} y={12} width={9} height={8} fill={WHITE} stroke={INK} strokeWidth={2.5} />
      </>
    ),
  },
};

const RIM = 28.5;
const RIM_LENGTH = 2 * Math.PI * RIM;

/** How full the rim is: the charge so far, or all of it when the ultimate is ready. */
export function chargeOf(state: UltimateState): number {
  return state.kind === "ready" ? 1 : Math.min(1, Math.max(0, (state.turnsTotal - state.turnsLeft) / state.turnsTotal));
}

/**
 * The emblem alone. With `state`, the gold rim is a charge meter that fills as the turns pass and glows when ready;
 * without it, the rim is whole.
 */
export function UltimateEmblem({ ultimate, size, state }: { readonly ultimate: UltimateId; readonly size: number; readonly state?: UltimateState | undefined }) {
  const look = LOOKS[ultimate];
  const charge = state === undefined ? 1 : chargeOf(state);
  const ready = state?.kind === "ready";
  return (
    <svg aria-hidden viewBox="0 0 64 64" width={size} height={size} className={`ultimate-emblem shrink-0 overflow-visible ${ready ? "ultimate-emblem-ready" : ""}`} data-ultimate-emblem={ultimate}>
      {ready ? <circle className="ultimate-emblem-glow" cx={32} cy={32} r={31} fill="var(--color-guide)" /> : null}
      <circle cx={32} cy={32} r={31} fill={INK} />
      <circle cx={32} cy={32} r={RIM} fill="none" stroke={state === undefined ? "var(--color-guide)" : "var(--color-tank-11-dark)"} strokeWidth={4} />
      {state === undefined ? null : (
        <circle
          cx={32}
          cy={32}
          r={RIM}
          fill="none"
          stroke="var(--color-guide)"
          strokeWidth={4}
          strokeDasharray={`${RIM_LENGTH * charge} ${RIM_LENGTH}`}
          transform="rotate(-90 32 32)"
          data-ultimate-charge={Math.round(charge * 100)}
        />
      )}
      <circle cx={32} cy={32} r={25.5} fill={look.disc} stroke={INK} strokeWidth={1.5} />
      <g className="ultimate-emblem-art">{look.art}</g>
    </svg>
  );
}
