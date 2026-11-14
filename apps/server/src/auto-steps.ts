// What the server will do by itself in an arena, and when: the public arena timers.
// Every arena message goes through view(), so each one carries the time left at the
// moment it is sent (PublicArena.auto), and the reducer never reads a clock.

import { isPublicKind, toPublicArena, type Arena, type ArenaId, type AutoStep, type PublicArena } from "@game/arena";
import { everyHumanReady, type PublicRules } from "./public-kinds.ts";
import type { Clock, Scheduler } from "./timers.ts";

type AutoAction = NonNullable<AutoStep>["action"];

interface Pending {
  readonly action: AutoAction;
  readonly at: number;
  readonly cancel: () => void;
}

export class AutoSteps {
  private readonly pending = new Map<ArenaId, Pending>();

  constructor(
    private readonly scheduler: Scheduler,
    private readonly now: Clock,
    /** The public arenas' countdowns, for nextGameInMs. */
    private readonly rules: PublicRules,
  ) {}

  /** Runs `run` after `inMs`, in place of any step the arena had. */
  arm(arenaId: ArenaId, action: AutoAction, inMs: number, run: () => void): void {
    this.cancel(arenaId);
    const cancel = this.scheduler.after(() => {
      // Removed before it runs, so `run` sees no pending step and may arm the next one.
      this.pending.delete(arenaId);
      run();
    }, inMs);
    this.pending.set(arenaId, { action, at: this.now() + inMs, cancel });
  }

  cancel(arenaId: ArenaId): void {
    this.pending.get(arenaId)?.cancel();
    this.pending.delete(arenaId);
  }

  cancelAll(): void {
    for (const arenaId of [...this.pending.keys()]) this.cancel(arenaId);
  }

  actionOf(arenaId: ArenaId): AutoAction | null {
    return this.pending.get(arenaId)?.action ?? null;
  }

  /** The time the pending step runs, or null. public-arenas.ts compares it to avoid re-arming the same step. */
  atOf(arenaId: ArenaId): number | null {
    return this.pending.get(arenaId)?.at ?? null;
  }

  stepOf(arenaId: ArenaId): AutoStep {
    const step = this.pending.get(arenaId);
    return step === undefined ? null : { action: step.action, inMs: Math.max(0, step.at - this.now()) };
  }

  /** The arena as every viewer sees it, now. */
  view(arena: Arena): PublicArena {
    const step = this.stepOf(arena.id);
    return toPublicArena(arena, step, this.nextGameInMs(arena, step));
  }

  /** See PublicArena.nextGameInMs. */
  private nextGameInMs(arena: Arena, step: AutoStep): number | null {
    const { kind } = arena.settings;
    if (!isPublicKind(kind) || step === null) return null;
    if (arena.phase.kind === "lobby" && step.action === "start") return step.inMs;
    if (arena.phase.kind === "finished" && step.action === "reset") {
      // Ready on the result carries into the next lobby (public-arenas.ts, syncLobby).
      const rules = this.rules[kind];
      return step.inMs + (everyHumanReady(arena) ? rules.readyCountdownMs : rules.countdownMs);
    }
    return null;
  }
}
