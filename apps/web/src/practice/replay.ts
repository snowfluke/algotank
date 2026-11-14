// Playback state of a test match. Frame 0 is the start state. Frame i is the
// state after turn i - 1, so the last frame is the number of turns.

export const SPEED_IDS = ["slow", "normal", "fast", "fastest"] as const;
export type SpeedId = (typeof SPEED_IDS)[number];

/** Milliseconds one turn stays on screen at each speed. */
export const SPEED_MS: Readonly<Record<SpeedId, number>> = { slow: 1200, normal: 900, fast: 500, fastest: 200 };
export const DEFAULT_SPEED_ID: SpeedId = "normal";

export interface ReplayState {
  readonly frame: number;
  readonly lastFrame: number;
  readonly playing: boolean;
}

export type ReplayAction =
  | { readonly type: "play" }
  | { readonly type: "pause" }
  /** The timer fired: one frame forward, and pause at the end. */
  | { readonly type: "advance" }
  /** The scrubber moved: show this frame, and pause. */
  | { readonly type: "seek"; readonly frame: number };

export function initialReplay(lastFrame: number): ReplayState {
  return { frame: 0, lastFrame, playing: false };
}

export function replayReducer(state: ReplayState, action: ReplayAction): ReplayState {
  switch (action.type) {
    case "play":
      // Play at the end starts again from the start state.
      return { ...state, frame: state.frame >= state.lastFrame ? 0 : state.frame, playing: true };
    case "pause":
      return { ...state, playing: false };
    case "advance": {
      const frame = Math.min(state.frame + 1, state.lastFrame);
      return { ...state, frame, playing: state.playing && frame < state.lastFrame };
    }
    case "seek": {
      const frame = Number.isFinite(action.frame) ? Math.min(state.lastFrame, Math.max(0, Math.round(action.frame))) : state.frame;
      return { ...state, frame, playing: false };
    }
  }
}
