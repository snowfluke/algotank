// The drawings on the three arena tiles of the chooser, made of tanks like the home
// cards (home/EntryArt.tsx). Decorative: the tile's title names the arena.

import type { ChooserKind } from "./chooserKinds.ts";
import { Tank, Tile } from "../home/EntryArt.tsx";

/** Your tank and a bot squirt at each other: a quick game to try things. */
function PracticeArt() {
  return (
    <Tile>
      <path d="M 25 36 Q 33 30 40 30" fill="none" strokeWidth={2.6} strokeLinecap="round" style={{ stroke: "var(--color-water)" }} />
      <Tank colour={8} x={47} y={30} angle={180} scale={1.5} />
      <Tank colour={1} x={17} y={38} angle={-20} scale={1.6} self />
    </Tile>
  );
}

/** Four tanks, then two, then one: a knockout. */
function TournamentArt() {
  return (
    <Tile>
      <g fill="none" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" style={{ stroke: "var(--color-line-strong)" }}>
        <path d="M 14 12 H 22 V 22 H 30 M 14 32 H 22 V 22" />
        <path d="M 14 42 H 22 V 50 H 30 M 14 58 H 22 V 50" />
        <path d="M 38 22 H 44 V 36 H 48 M 38 50 H 44 V 36" />
      </g>
      <Tank colour={2} x={8} y={12} angle={0} scale={0.7} />
      <Tank colour={4} x={8} y={32} angle={0} scale={0.7} />
      <Tank colour={5} x={8} y={42} angle={0} scale={0.7} />
      <Tank colour={3} x={8} y={58} angle={0} scale={0.7} />
      <Tank colour={2} x={34} y={22} angle={0} scale={0.85} />
      <Tank colour={5} x={34} y={50} angle={0} scale={0.85} />
      <Tank colour={5} x={55} y={36} angle={-90} scale={1.2} />
    </Tile>
  );
}

/** Three tanks on a podium: the month's champion in the middle. */
function MonthlyArt() {
  return (
    <Tile>
      <g style={{ fill: "var(--color-line-strong)" }}>
        <rect x={6} y={44} width={17} height={14} rx={2} />
        <rect x={23.5} y={36} width={17} height={22} rx={2} />
        <rect x={41} y={48} width={17} height={10} rx={2} />
      </g>
      <Tank colour={7} x={14.5} y={36} angle={-90} scale={1.1} />
      <Tank colour={9} x={32} y={26} angle={-90} scale={1.35} />
      <Tank colour={6} x={49.5} y={40} angle={-90} scale={1.1} />
    </Tile>
  );
}

export function ArenaArt({ kind }: { readonly kind: ChooserKind }) {
  switch (kind) {
    case "practice":
      return <PracticeArt />;
    case "tournament":
      return <TournamentArt />;
    case "monthly":
      return <MonthlyArt />;
  }
}
