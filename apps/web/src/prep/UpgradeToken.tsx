// The upgrade point as one drawn object: a blue cog, a part from the tank workshop. The
// same cog lies in the tray, sits in the sockets, and shows in the tour, so a child
// learns that a cog is one upgrade point (71-workshop-appeal.md, part B). The empty
// place it leaves is the same cog as a dashed outline. Blue is the game's primary
// colour; the guide's yellow and the orange of "you" stay free for their own jobs. It sits on the
// card itself, so it takes the dark theme's colours (themed-svg in index.css).

const TEETH = 8;
const OUTER = 10.5;
const BODY = 8;
const HOLE = 3;

/** A cog outline: a body of radius BODY with TEETH square teeth reaching OUTER. */
function cogPath(): string {
  const points: string[] = [];
  const step = (Math.PI * 2) / TEETH;
  const half = step * 0.22;
  for (let i = 0; i < TEETH; i++) {
    const a = i * step - Math.PI / 2;
    const at = (r: number, angle: number) => `${(r * Math.cos(angle)).toFixed(2)} ${(r * Math.sin(angle)).toFixed(2)}`;
    points.push(at(BODY, a - half * 1.6), at(OUTER, a - half), at(OUTER, a + half), at(BODY, a + half * 1.6));
  }
  return `M ${points.join(" L ")} Z`;
}

const COG = cogPath();

export type TokenLook = "token" | "empty";

/** One upgrade point, `size` px square. "empty" is the place a cog leaves in the tray, or an empty socket. */
export function UpgradeToken({ look, size }: { readonly look: TokenLook; readonly size: number }) {
  return (
    <svg viewBox="-12 -12 24 24" width={size} height={size} aria-hidden="true" className="themed-svg block shrink-0 overflow-visible">
      {look === "token" ? (
        <>
          <path d={COG} strokeWidth={1.4} strokeLinejoin="round" style={{ fill: "var(--color-water)", stroke: "var(--color-water-deep)" }} />
          <circle r={HOLE} strokeWidth={1.2} style={{ fill: "var(--color-panel)", stroke: "var(--color-water-deep)" }} />
          {/* A highlight on the upper left, so the cog reads as a solid part. */}
          <path d="M -5.6 -2.2 A 6 6 0 0 1 -2.2 -5.6" fill="none" strokeWidth={1.3} strokeLinecap="round" stroke="#ffffff" strokeOpacity={0.55} />
        </>
      ) : (
        // The cog's own silhouette, pale on the tray's darker body: a place where a cog belongs.
        <>
          <path d={COG} strokeWidth={1.3} strokeLinejoin="round" style={{ fill: "var(--color-panel)", stroke: "var(--color-line-strong)" }} />
          <circle r={HOLE} style={{ fill: "var(--color-line)" }} />
        </>
      )}
    </svg>
  );
}
