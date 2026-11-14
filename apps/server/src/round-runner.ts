// Plays a round in real time: after a pause that lets players find their tank, one
// timer per running arena steps the engine and sends each tick to the stream.

import type { ArenaId } from "@game/arena";
import { createRound, standings, stepRound, type RoundConfig, type RoundState, type Snapshot } from "@game/engine";
import type { AutoSteps } from "./auto-steps.ts";
import type { StreamHub } from "./stream.ts";
import { announcementFor } from "./rule-set-draw.ts";
import type { ArenaRecord, Store } from "./store.ts";
import { NO_METRICS, type MetricsRecorder } from "./metrics/metrics.ts";
import type { ArenaStats, RoundOutcome } from "./stats/arena-stats.ts";
import type { Clock, Scheduler } from "./timers.ts";

/** The pause between roundStart and the first tick, so clients can count down while players find their tank. */
export const ROUND_START_DELAY_MS = 3000;

interface Run {
  readonly round: number;
  readonly state: RoundState;
  /** When the first tick is due. */
  readonly startsAt: number;
  /** When the timer fired last (or the ticks started), for how late the next turn fires. */
  lastFiredAt: number;
  /** Cancels the pause, and once the ticks run, stops them. */
  stop: () => void;
}

export interface RoundRunnerOptions {
  readonly scheduler: Scheduler;
  readonly now: Clock;
  readonly startDelayMs: number;
  /** Counts games and rounds and times the turns (metrics/metrics.ts). NO_METRICS when not given. */
  readonly metrics?: MetricsRecorder;
  /** The players' statistics (stats/arena-stats.ts). None when not given. */
  readonly stats?: ArenaStats;
}

export class RoundRunner {
  private readonly runs = new Map<ArenaId, Run>();
  private readonly metrics: MetricsRecorder;

  constructor(
    private readonly store: Store,
    private readonly hub: StreamHub,
    private readonly autoSteps: AutoSteps,
    private readonly options: RoundRunnerOptions,
  ) {
    this.metrics = options.metrics ?? NO_METRICS;
  }

  /**
   * Starts playing the round the arena just entered. Call it right after the
   * arena accepted a startRound event. When the round cannot start, the arena
   * leaves the running phase (see abort) and this throws.
   */
  begin(record: ArenaRecord): void {
    const { arena } = record;
    const { phase } = arena;
    if (phase.kind !== "running") throw new Error("begin needs an arena in the running phase.");

    try {
      // Players edit their strategy in the break, so keep what plays now for the replay.
      const strategyOf = new Map(arena.players.map((p) => [p.id, p.strategy] as const));
      const config: RoundConfig = {
        seed: phase.seed,
        ticksTotal: arena.settings.ticksPerRound,
        survivorsAfterRound: phase.survivorsAfterRound,
        // The same id goes to the live round and, through the stored config, to the replay.
        ruleSetId: phase.ruleSetId,
        players: phase.playerIds.map((id) => {
          const strategy = strategyOf.get(id);
          if (strategy === undefined) throw new Error(`Round player ${id} is not in arena ${arena.id}.`);
          return { id, strategy };
        }),
      };
      const state = createRound(config);
      this.store.setRoundConfig(record, phase.round, config);
      const humans = new Set(arena.players.filter((p) => !p.isBot).map((p) => p.id));
      this.withStats(arena.id, (stats) => stats.roundStarted(arena.id, arena.game, phase.round, config.players.filter((p) => humans.has(p.id))));
      const { scheduler, now, startDelayMs } = this.options;
      this.hub.sendArena(this.autoSteps.view(arena));
      this.hub.sendRoundStart(arena.id, phase.round, state.snapshot, startDelayMs);

      const run: Run = { round: phase.round, state, startsAt: now() + startDelayMs, lastFiredAt: now(), stop: () => {} };
      const startTicks = () => {
        run.lastFiredAt = now();
        run.stop = scheduler.every(() => this.step(record), arena.settings.tickMs);
      };
      // Without a pause the ticks start now rather than after a zero-length timer.
      if (startDelayMs > 0) run.stop = scheduler.after(startTicks, startDelayMs);
      else startTicks();
      this.runs.set(arena.id, run);
      if (phase.round === 1) this.metrics.count("gameStarted", arena.settings.kind);
    } catch (error) {
      this.abort(record, phase.round, error);
      throw error;
    }
  }

  /**
   * The spawn state or the state after the latest tick, and what is left of the pause
   * before the first tick (0 once the ticks run), or null when no round runs.
   */
  currentRound(arenaId: ArenaId): { readonly round: number; readonly snapshot: Snapshot; readonly startsInMs: number } | null {
    const run = this.runs.get(arenaId);
    if (run === undefined) return null;
    return { round: run.round, snapshot: run.state.snapshot, startsInMs: Math.max(0, run.startsAt - this.options.now()) };
  }

