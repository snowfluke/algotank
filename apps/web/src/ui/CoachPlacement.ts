// Where a coach mark's callout goes (docs/specs/revamp/65-guidance.md, section 2): next
// to the element it points at, below, above or beside it, never off the screen and never
// over the element and its ring. Of the places that qualify, it takes the one that covers
// the fewest other controls (by their centre point, as the audit's overlap rule checks),
// so a "do" step leaves the rest of the screen usable. Pure geometry, so it is tested.
//
// The rule of the audit (70-fixes-after-guidance.md, fix 8): for its one step a callout may
// cover other controls, but never its own target, the bottom bar with its tabs, a room's
// countdown clock, or what a screen marks to keep in view. Those are `keepClear` boxes: no
// place may meet one. Next to a keep-clear box beside the target (the status line under the
// header's tank) the callout also tries the place just past that box.

export interface Rect {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

export type Side = "below" | "above" | "right" | "left";

export interface PlaceInput {
  /** The element the step points at. */
  readonly target: Rect;
  /** The callout's measured size. */
  readonly size: { readonly width: number; readonly height: number };
  readonly viewport: { readonly width: number; readonly height: number };
  /** Controls on the screen outside the target; covering their centre costs one each. */
  readonly obstacles: readonly Rect[];
  /** Headings and sentences outside the target; covering their centre costs a quarter, so a control always weighs more and a tie between sides goes to the one that hides less to read. */
  readonly texts?: readonly Rect[];
  /** Space the ring takes around the target. */
  readonly ringPad: number;
  /** Space between the ring and the callout. */
  readonly gap: number;
  /** Space kept free at the edges of the viewport. */
  readonly edge: number;
  /** Boxes the callout must never meet: the bottom bar and its tabs, the countdown clock, a screen's `data-coach-keep-clear`. */
  readonly keepClear?: readonly Rect[];
}

export interface Placement {
  readonly left: number;
  readonly top: number;
  readonly side: Side;
  /** How many controls' centres the callout covers. */
  readonly covers: number;
}

const SIDES: readonly Side[] = ["below", "above", "right", "left"];

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

function overlaps(a: Rect, b: Rect): boolean {
  return a.left < b.left + b.width && b.left < a.left + a.width && a.top < b.top + b.height && b.top < a.top + a.height;
}

function inflate(rect: Rect, by: number): Rect {
  return { left: rect.left - by, top: rect.top - by, width: rect.width + 2 * by, height: rect.height + 2 * by };
}

function containsPoint(rect: Rect, x: number, y: number): boolean {
  return x >= rect.left && x <= rect.left + rect.width && y >= rect.top && y <= rect.top + rect.height;
}

/** Every place to try: each side, aligned to the target's start, centre and end, pushed inside the viewport; on each side also just past every keep-clear box there. */
function candidates(input: PlaceInput): { readonly rect: Rect; readonly side: Side }[] {
  const { target, size, viewport, ringPad, gap, edge } = input;
  const keep = input.keepClear ?? [];
  const out: { rect: Rect; side: Side }[] = [];
  const minX = edge;
  const maxX = viewport.width - edge - size.width;
  const minY = edge;
  const maxY = viewport.height - edge - size.height;
  const centreX = target.left + target.width / 2 - size.width / 2;
  const centreY = target.top + target.height / 2 - size.height / 2;
  for (const side of SIDES) {
    if (side === "below" || side === "above") {
      const near = side === "below" ? target.top + target.height + ringPad + gap : target.top - ringPad - gap - size.height;
      const past = keep.map((k) => (side === "below" ? k.top + k.height + gap : k.top - gap - size.height)).filter((top) => (side === "below" ? top > near : top < near));
      for (const top of [near, ...past]) {
        for (const left of [centreX, target.left - ringPad, target.left + target.width + ringPad - size.width]) {
          out.push({ side, rect: { left: clamp(left, minX, maxX), top, width: size.width, height: size.height } });
        }
      }
    } else {
      const near = side === "right" ? target.left + target.width + ringPad + gap : target.left - ringPad - gap - size.width;
      const past = keep.map((k) => (side === "right" ? k.left + k.width + gap : k.left - gap - size.width)).filter((left) => (side === "right" ? left > near : left < near));
      for (const left of [near, ...past]) {
        for (const top of [centreY, target.top - ringPad, target.top + target.height + ringPad - size.height]) {
          out.push({ side, rect: { left, top: clamp(top, minY, maxY), width: size.width, height: size.height } });
        }
      }
    }
  }
  return out;
}

/** The best place, or null when no place fits on the screen without covering the target. */
export function placeCallout(input: PlaceInput): Placement | null {
  const { viewport, edge } = input;
  const ring = inflate(input.target, input.ringPad + 1);
  const targetCentre = { x: input.target.left + input.target.width / 2, y: input.target.top + input.target.height / 2 };
  let best: { readonly placement: Placement; readonly score: readonly number[] } | null = null;
  for (const { rect, side } of candidates(input)) {
    const inside =
      rect.left >= edge - 0.5 && rect.top >= edge - 0.5 && rect.left + rect.width <= viewport.width - edge + 0.5 && rect.top + rect.height <= viewport.height - edge + 0.5;
    if (!inside || overlaps(rect, ring) || (input.keepClear ?? []).some((k) => overlaps(rect, k))) continue;
    const covered = (list: readonly Rect[]) => list.filter((o) => containsPoint(rect, o.left + o.width / 2, o.top + o.height / 2)).length;
    const covers = covered(input.obstacles);
    const distance = Math.hypot(rect.left + rect.width / 2 - targetCentre.x, rect.top + rect.height / 2 - targetCentre.y);
    // Fewest covered controls (and a quarter point per covered sentence) first; then the side's order (below, above, right, left); then the closest.
    const score = [covers + covered(input.texts ?? []) / 4, SIDES.indexOf(side), distance];
    if (best === null || isLower(score, best.score)) best = { placement: { left: rect.left, top: rect.top, side, covers }, score };
  }
  return best?.placement ?? null;
}

function isLower(a: readonly number[], b: readonly number[]): boolean {
  for (let i = 0; i < a.length; i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    if (x !== y) return x < y;
  }
  return false;
}

/**
 * The pill that says where to go: beside the element that leads there; else at the bottom of the
 * screen, or just above the lowest keep-clear box there (the bottom bar), or at the top.
 */
export function placePill(input: Omit<PlaceInput, "target"> & { readonly anchor: Rect | null }): { readonly left: number; readonly top: number } {
  const { size, viewport, edge } = input;
  if (input.anchor !== null) {
    const placed = placeCallout({ ...input, target: input.anchor });
    if (placed !== null) return placed;
  }
  const keep = input.keepClear ?? [];
  const left = clamp(viewport.width / 2 - size.width / 2, edge, viewport.width - edge - size.width);
  const bottom = Math.max(edge, viewport.height - edge - size.height);
  const tops = [bottom, ...keep.map((k) => k.top - input.gap - size.height).sort((a, b) => b - a), edge];
  const free = tops.find((top) => top >= edge - 0.5 && !keep.some((k) => overlaps({ left, top, width: size.width, height: size.height }, k)));
  return { left, top: free ?? bottom };
}
