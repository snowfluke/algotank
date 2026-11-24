// When the league board shows each message of its stream (useLeagueLive.ts runs it). The server sends
// one turn every tickMs, but the way to the viewer (Cloudflare and its tunnel) sometimes holds turns
// back for a second or two and then delivers them together: measured on 2026-11-24 from a viewer's
// network, 10 to 11 such waits in 4 to 5 minutes and once 11.3 s, while the server's own output was
// steady to 10 ms. Shown on arrival, the board froze and then rushed the held turns.
//
// So each turn gets a slot on a steady clock: slot = base + turn × tickMs + delay, where base is the
// earliest (arrival − turn × tickMs) seen, which is the quickest way a turn has come so far. A turn
// that is held back for less than the delay still shows on its slot; one that comes after its slot
// shows at once. After a long silence every turn whose slot has passed shows in one update (a
// jump), and the clock is the same as before, so the board does not fall further behind.
//
// | Message            | Shows                                                        |
// |--------------------|--------------------------------------------------------------|
// | tick               | at its slot, or at once when the slot has passed             |
// | state, first       | at once: it is the board, and it sets the clock              |
// | state, later       | right after the messages queued before it (same turn)        |
// | closed             | at once, with every message queued before it                 |
// Messages always show in the order they came.

/** The board runs this many turns behind the stream (1.8 s at 900 ms a turn), which covers the measured waits of up to 1.4 s. */
export const PLAYOUT_DELAY_TURNS = 2;
/**
 * A queue longer than this (about 36 s of turns) is shown when the next message arrives, without
 * waiting for the timer: a hidden tab runs timers once a minute at most (useLeagueLive.ts).
 */
export const PLAYOUT_MAX_QUEUED = 40;
/**
 * How far base may rise per turn received, in ms. The earliest arrival sets base; this lets it forget
 * one that was unusually quick, so a lasting change in the way's delay is followed within minutes.
 */
const BASE_RISE_PER_TURN_MS = 2;

export type Arrival<T> =
  | { readonly kind: "tick" | "state"; readonly turn: number; readonly item: T }
  | { readonly kind: "closed"; readonly item: T };

export interface Queued<T> {
  readonly arrival: Arrival<T>;
  readonly arrivedAt: number;
  readonly item: T;
}

export interface Playout<T> {
  readonly queue: readonly Queued<T>[];
  /** Earliest arrival minus turn × tickMs, or null before the first message. */
  readonly base: number | null;
}

export const EMPTY_PLAYOUT: Playout<never> = { queue: [], base: null };

/** Queues one message that arrived at `arrivedAt` (Date.now()). */
export function receivePlayout<T>(playout: Playout<T>, arrival: Arrival<T>, arrivedAt: number, tickMs: number): Playout<T> {
  const queue = [...playout.queue, { arrival, arrivedAt, item: arrival.item }];
  if (arrival.kind === "closed") return { queue, base: playout.base };
  const sample = arrivedAt - arrival.turn * tickMs;
  // A later state belongs to the turn before it and comes with it, so only ticks and the first state set the clock.
  if (arrival.kind === "state" && playout.base !== null) return { queue, base: playout.base };
  return { queue, base: playout.base === null ? sample : Math.min(sample, playout.base + BASE_RISE_PER_TURN_MS) };
}

/** The messages due at `now`, in order, and when the next one is due (null: none queued). */
export function takeDuePlayout<T>(playout: Playout<T>, now: number, tickMs: number): { readonly playout: Playout<T>; readonly due: readonly Queued<T>[]; readonly nextAt: number | null } {
  const { queue, base } = playout;
  const closedAt = queue.findIndex(({ arrival }) => arrival.kind === "closed");
  if (closedAt >= 0) return { playout: { queue: queue.slice(closedAt + 1), base }, due: queue.slice(0, closedAt + 1), nextAt: closedAt + 1 < queue.length ? now : null };
  let taken = 0;
  let nextAt: number | null = null;
  for (const { arrival } of queue) {
    if (arrival.kind === "tick" && base !== null) {
      const slot = base + (arrival.turn + PLAYOUT_DELAY_TURNS) * tickMs;
      if (slot > now) {
        nextAt = slot;
        break;
      }
    }
    taken += 1;
  }
  return { playout: { queue: queue.slice(taken), base }, due: queue.slice(0, taken), nextAt };
}
