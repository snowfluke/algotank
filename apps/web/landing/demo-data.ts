// The contract between the build (build.tsx writes demo.json) and the page's script
// (client.ts reads it). Board numbers come from the game's board, so the demo draws
// at the same scale; every drawing is ready-made SVG markup from the game's components.

/** One turn of one round: where every tank stands and what happened. */
export interface DemoFrame {
  /** Per tank, in `DemoData.tanks` order: x, y, heading in degrees (clockwise from east), water, points. */
  readonly bots: readonly number[];
  /** The demo tank's rule on this turn, as its position in the order (0 to 2), or -1 when no rule fitted. */
  readonly rule: number;
  /** Indices into `DemoData.shots`: the jets and marks of this turn. */
  readonly shots: readonly number[];
  /** Tank indices that a jet hit on this turn. */
  readonly hit: readonly number[];
  /** Tank indices that shot water on this turn. */
  readonly fired: readonly number[];
}

export interface DemoRoundData {
  /** Rule keys, top first. */
  readonly order: readonly string[];
  /** The demo tank's final place, 1 to 8. */
  readonly rank: number;
  /** The spawn first, then the state after each turn. */
  readonly frames: readonly DemoFrame[];
}

export interface DemoTank {
  /** The turning part: tracks, hull, barrel and turret. */
  readonly hull: string;
  /** The icon or letters, kept upright; null when the tank has none. */
  readonly hatch: string | null;
  readonly self: boolean;
}

export interface DemoBoard {
  readonly width: number;
  readonly height: number;
  readonly cell: number;
  readonly wall: number;
  readonly tankScale: number;
  readonly tankLift: number;
  readonly turretX: number;
}

/** One shot as the board draws it: the jet runs under the tanks, the splash, puff or dry drops lie over them. */
export interface DemoShot {
  readonly under: string;
  readonly over: string;
}

export interface DemoData {
  readonly board: DemoBoard;
  /** One turn, in milliseconds. */
  readonly tickMs: number;
  /** How long a jet, splash or wobble lasts, in milliseconds. */
  readonly fxMs: number;
  readonly tanks: readonly DemoTank[];
  /** Water gauge markup by water level, 0 to the tank's capacity. */
  readonly gauges: readonly string[];
  readonly shots: readonly DemoShot[];
  /** Keyed by the order's rule keys joined with "-". */
  readonly rounds: Readonly<Record<string, DemoRoundData>>;
}
