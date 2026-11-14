// The hull patterns (skins) as plain geometry in TankShape units, computed once when the
// module loads. A pattern is drawn as one or two paths in the second colour, and every
// motif is kept inside the hull, so a skin needs no SVG <pattern> or <clipPath>: those
// need ids, which collide where the same tank is drawn twice (the Pager's measuring copy)
// or once per tank in a <symbol>. The geometry turns with the hull, so a turning tank's
// pattern does not shimmer.
//
// Size rule: a badge of 40 px shows 3.3 px per unit, so a motif is at least about
// 1 unit across (3 px) and a line at least 0.4 units (1.3 px).

import { TANK_SKINS, type TankSkin } from "@game/arena";

export interface SkinGeometry {
  /** Filled shapes, or "" for none. */
  readonly fill: string;
  /** Stroked lines, or null for none. */
  readonly line: { readonly d: string; readonly width: number } | null;
}

/** The hull rectangle of TankShape (facing east). */
export const HULL = { x: -3.9, y: -3.05, width: 7.5, height: 6.1, radius: 1.9 } as const;

/** Patterns stay this far inside the hull's edge, so the outline drawn over them stays clean. */
const INSET = 0.2;
const PANEL = {
  left: HULL.x + INSET,
  right: HULL.x + HULL.width - INSET,
  top: HULL.y + INSET,
  bottom: HULL.y + HULL.height - INSET,
  radius: HULL.radius - INSET,
};

/** Signed distance from the panel's edge: negative inside. */
export function panelDistance(x: number, y: number): number {
  const cx = (PANEL.left + PANEL.right) / 2;
  const cy = (PANEL.top + PANEL.bottom) / 2;
  const qx = Math.abs(x - cx) - ((PANEL.right - PANEL.left) / 2 - PANEL.radius);
  const qy = Math.abs(y - cy) - ((PANEL.bottom - PANEL.top) / 2 - PANEL.radius);
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - PANEL.radius;
}

/** A column of motifs passes here, in the middle of the hull's front part that the turret leaves free. */
const MOTIF_X = 2.35;

const inside = (x: number, y: number, margin: number) => panelDistance(x, y) <= -margin;
const n = (value: number) => (Math.round(value * 100) / 100).toString();

/**
 * Motif centres on rows `rowStep` apart, the first `phase` below the barrel's line; every
 * other row moves half a step, so the motifs sit like a honeycomb.
 */
function grid(step: number, rowStep: number, phase: number): { x: number; y: number }[] {
  const points: { x: number; y: number }[] = [];
  for (let k = -6; k <= 6; k += 1) {
    const y = phase + k * rowStep;
    if (y < PANEL.top || y > PANEL.bottom) continue;
    const shift = k % 2 !== 0 ? step / 2 : 0;
    for (let x = MOTIF_X - step * 6 + shift; x <= PANEL.right; x += step) points.push({ x, y });
  }
  return points;
}

/** Keeps the part of a polyline inside the panel, split where it leaves. */
function clipPolyline(points: readonly { x: number; y: number }[], margin: number): string {
  const runs: string[] = [];
  let run: string[] = [];
  for (const p of points) {
    if (inside(p.x, p.y, margin)) {
      run.push(`${run.length === 0 ? "M" : "L"}${n(p.x)} ${n(p.y)}`);
    } else if (run.length > 0) {
      if (run.length > 1) runs.push(run.join(""));
      run = [];
    }
  }
  if (run.length > 1) runs.push(run.join(""));
  return runs.join("");
}

/** A straight line sampled finely, so clipping follows the rounded corners. */
function sampled(x1: number, y1: number, x2: number, y2: number): { x: number; y: number }[] {
  const steps = Math.ceil(Math.hypot(x2 - x1, y2 - y1) / 0.05);
  return Array.from({ length: steps + 1 }, (_, i) => ({ x: x1 + ((x2 - x1) * i) / steps, y: y1 + ((y2 - y1) * i) / steps }));
}

function circle(x: number, y: number, r: number): string {
  return `M${n(x - r)} ${n(y)}a${n(r)} ${n(r)} 0 1 0 ${n(2 * r)} 0a${n(r)} ${n(r)} 0 1 0 ${n(-2 * r)} 0Z`;
}

function star(x: number, y: number, r: number): string {
  const points = Array.from({ length: 10 }, (_, i) => {
    const angle = -Math.PI / 2 + (i * Math.PI) / 5;
    const radius = i % 2 === 0 ? r : r * 0.45;
    return `${n(x + radius * Math.cos(angle))} ${n(y + radius * Math.sin(angle))}`;
  });
  return `M${points.join("L")}Z`;
}

/** A heart `r` wide on each side of its centre, its point toward +x (the barrel), so it reads upright in a list where tanks face up. */
function heart(x: number, y: number, r: number): string {
  // Drawn pointing down in local units, then turned a quarter so the point faces the barrel.
  const local: [number, number][] = [
    [0, 0.95], [-0.55, 0.45], [-1, 0], [-1, -0.45], [-0.75, -0.85], [-0.35, -0.9], [0, -0.55],
    [0.35, -0.9], [0.75, -0.85], [1, -0.45], [1, 0], [0.55, 0.45],
  ];
  const turned = local.map(([lx, ly]) => `${n(x - ly * r)} ${n(y + lx * r)}`);
  return `M${turned.join("L")}Z`;
}

