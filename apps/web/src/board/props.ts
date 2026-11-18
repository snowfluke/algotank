// Props of the arena board components. The live screen and the practice
// replay both render through these, so the two always look the same.

import type { ReactNode } from "react";
import type { PublicBot, PublicSnapshot } from "@game/arena";
import type { BotId, ThrowEvent } from "@game/engine";
import type { TankLook } from "../tank/look.ts";
import type { CameraWindow } from "./camera.ts";

/** What the board knows about a tank beyond the snapshot. */
export interface TankInfo {
  readonly look: TankLook;
  readonly isBot?: boolean;
}

/** A tank using a tunnel after the moves of a monthly turn (77-monthly-league.md, 2026-11-19). */
export type TankTunnel =
  | { readonly kind: "through"; readonly from: PublicBot }
  | { readonly kind: "exit"; readonly from: PublicBot; readonly look: TankLook }
  | { readonly kind: "enter"; readonly id: BotId };

export interface ArenaBoardProps {
  /** The state to draw. When it changes, tanks move to their new squares over tickMs. */
  readonly snapshot: PublicSnapshot;
  /** The shots of the turn that produced this snapshot. Empty for the start state. */
  readonly throws: readonly ThrowEvent[];
  /** Where tanks sank before appearing at the snapshot's squares. */
  readonly tunnels?: readonly TankTunnel[];
  readonly names: Readonly<Record<BotId, string>>;
  /** The viewer's own tank, drawn so it stands out, or null for a spectator. */
  readonly highlightId: BotId | null;
  /** Milliseconds one turn takes on screen. */
  readonly tickMs: number;
  /** The look per tank. Without it, or for a tank missing from it, the tank is plain in a colour that follows the order of the tanks. */
  readonly tanks?: ReadonlyMap<BotId, TankInfo>;
  /** Whole seconds before the first turn, shown large over the board, or null when no countdown runs. */
  readonly countdown?: number | null;
  /**
   * True while a replay is paused or scrubbed: the shots of this turn stay drawn
   * as a still picture instead of playing and fading, and no sound plays.
   */
  readonly paused?: boolean;
  /**
   * The part of a big arena to show (board/camera.ts), or null for the whole arena.
   * The board then fills its box at that window and draws only the tanks near it.
   */
  readonly camera?: CameraWindow | null;
  /**
   * The tank the zoomed view follows (monthly/MonthlyBoard.tsx), or null. The other tanks and their
   * gauges are drawn a little dimmer; the viewer's own tank never is (owner, 2026-11-17).
   */
  readonly focusId?: BotId | null;
  /** Tanks that leave tread marks on the last squares they left (board/tankTrail.ts): the monthly league's game masters. */
  readonly trailIds?: ReadonlySet<BotId>;
  /** A tap on the drawing of a tank (not the square it glides to), after its name tag shows: the monthly board's zoomed view follows that tank (monthly/MonthlyBoard.tsx). */
  readonly onTankTap?: (id: BotId) => void;
  /** Drawn on the ground under the tanks, in board units (CELL per square): the catalogue's ultimate glow (catalogue/UltimateEffect.tsx). */
  readonly underlay?: ReactNode;
  /** Drawn over the tanks and under the gauges, in board units: the catalogue's ultimate effects. */
  readonly overlay?: ReactNode;
}

export interface ScoreboardProps {
  readonly snapshot: PublicSnapshot;
  readonly names: Readonly<Record<BotId, string>>;
  readonly highlightId: BotId | null;
  /** When set, rows show at most this many entries, and always the highlighted tank. */
  readonly maxRows?: number;
  /** The look per tank, the same map the board gets. */
  readonly tanks?: ReadonlyMap<BotId, TankInfo>;
}
