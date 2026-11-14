// The 24 hatch icons as geometry on a 24 by 24 grid, in one line style: an ink outline
// of the same weight on every icon, closed shapes filled with the tank's second colour
// (which gives the icon mass at 40 px), and small solid dots for eyes and pads. They
// are data, not components, so the board, the badge and the editor draw them the same way.

import type { TankIcon } from "@game/arena";

export interface IconGeometry {
  /** Closed shapes: filled with the second colour and outlined in ink. */
  readonly shapes: readonly string[];
  /** Open lines in ink. */
  readonly lines: readonly string[];
  /** Solid ink dots as [x, y, r]. */
  readonly dots: readonly (readonly [number, number, number])[];
}

/** Stroke width of every icon on the 24 grid. */
export const ICON_STROKE = 2.2;

const n = (value: number) => (Math.round(value * 100) / 100).toString();

function circle(x: number, y: number, r: number): string {
  return `M${n(x - r)} ${n(y)}a${n(r)} ${n(r)} 0 1 0 ${n(2 * r)} 0a${n(r)} ${n(r)} 0 1 0 ${n(-2 * r)} 0Z`;
}

function starPath(x: number, y: number, outer: number, inner: number): string {
  const points = Array.from({ length: 10 }, (_, i) => {
    const angle = -Math.PI / 2 + (i * Math.PI) / 5;
    const r = i % 2 === 0 ? outer : inner;
    return `${n(x + r * Math.cos(angle))} ${n(y + r * Math.sin(angle))}`;
  });
  return `M${points.join("L")}Z`;
}

function rays(count: number, from: number, to: number, turn = 0): string {
  return Array.from({ length: count }, (_, i) => {
    const a = turn + (i * 2 * Math.PI) / count;
    return `M${n(12 + from * Math.cos(a))} ${n(12 + from * Math.sin(a))}L${n(12 + to * Math.cos(a))} ${n(12 + to * Math.sin(a))}`;
  }).join("");
}

function snowflake(): string {
  const arms: string[] = [];
  for (let i = 0; i < 6; i += 1) {
    const a = -Math.PI / 2 + (i * Math.PI) / 3;
    const at = (r: number, da = 0) => `${n(12 + r * Math.cos(a + da))} ${n(12 + r * Math.sin(a + da))}`;
    arms.push(`M12 12L${at(9)}`);
    // A small V on each arm, two thirds of the way out.
    arms.push(`M${at(7.4, 0.32)}L${at(5.6)}L${at(7.4, -0.32)}`);
  }
  return arms.join("");
}

function flowerPetals(): string[] {
  return Array.from({ length: 5 }, (_, i) => {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / 5;
    return circle(12 + 5.2 * Math.cos(a), 12.3 + 5.2 * Math.sin(a), 3.6);
  });
}

