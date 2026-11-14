// The public arenas ("Play now"): practice and tournament (docs/specs/revamp/67-public-arenas.md;
// the monthly arena is a league that always runs, apps/server/src/monthly/). The server keeps at
// least one arena of each kind, starts and resets their games on timers, fills empty seats with
// bots, and settles each finished tournament: its winner goes on the list of recent winners. The
// numbers are in public-kinds.ts. Presence comes from the stream hub only.
//
// Cycle of one public arena (the step and its time reach clients as PublicArena.auto):
// | Phase    | Condition           | Timer                                                       |
// |----------|---------------------|-------------------------------------------------------------|
// | lobby    | at least one human  | "start" at the lobby deadline (table below): add bots up to |
// |          |                     | botFillSizeOf(kind), start round 1                          |
// | lobby    | no human            | none: the arena idles. An extra practice arena              |
// |          |                     | closes once it has idled for one whole game (gameMsOf)      |
// | lobby    | timer "start" fires | remove humans whose stream has been closed for over 20 s;   |
// |          |                     | with no human left the arena idles instead of starting      |
// | running  |                     | none: the round runner plays the round                      |
// | break    | (tournament only)   | "start" after breakMs (20 s): the next round                |
// | finished |                     | settle the game once, then "reset" after resultMs: reset,   |
// |          |                     | remove humans whose stream has been closed for over 3       |
// |          |                     | minutes, and remove the arena when it is an extra practice  |
// |          |                     | arena with no human left. A human who tapped                |
// |          |                     | "I'm ready" on the result is ready in the new lobby         |
//
// Lobby deadline (the server owns it; the reducer owns who is ready):
// | From        | To          | Actor  | Guard / effect                                              |
// |-------------|-------------|--------|-------------------------------------------------------------|
// | idle        | counting    | player | the first human joins: deadline = now + countdownMs         |
// | counting    | short       | player | every human is ready: at = min(deadline, now + ready time)  |
// | short       | counting    | player | a human who is not ready joins: back to the deadline        |
// | counting,   | idle        | player | the last human leaves or is removed                          |
// | short       |             |        |                                                             |
// | counting,   | (running)   | server | the timer fires: the deadline is forgotten, then the round  |
// | short       |             |        | starts; a failed start counts down again from the start    |
// Ready only ever shortens the countdown: a deadline that is sooner than the ready time stays.
//
// Tournament (one arena, never removed):
// | From     | To       | Actor          | Guard                                                     |
// |----------|----------|----------------|-----------------------------------------------------------|
// | lobby    | running  | server (timer) | the lobby deadline passed; bots fill to 16; >= 2 players  |
// | running  | break    | engine         | a cut round ended (more than 8 started it)                |
// | break    | running  | server (timer) | breakMs (20 s) passed                                     |
// | running  | finished | engine         | the final (8 or fewer started it) ended                   |
// | running  | lobby    | engine         | the round failed before any round completed (bots leave)  |
// | running  | break    | engine         | the round failed after a round completed                  |
// | finished | lobby    | server (timer) | resultMs (30 s) passed: reset, waiting players play next  |
// Joining is open in every phase; outside the lobby a player waits for the next tournament.
// Settling a finished tournament: a person who won goes on the winners list; a bot's win
// records nothing. Terminal state: none.
//
// sync() derives the timer from the phase, so it is called after every change of a
// public arena (Store.onChange) and once for each arena at start, which arms the timers
// again after a restart. Settling happens inside sync, in the same call that stored the
// final's result, so it is done before the round runner sends the finished arena message.
// It never throws: a failure is logged and the reset timer is still armed.

import {
  createArena,
  maxPlayersOf,
  PUBLIC_KINDS,
  isPublicKind,
  type Arena,
  type ArenaId,
  type PublicKind,
  type PublicStatusResponse,
} from "@game/arena";
import type { ArenaParts } from "./arena-lifetime.ts";
import { HttpError } from "./http.ts";
import { everyHumanReady, gameMsOf, PUBLIC_ABSENT_MS, PUBLIC_START_ABSENT_MS, type PublicRules } from "./public-kinds.ts";
import { announcementFor } from "./rule-set-draw.ts";
import { startNextRound } from "./start-round.ts";
import type { ArenaRecord } from "./store.ts";
import type { Clock, Scheduler } from "./timers.ts";
import type { TournamentWinners } from "./tournament-winners.ts";

export const DEFAULT_PUBLIC_ARENA_MAX = 20;
/** Recent winners on the chooser's tournament line. */
const STATUS_WINNERS = 5;