function fitted(points: readonly { x: number; y: number }[], r: number, shape: (x: number, y: number) => string): string {
  return points.filter((p) => inside(p.x, p.y, r)).map((p) => shape(p.x, p.y)).join("");
}

function stripes(angle: number, gap: number): string {
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  const parts: string[] = [];
  for (let k = -8; k <= 8; k += 1) {
    // A line through (k * gap) across the stripe direction, long enough to cross the hull.
    const ox = MOTIF_X + k * gap * -dy;
    const oy = k * gap * dx;
    parts.push(clipPolyline(sampled(ox - dx * 8, oy - dy * 8, ox + dx * 8, oy + dy * 8), 0.05));
  }
  return parts.join("");
}

function rows(gap: number, wave: (x: number) => number): string {
  const parts: string[] = [];
  for (let y = -gap * 3; y <= gap * 3 + 0.01; y += gap) {
    const points: { x: number; y: number }[] = [];
    for (let x = PANEL.left; x <= PANEL.right; x += 0.05) points.push({ x, y: y + wave(x) });
    parts.push(clipPolyline(points, 0.1));
  }
  return parts.join("");
}

function checks(size: number): string {
  const parts: string[] = [];
  for (let i = -6; i <= 6; i += 1) {
    for (let j = -4; j <= 4; j += 1) {
      if ((i + j) % 2 !== 0) continue;
      const x = MOTIF_X + i * size - size / 2;
      const y = j * size - size / 2;
      const corners = [[x, y], [x + size, y], [x, y + size], [x + size, y + size]] as const;
      if (corners.every(([cx, cy]) => inside(cx, cy, 0))) parts.push(`M${n(x)} ${n(y)}h${n(size)}v${n(size)}h${n(-size)}Z`);
    }
  }
  return parts.join("");
}

function splash(x: number, y: number, seed: number): string {
  // A blob with three drops thrown off it; the drops turn with the seed so the splashes do not line up.
  const turn = seed * 2.1;
  const drops = [0, 2.1, 4.2].map((a) => circle(x + 0.66 * Math.cos(a + turn), y + 0.66 * Math.sin(a + turn), 0.18)).join("");
  return circle(x, y, 0.4) + drops;
}

function bricks(height: number, width: number): string {
  const parts: string[] = [];
  for (let r = -4; r <= 4; r += 1) {
    const y = r * height + height / 2;
    parts.push(clipPolyline(sampled(PANEL.left, y, PANEL.right, y), 0.05));
    const shift = r % 2 === 0 ? 0 : width / 2;
    for (let x = MOTIF_X - width * 4 + shift; x <= PANEL.right; x += width) {
      parts.push(clipPolyline(sampled(x, y, x, y + height), 0.05));
    }
  }
  return parts.join("");
}

function scales(radius: number): string {
  const parts: string[] = [];
  for (let r = -5; r <= 5; r += 1) {
    const y = r * radius;
    const shift = r % 2 === 0 ? 0 : radius;
    for (let x = MOTIF_X - radius * 8 + shift; x <= PANEL.right + radius; x += radius * 2) {
      // The lower half of a circle: a row of scales hanging from the row above.
      const points = Array.from({ length: 21 }, (_, i) => {
        const a = Math.PI - (i * Math.PI) / 20;
        return { x: x + radius * Math.cos(a), y: y + radius * Math.sin(a) };
      });
      parts.push(clipPolyline(points, 0.1));
    }
  }
  return parts.join("");
}

function build(skin: TankSkin): SkinGeometry {
  switch (skin) {
    case "plain":
      return { fill: "", line: null };
    case "dots":
      return { fill: fitted(grid(1.35, 1.2, 0.6), 0.45, (x, y) => circle(x, y, 0.45)), line: null };
    case "stripes":
      return { fill: "", line: { d: stripes(Math.PI / 2, 1.5), width: 0.7 } };
    case "slants":
      return { fill: "", line: { d: stripes(Math.PI / 4, 1.3), width: 0.55 } };
    case "checks":
      return { fill: checks(0.8), line: null };
    case "zigzag":
      return { fill: "", line: { d: rows(1.6, (x) => 0.4 * (2 * Math.abs(((x / 1.3) % 2 + 2) % 2 - 1) - 1)), width: 0.45 } };
    case "waves":
      return { fill: "", line: { d: rows(1.6, (x) => 0.4 * Math.sin((x / 1.4) * 2 * Math.PI)), width: 0.45 } };
    case "stars":
      return { fill: fitted(grid(1.45, 1.25, 0.62), 0.6, (x, y) => star(x, y, 0.6)), line: null };
    case "hearts":
      return { fill: fitted(grid(1.75, 1.45, 0.72), 0.55, (x, y) => heart(x, y, 0.62)), line: null };
    case "splashes": {
      let seed = 0;
      return { fill: fitted(grid(1.7, 3.2, 1.6), 0.85, (x, y) => splash(x, y, (seed += 1))), line: null };
    }
    case "bricks":
      return { fill: "", line: { d: bricks(1.1, 1.9), width: 0.38 } };
    case "scales":
      return { fill: "", line: { d: scales(0.8), width: 0.4 } };
  }
}

export const SKIN_GEOMETRY: Readonly<Record<TankSkin, SkinGeometry>> = Object.fromEntries(
  TANK_SKINS.map((skin) => [skin, build(skin)]),
) as Record<TankSkin, SkinGeometry>;