export const TANK_ICON_GEOMETRY: Readonly<Record<TankIcon, IconGeometry>> = {
  star: { shapes: [starPath(12, 12.8, 10, 4.4)], lines: [], dots: [] },
  heart: {
    shapes: ["M12 20.5C5.5 16 3 12.5 3 9C3 6 5.3 4 7.8 4C9.7 4 11.2 5.1 12 6.6C12.8 5.1 14.3 4 16.2 4C18.7 4 21 6 21 9C21 12.5 18.5 16 12 20.5Z"],
    lines: [],
    dots: [],
  },
  bolt: { shapes: ["M14 2.5L4.5 13.5H11L9.5 21.5L19.5 9.5H13Z"], lines: [], dots: [] },
  drop: { shapes: ["M12 2.8C12 2.8 5 10.5 5 14.8A7 7 0 0 0 19 14.8C19 10.5 12 2.8 12 2.8Z"], lines: [], dots: [] },
  leaf: { shapes: ["M4.5 19.5C4.5 10 10 4 20 3.8C19.8 14 14 19.5 4.5 19.5Z"], lines: ["M4.5 19.5L13.5 10.5"], dots: [] },
  sun: { shapes: [circle(12, 12, 4.6)], lines: [rays(8, 7.4, 10.2)], dots: [] },
  moon: { shapes: ["M14.5 3.2A9 9 0 1 0 20.8 16.5A7 7 0 0 1 14.5 3.2Z"], lines: [], dots: [] },
  crown: { shapes: ["M3.5 18.5L2.8 7.5L8.3 11.5L12 4.5L15.7 11.5L21.2 7.5L20.5 18.5Z"], lines: [], dots: [] },
  fish: {
    shapes: ["M15.5 12C13 7 6.5 6.5 3 12C6.5 17.5 13 17 15.5 12Z", "M15.5 12L21 7.5V16.5Z"],
    lines: [],
    dots: [[7.4, 11, 1.3]],
  },
  cat: {
    shapes: ["M4.8 9.5L5.5 3.5L10 7.2H14L18.5 3.5L19.2 9.5C20.5 15.5 17 20.3 12 20.3C7 20.3 3.5 15.5 4.8 9.5Z"],
    lines: ["M10.8 15.6L12 16.6L13.2 15.6"],
    dots: [[9.2, 12.5, 1.25], [14.8, 12.5, 1.25]],
  },
  bird: {
    shapes: ["M3 15C3 10 7 7 11.5 7C14.5 7 16.8 8.8 17.5 11L21.5 12.3L17.5 13.6C17 17.3 13.5 19.5 9.5 19.5C7 19.5 4.5 18 3 15Z"],
    lines: ["M7 14C9 16 11.5 16 13 14"],
    dots: [[14, 10.6, 1.25]],
  },
  flower: { shapes: [...flowerPetals(), circle(12, 12.3, 3)], lines: [], dots: [] },
  rocket: {
    shapes: ["M8.5 13L4.5 17V20L8.8 17.5Z", "M15.5 13L19.5 17V20L15.2 17.5Z", "M12 2.5C16.3 5.5 16.8 11.5 15.6 17.5H8.4C7.2 11.5 7.7 5.5 12 2.5Z"],
    lines: ["M10.3 20.2L12 22L13.7 20.2"],
    dots: [[12, 9.5, 1.9]],
  },
  key: { shapes: [circle(7.5, 12, 4.3)], lines: ["M11.8 12H21.3M18.3 12V16M15 12V15"], dots: [] },
  bell: {
    shapes: ["M4.8 17.3C6.6 15.3 6.3 13 6.3 10.5A5.7 5.7 0 0 1 17.7 10.5C17.7 13 17.4 15.3 19.2 17.3Z"],
    lines: ["M9.8 19.6A2.3 2.3 0 0 0 14.2 19.6M12 2.8V4.8"],
    dots: [],
  },
  anchor: {
    shapes: [circle(12, 5, 2.3)],
    lines: ["M12 7.3V20.5M7.8 10.5H16.2M4 13.5C4.5 17.6 8 20.5 12 20.5C16 20.5 19.5 17.6 20 13.5"],
    dots: [],
  },
  cloud: {
    shapes: ["M7 19H17.3A4.2 4.2 0 0 0 17.9 10.6A6 6 0 0 0 6.6 10.2A4.4 4.4 0 0 0 7 19Z"],
    lines: [],
    dots: [],
  },
  flame: {
    shapes: ["M12 21.3C7.5 21.3 4.8 18.2 4.8 14.5C4.8 10.3 8.6 8.6 9.2 3.8C11.8 5.4 12.8 8.2 12.6 10.8C13.7 9.8 14.3 8.5 14.3 6.8C17.4 9 19.2 12 19.2 14.6C19.2 18.2 16.5 21.3 12 21.3Z"],
    lines: [],
    dots: [],
  },
  gem: { shapes: ["M7 4H17L21.2 9.5L12 20.8L2.8 9.5Z"], lines: ["M2.8 9.5H21.2"], dots: [] },
  paw: {
    shapes: ["M6.8 17C6.8 13.5 9.4 11.4 12 11.4C14.6 11.4 17.2 13.5 17.2 17C17.2 19.6 14.6 20.2 12 19.2C9.4 20.2 6.8 19.6 6.8 17Z"],
    lines: [],
    dots: [[4.8, 10.2, 2], [9, 5.8, 2], [15, 5.8, 2], [19.2, 10.2, 2]],
  },
  note: { shapes: ["M4.8 18.3a3.4 2.7 0 1 0 6.8 0a3.4 2.7 0 1 0 -6.8 0Z"], lines: ["M11.6 18.3V3.5C14 6 18.5 6.5 19 10.5"], dots: [] },
  snowflake: { shapes: [], lines: [snowflake()], dots: [] },
  mushroom: {
    shapes: ["M9 13.5V18.6C9 20.2 10.2 20.8 12 20.8C13.8 20.8 15 20.2 15 18.6V13.5Z", "M2.8 13.5C2.8 7.6 7 3.3 12 3.3C17 3.3 21.2 7.6 21.2 13.5Z"],
    lines: [],
    dots: [[8, 9.2, 1.5], [15, 7.5, 1.5]],
  },
  smile: { shapes: [circle(12, 12, 9.3)], lines: ["M7.8 14.2C9.4 17 14.6 17 16.2 14.2"], dots: [[8.8, 9.8, 1.4], [15.2, 9.8, 1.4]] },
};