export interface PublicArenasOptions {
  readonly now: Clock;
  /** Runs the closing of an extra arena that idles without humans. */
  readonly scheduler: Scheduler;
  /** PUBLIC_ARENA_MAX: the most practice arenas at once. */
  readonly maxArenas: number;
  /** Closes an arena (arena-lifetime.ts closeArena with the server's parts). */
  readonly close: (record: ArenaRecord) => void;
  readonly rules: PublicRules;
  readonly winners: TournamentWinners;
}

const humansOf = (arena: Arena) => arena.players.filter((p) => !p.isBot);

/** What seat() knows of one practice room. */
export interface PracticeRoom {
  readonly arenaId: ArenaId;
  readonly inLobby: boolean;
  readonly humans: number;
}

export type PracticeRoomChoice =
  | { readonly kind: "join"; readonly arenaId: ArenaId }
  | { readonly kind: "open" }
  | { readonly kind: "full" };

/**
 * Where "Play now" seats a visitor in the practice arena. A first-timer must play within
 * 30 s, so a room whose game runs is the last choice (first-timer test, 2026-11-12).
 * | Case                                                    | Choice                                  |
 * |---------------------------------------------------------|-----------------------------------------|
 * | a room in its lobby has a free seat                     | join it; the one with the most humans,  |
 * |                                                         | so its game has the most people         |
 * | none, and fewer than PUBLIC_ARENA_MAX rooms exist       | open a new room (bots fill it at start) |
 * | the maximum is reached; a room whose game runs or shows | join it, the most humans first: the     |
 * | its result has a free seat                              | visitor waits for the next game         |
 * | the maximum is reached and every room is full           | full (503 no_public_seat)               |
 */
function choosePracticeRoom(rooms: readonly PracticeRoom[], capacity: number, maxRooms: number): PracticeRoomChoice {
  const busiestFree = (candidates: readonly PracticeRoom[]): PracticeRoom | undefined =>
    candidates.filter((room) => room.humans < capacity).reduce<PracticeRoom | undefined>((best, room) => (best === undefined || room.humans > best.humans ? room : best), undefined);
  const lobby = busiestFree(rooms.filter((room) => room.inLobby));
  if (lobby !== undefined) return { kind: "join", arenaId: lobby.arenaId };
  if (rooms.length < maxRooms) return { kind: "open" };
  const waiting = busiestFree(rooms);
  return waiting === undefined ? { kind: "full" } : { kind: "join", arenaId: waiting.arenaId };
}

const noPublicSeat = () =>
  new HttpError(503, "Every arena of this kind is full right now. Please try again in a minute.", { code: "no_public_seat" });
const kindOf = (record: ArenaRecord): PublicKind | null => {
  const { kind } = record.arena.settings;
  return isPublicKind(kind) ? kind : null;
};

export class PublicArenas {
  // ponytail: the deadlines live in memory, so a restart starts a lobby's countdown again in full.
  // Store them in the arena's snapshot when a restart during a lobby must keep its time.
  /** The end of the normal lobby countdown of each arena that has a human in its lobby. */
  private readonly lobbyDeadlines = new Map<ArenaId, number>();
  /** When the short countdown ends, set at the moment every human of the lobby became ready. */
  private readonly readyDeadlines = new Map<ArenaId, number>();
  /** Cancels the closing of each practice arena whose lobby has no human. */
  private readonly emptyCloses = new Map<ArenaId, () => void>();

  constructor(
    private readonly parts: ArenaParts,
    private readonly options: PublicArenasOptions,
  ) {
    parts.store.onChange((record) => this.sync(record));
  }

  /** Creates an arena of each public kind that has none, and arms the timers of the others. */
  start(): void {
    for (const kind of PUBLIC_KINDS) {
      const existing = this.recordsOf(kind);
      if (existing.length === 0) this.create(kind);
      for (const record of existing) {
        // The streams of this process are new, so every human counts as seen now.
        for (const player of humansOf(record.arena)) this.parts.hub.markSeen(record.arena.id, player.id);
        this.sync(record);
      }
    }
  }

  /**
   * The arena a visitor should open for `kind`. The tournament has one arena, returned even
   * when it is full (its join answers arena_full). Practice: choosePracticeRoom.
   */
  seat(kind: PublicKind): ArenaId {
    if (kind === "tournament") return (this.recordsOf("tournament")[0] ?? this.create("tournament")).arena.id;
    const rooms = this.recordsOf(kind).map((r) => ({ arenaId: r.arena.id, inLobby: r.arena.phase.kind === "lobby", humans: humansOf(r.arena).length }));
    const choice = choosePracticeRoom(rooms, maxPlayersOf(kind), this.options.maxArenas);
    switch (choice.kind) {
      case "join":
        return choice.arenaId;
      case "open":
        return this.create(kind).arena.id;
      case "full":
        throw noPublicSeat();
    }
  }

