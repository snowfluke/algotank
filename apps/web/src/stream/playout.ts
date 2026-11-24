// When a live board shows each message of its stream: the monthly league (monthly/useLeagueLive.ts)
// and an arena room (stream/useArenaStream.ts). The server sends one turn every tickMs, but the way
// to the viewer sometimes holds turns back for a second or two and then delivers them together:
// measured on 2026-11-24 from a viewer's network, 10 to 13 such waits in 4 minutes and once 11.3 s,
// the same over Cloudflare and over a direct SSH tunnel, while the server's own output was steady to
// 10 ms. Shown on arrival, the board froze and then rushed the held turns.
//
// So each turn gets a slot on a steady clock: slot = base + turn × tickMs + delay, where base is
// the earliest (arrival − turn × tickMs) seen, which is the quickest way a turn has come so far. A
// turn that is held back for less than the delay still shows on its slot; one that comes after its
// slot shows at once. After a long silence every turn whose slot has passed shows in one update (a
// jump), and the clock is the same as before, so the board does not fall further behind.
//
// | Message  | Example                                   | Shows                                          |
// |----------|-------------------------------------------|------------------------------------------------|
// | turn     | a tick                                    | at its slot, or at once when the slot passed   |
// | update   | a later league state, an arena, stats     | right after the messages queued before it      |
// | restart  | the first league state, a roundStart      | like an update; the next turn starts the clock |
// | flush    | closed                                    | at once, with every message queued before it   |
// Messages always show in the order they came. A turn's slot is fixed when it arrives, so a restart
// does not move the turns of the round before it.

/**
 * How far the board runs behind the stream, in ms: 2 turns of the league, which covers the measured
 * waits of up to 1.4 s. The waits are network time, so the delay is the same for every turn length.
 */
export const PLAYOUT_DELAY_MS = 1_800;
/**
 * A queue longer than this (about 36 s of turns at 900 ms) is shown when the next message arrives,
 * without waiting for the timer: a hidden tab runs timers once a minute at most.
 */
export const PLAYOUT_MAX_QUEUED = 40;
/**
 * How far base may rise per turn received, in ms. The earliest arrival sets base; this lets it forget
 * one that was unusually quick, so a lasting change in the way's delay is followed within minutes.
 */
const BASE_RISE_PER_TURN_MS = 2;

export type Arrival<T> =
  | { readonly kind: "turn"; readonly turn: number; readonly item: T }
  | { readonly kind: "update" | "restart" | "flush"; readonly item: T };

export interface Queued<T> {
  readonly item: T;
  readonly arrivedAt: number;
  /** When a turn is due (Date.now() time); null for the other messages, which show when they reach the front. */
  readonly slotAt: number | null;
  readonly flush: boolean;
}

export interface Playout<T> {
  readonly queue: readonly Queued<T>[];
  /** Earliest arrival minus turn × tickMs on the current clock, or null until a turn sets it. */
  readonly base: number | null;
}

export const EMPTY_PLAYOUT: Playout<never> = { queue: [], base: null };

/** Queues one message that arrived at `arrivedAt` (Date.now()). */
export function receivePlayout<T>(playout: Playout<T>, arrival: Arrival<T>, arrivedAt: number, tickMs: number): Playout<T> {
  if (arrival.kind !== "turn") {
    const queued = { item: arrival.item, arrivedAt, slotAt: null, flush: arrival.kind === "flush" };
    return { queue: [...playout.queue, queued], base: arrival.kind === "restart" ? null : playout.base };
  }
  const sample = arrivedAt - arrival.turn * tickMs;
  const base = playout.base === null ? sample : Math.min(sample, playout.base + BASE_RISE_PER_TURN_MS);
  const slotAt = base + arrival.turn * tickMs + PLAYOUT_DELAY_MS;
  return { queue: [...playout.queue, { item: arrival.item, arrivedAt, slotAt, flush: false }], base };
}

/** The messages due at `now`, in order, and when the next one is due (null: none queued). */
export function takeDuePlayout<T>(playout: Playout<T>, now: number): { readonly playout: Playout<T>; readonly due: readonly Queued<T>[]; readonly nextAt: number | null } {
  const { queue, base } = playout;
  // Everything up to the last flush shows now; the web target's library has no findLastIndex.
  let taken = 0;
  queue.forEach(({ flush }, index) => {
    if (flush) taken = index + 1;
  });
  while (taken < queue.length) {
    const slotAt = queue[taken]!.slotAt;
    if (slotAt !== null && slotAt > now) break;
    taken += 1;
  }
  const rest = queue.slice(taken);
  return { playout: { queue: rest, base }, due: queue.slice(0, taken), nextAt: rest[0]?.slotAt ?? null };
}
