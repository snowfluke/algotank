// The timer behind "Start in 1 / 2 / 3 / 5 minutes" in a private or presenter arena
// (docs/specs/revamp/75-organiser-tournament.md, section 3). The reducer owns the plan
// (phase.start, the table "Scheduled start" in packages/arena/src/types.ts); this file owns
// the timer and keeps it equal to the plan after every change, so a start now, a cancel, a
// reset or a close never leaves a timer behind. The timer goes through AutoSteps, so every
// arena message carries the time left (PublicArena.auto) and every viewer counts down from it
// instead of from the phone's own clock.
//
// | Plan in the arena            | Timer                                                      |
// |------------------------------|------------------------------------------------------------|
// | scheduled at T               | armed for T (moved when T changes)                         |
// | waiting, missed, or no plan  | none                                                       |
// | timer fires, enough players  | startNextRound (bots fill as for "start now")              |
// | timer fires, too few players | startMissed: the plan says "missed" for the owner's page   |
//
// Named limit: the timer lives in this process. A restart drops the plan to waiting (store.ts).

import { isPublicKind } from "@game/arena";
import type { AutoSteps } from "./auto-steps.ts";
import type { RoundRunner } from "./round-runner.ts";
import { startNextRound } from "./start-round.ts";
import type { ArenaRecord, Store } from "./store.ts";
import type { StreamHub } from "./stream.ts";
import type { Clock } from "./timers.ts";

export interface ScheduledStartParts {
  readonly store: Store;
  readonly runner: RoundRunner;
  readonly hub: StreamHub;
  readonly autoSteps: AutoSteps;
  readonly now: Clock;
}

/** Keeps each owner's arena's start timer equal to its plan. Call once at server start. */
export function watchScheduledStarts(parts: ScheduledStartParts): void {
  parts.store.onChange((record) => sync(parts, record));
}

function startsAtOf(record: ArenaRecord): number | null {
  const { phase } = record.arena;
  if ((phase.kind === "lobby" || phase.kind === "break") && phase.start.kind === "scheduled") return phase.start.startsAt;
  return null;
}

function sync(parts: ScheduledStartParts, record: ArenaRecord): void {
  // A public arena's timers belong to public-arenas.ts.
  if (isPublicKind(record.arena.settings.kind)) return;
  const arenaId = record.arena.id;
  const startsAt = startsAtOf(record);
  if (startsAt === null) {
    parts.autoSteps.cancel(arenaId);
    return;
  }
  if (parts.autoSteps.atOf(arenaId) === startsAt) return;
  parts.autoSteps.arm(arenaId, "start", Math.max(0, startsAt - parts.now()), () => fire(parts, record, startsAt));
}

function fire(parts: ScheduledStartParts, record: ArenaRecord, startsAt: number): void {
  // The arena may have closed, or the plan moved, since the timer was armed.
  if (parts.store.get(record.arena.id) !== record || startsAtOf(record) !== startsAt) return;
  try {
    const started = startNextRound(parts.store, parts.runner, record);
    if (started.ok) return;
    if (started.error !== "not_enough_players") throw new Error(`The scheduled start was refused: ${started.error}.`);
    const missed = parts.store.apply(record, { kind: "startMissed" });
    if (!missed.ok) throw new Error(`The arena rejected startMissed: ${missed.error}.`);
    parts.hub.sendArena(parts.autoSteps.view(missed.arena));
  } catch (error) {
    // A timer has no caller to answer. The plan stays as it is in memory, and the owner can start by hand.
    console.error(`The scheduled start of arena ${record.arena.id} failed:`, error);
  }
}