  /** Stops the timers that are not AutoSteps, so the server can stop. */
  stop(): void {
    for (const cancel of this.emptyCloses.values()) cancel();
    this.emptyCloses.clear();
  }

  /** GET /api/public without its monthly line, which the league gives (monthly/monthly.ts). */
  status(): Omit<PublicStatusResponse, "monthly"> {
    const { autoSteps } = this.parts;
    const tournament = this.recordsOf("tournament")[0];
    if (tournament === undefined) throw new Error("The server keeps one tournament arena, but none exists.");
    const { phase } = tournament.arena;
    const step = autoSteps.stepOf(tournament.arena.id);
    const round =
      phase.kind === "running" ? phase.round : phase.kind === "break" ? phase.nextRound : phase.kind === "finished" ? tournament.arena.rounds.length : null;
    return {
      practice: { humans: this.recordsOf("practice").reduce((sum, r) => sum + humansOf(r.arena).length, 0) },
      tournament: {
        phase: phase.kind,
        humans: humansOf(tournament.arena).length,
        startsInMs: step?.action === "start" ? step.inMs : null,
        round,
        recentWinners: this.options.winners.recent(STATUS_WINNERS),
      },
    };
  }

  /** Arms or cancels the timer the phase calls for, and settles a finished game. Safe to call any number of times. */
  sync(record: ArenaRecord): void {
    const kind = kindOf(record);
    if (kind === null || this.parts.store.get(record.arena.id) !== record) return;
    const { autoSteps } = this.parts;
    const rules = this.options.rules[kind];
    const arenaId = record.arena.id;
    const pending = autoSteps.actionOf(arenaId);
    if (record.arena.phase.kind !== "lobby") this.forgetDeadlines(arenaId);
    this.syncEmptyClose(record, kind);
    switch (record.arena.phase.kind) {
      case "lobby":
        this.syncLobby(record, kind);
        return;
      case "break":
        if (pending !== "start") autoSteps.arm(arenaId, "start", rules.breakMs, () => this.startRound(record));
        return;
      case "running":
        autoSteps.cancel(arenaId);
        return;
      case "finished":
        this.settle(record, kind);
        if (pending !== "reset") autoSteps.arm(arenaId, "reset", rules.resultMs, () => this.reset(record));
        return;
    }
  }

  /** The lobby deadline table at the top of this file. */
  private syncLobby(record: ArenaRecord, kind: PublicKind): void {
    const { autoSteps } = this.parts;
    const arenaId = record.arena.id;
    const humans = humansOf(record.arena);
    if (humans.length === 0) {
      autoSteps.cancel(arenaId);
      this.forgetDeadlines(arenaId);
      return;
    }
    const rules = this.options.rules[kind];
    const now = this.options.now();
    let deadline = this.lobbyDeadlines.get(arenaId);
    if (deadline === undefined) {
      deadline = now + rules.countdownMs;
      this.lobbyDeadlines.set(arenaId, deadline);
    }
    if (!everyHumanReady(record.arena)) this.readyDeadlines.delete(arenaId);
    else if (!this.readyDeadlines.has(arenaId)) this.readyDeadlines.set(arenaId, now + rules.readyCountdownMs);
    const at = Math.min(deadline, this.readyDeadlines.get(arenaId) ?? deadline);
    if (autoSteps.actionOf(arenaId) === "start" && autoSteps.atOf(arenaId) === at) return;
    autoSteps.arm(arenaId, "start", Math.max(0, at - now), () => this.startRound(record));
  }

  /**
   * An extra practice arena whose lobby holds no human closes after one whole game
   * (gameMsOf), so the rooms that seat() opened for visitors who never came do not stay. The
   * arena is checked again when the timer fires: the last arena of its kind stays.
   */
  private syncEmptyClose(record: ArenaRecord, kind: PublicKind): void {
    const arenaId = record.arena.id;
    const empty = kind !== "tournament" && record.arena.phase.kind === "lobby" && humansOf(record.arena).length === 0;
    if (!empty) {
      this.emptyCloses.get(arenaId)?.();
      this.emptyCloses.delete(arenaId);
      return;
    }
    if (this.emptyCloses.has(arenaId)) return;
    const cancel = this.options.scheduler.after(() => {
      this.emptyCloses.delete(arenaId);
      const current = this.parts.store.get(arenaId) === record;
      const stillEmpty = record.arena.phase.kind === "lobby" && humansOf(record.arena).length === 0;
      if (!current || !stillEmpty || this.recordsOf(kind).length <= 1) return;
      try {
        this.options.close(record);
      } catch (error) {
        // The arena stays; the next change of it arms the timer again.
        console.error(`The empty public arena ${arenaId} could not be closed:`, error);
      }
    }, gameMsOf(this.options.rules[kind]));
    this.emptyCloses.set(arenaId, cancel);
  }