  /** Stops the round of an arena that is being closed. The arena is not changed. */
  stop(arenaId: ArenaId): void {
    this.runs.get(arenaId)?.stop();
    this.runs.delete(arenaId);
    this.options.stats?.forget(arenaId);
  }

  /**
   * Statistics only read the round, so their failure must never stop it: a throw here would
   * abort the round, or in complete() leave the pages without the arena message. Logged instead.
   */
  private withStats(arenaId: ArenaId, use: (stats: ArenaStats) => void): void {
    const stats = this.options.stats;
    if (stats === undefined) return;
    try {
      use(stats);
    } catch (error) {
      console.error(`The statistics of arena ${arenaId} failed; the round goes on without them:`, error);
      // Its own label: the round went on, so a "round" error would report a failed round that did not fail.
      this.metrics.error("stats");
    }
  }

  /** Stops every timer. */
  stopAll(): void {
    for (const run of this.runs.values()) run.stop();
    this.runs.clear();
  }

  /**
   * One timer firing. The firing after the last tick completes the round, so
   * viewers receive the last tick one tick interval before the arena message
   * for the break, and the screen can show the final positions.
   */
  private step(record: ArenaRecord): void {
    const arenaId = record.arena.id;
    const run = this.runs.get(arenaId);
    if (run === undefined) return;
    const firedAt = this.options.now();
    this.metrics.observe("turnLateMs", "arena", firedAt - run.lastFiredAt - record.arena.settings.tickMs);
    run.lastFiredAt = firedAt;

    try {
      if (run.state.isOver) {
        this.complete(record, run);
        return;
      }
      // performance.now(), because the injected clock does not move during one step.
      const computeStart = performance.now();
      const before = run.state.snapshot;
      const result = stepRound(run.state);
      this.metrics.observe("turnComputeMs", "arena", performance.now() - computeStart);
      this.hub.sendTick(arenaId, run.round, result);
      this.withStats(arenaId, (stats) => stats.turn(arenaId, before, result));
    } catch (error) {
      this.abort(record, run.round, error);
    }
  }

  private complete(record: ArenaRecord, run: Run): void {
    run.stop();
    this.runs.delete(record.arena.id);
    const { phase, settings } = record.arena;
    if (phase.kind !== "running") throw new Error("complete needs an arena in the running phase.");
    // The next round is announced now (announced mode) and never repeats this round's rule set. A final announces nothing.
    const nextRuleSetId = phase.isFinal ? null : announcementFor(settings.ruleSetMode, phase.ruleSetId);
    const completed = this.store.apply(record, { kind: "roundCompleted", standings: standings(run.state), nextRuleSetId });
    if (!completed.ok) throw new Error(`The arena rejected the standings: ${completed.error}.`);
    this.metrics.count("roundPlayed", settings.kind);
    this.metrics.count("tanksInRounds", settings.kind, phase.playerIds.length);
    if (completed.arena.phase.kind === "finished") this.metrics.count("gameFinished", settings.kind);
    // Each player's own statistics, just before the arena message that ends the round, so the page shows the card with the result.
    const after = completed.arena.phase;
    const outcome: RoundOutcome = after.kind === "finished" ? { kind: "finished", winnerId: after.winnerId } : { kind: "goesOn" };
    this.withStats(record.arena.id, (stats) => {
      for (const [playerId, own] of stats.roundCompleted(record.arena.id, outcome)) this.hub.sendStats(record.arena.id, playerId, own);
    });
    // record.arena, not completed.arena: a listener of the change (results.ts) may have moved the arena on since.
    this.hub.sendArena(this.autoSteps.view(record.arena));
  }

  /**
   * A failure here is a bug in the engine or the reducer. The failure stays in
   * this arena: its timer stops and other arenas keep running. The round counts
   * for nothing and the arena returns to the phase before it, so the owner
   * (or the public arena timer) can start the round again. The clients learn from the arena message. This never
   * throws, because it runs inside a catch block.
   */
  private abort(record: ArenaRecord, round: number, error: unknown): void {
    const arenaId = record.arena.id;
    console.error(`Round ${round} of arena ${arenaId} failed:`, error);
    this.metrics.error("round");
    this.withStats(arenaId, (stats) => stats.roundAborted(arenaId));
    this.runs.get(arenaId)?.stop();
    this.runs.delete(arenaId);

    let aborted;
    try {
      aborted = this.store.apply(record, { kind: "roundAborted" });
    } catch (saveError) {
      // The arena is back in the lobby or break in memory and only the save failed. Say so and still tell the clients.
      console.error(`Arena ${arenaId} could not be saved after round ${round} failed:`, saveError);
      this.hub.sendArena(this.autoSteps.view(record.arena));
      return;
    }
    // Rejected when the round had already completed and only the message to the clients failed.
    if (!aborted.ok) return;
    this.hub.sendArena(this.autoSteps.view(aborted.arena));
  }
}