  private forgetDeadlines(arenaId: ArenaId): void {
    this.lobbyDeadlines.delete(arenaId);
    this.readyDeadlines.delete(arenaId);
  }

  private recordsOf(kind: PublicKind): readonly ArenaRecord[] {
    return this.parts.store.all().filter((record) => record.arena.settings.kind === kind);
  }

  private create(kind: PublicKind): ArenaRecord {
    const { store } = this.parts;
    const { settings } = this.options.rules[kind];
    const arena = createArena(store.newArenaId(), settings, announcementFor(settings.ruleSetMode, null));
    const added = store.add(arena, null);
    if (!added.ok) throw new Error("A public arena has no owner, so no ownership limit applies.");
    // Adding is not a change the store reports, so the empty room's closing timer is armed here.
    this.sync(added.record);
    return added.record;
  }

  /**
   * Records the finished game once (the stores skip a game they settled already, which
   * covers a restart in the finished phase). Never throws, so the reset is still armed.
   */
  private settle(record: ArenaRecord, kind: PublicKind): void {
    const { arena } = record;
    const { phase } = arena;
    if (phase.kind !== "finished") return;
    const game = { arenaId: arena.id, game: arena.game };
    try {
      if (kind === "tournament") {
        const winner = arena.players.find((p) => p.id === phase.winnerId);
        if (winner === undefined || winner.isBot) return;
        const tanks = arena.rounds[0]?.standings.length ?? 0;
        this.options.winners.record(game, { name: winner.name, look: winner.look, wonAt: new Date(this.options.now()).toISOString(), tanks });
      }
    } catch (error) {
      console.error(`The ${kind} game ${game.game} of arena ${arena.id} could not be recorded:`, error);
    }
  }

  /** Runs on the timer, so it reports a failure in the log and on the stream instead of throwing. */
  private startRound(record: ArenaRecord): void {
    const { store, runner, hub, autoSteps } = this.parts;
    // Forgotten first: a failed start then counts down again in full instead of retrying at once.
    this.forgetDeadlines(record.arena.id);
    try {
      // Only at the game's start: a break's next round cannot remove players (the reducer allows it in the lobby only).
      if (record.arena.phase.kind === "lobby") {
        this.removeAbsent(record, PUBLIC_START_ABSENT_MS);
        if (humansOf(record.arena).length === 0) {
          // No game of bots alone. The removal's sync left the lobby idle; send that state.
          hub.sendArena(autoSteps.view(record.arena));
          return;
        }
      }
      const started = startNextRound(store, runner, record);
      if (!started.ok) throw new Error(`The public arena rejected the start: ${started.error}.`);
    } catch (error) {
      console.error(`Public arena ${record.arena.id} could not start its round:`, error);
      hub.sendArena(autoSteps.view(record.arena));
      // A save that failed changed nothing, so the countdown starts again and retries.
      this.sync(record);
    }
  }

  private reset(record: ArenaRecord): void {
    const { store, hub, autoSteps } = this.parts;
    try {
      const reset = store.apply(record, { kind: "reset", nextRuleSetId: announcementFor(record.arena.settings.ruleSetMode, null) });
      if (!reset.ok) throw new Error(`The public arena rejected the reset: ${reset.error}.`);
      this.removeAbsent(record, PUBLIC_ABSENT_MS);
      const kind = kindOf(record);
      // The tournament has one arena for good; practice keeps at least one.
      if (kind !== "tournament" && kind !== null && humansOf(record.arena).length === 0 && this.recordsOf(kind).length > 1) {
        this.options.close(record);
        return;
      }
      hub.sendArena(autoSteps.view(record.arena));
    } catch (error) {
      console.error(`Public arena ${record.arena.id} could not reset:`, error);
      hub.sendArena(autoSteps.view(record.arena));
      this.sync(record);
    }
  }

  /** Removes the humans of the lobby whose stream has been closed for more than `awayMs` (the presence table in public-kinds.ts). */
  private removeAbsent(record: ArenaRecord, awayMs: number): void {
    const arenaId = record.arena.id;
    const absent = humansOf(record.arena).filter((p) => this.isAway(arenaId, p.id, awayMs)).map((p) => p.id);
    if (absent.length === 0) return;
    const removed = this.parts.store.apply(record, { kind: "removePlayers", playerIds: absent });
    if (!removed.ok) throw new Error(`The public arena rejected the removal of absent players: ${removed.error}.`);
    this.parts.hub.forget(arenaId, absent);
  }

  private isAway(arenaId: ArenaId, playerId: string, awayMs: number): boolean {
    const presence = this.parts.hub.presenceOf(arenaId, playerId);
    if (presence.open) return false;
    return presence.lastSeenAt === null || this.options.now() - presence.lastSeenAt > awayMs;
  }
}
