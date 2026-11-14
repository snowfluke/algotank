// One league's day round in memory: the engine round, the seated tanks and the bot
// (docs/specs/revamp/77-monthly-league.md, section 2). It knows no clock, no file and no stream;
// monthly.ts drives it between turns and saves what it reports.
//
// The league's day:
// | From         | To           | Actor            | Guard / effect                                            |
// |--------------|--------------|------------------|-----------------------------------------------------------|
// | idle         | withBot      | owner: seat      | the first tank arrives: a new open round, the tank and    |
// |              |              |                  | the bot join it                                           |
// | withBot      | withoutBot   | owner: seat      | a second tank arrives; the bot leaves before the next turn|
// | withoutBot   | withBot      | owner: quit      | one tank is left; the bot comes back                      |
// | withBot      | idle         | owner: quit      | the last tank leaves; the round is dropped (its points    |
// |              |              |                  | were saved at the quit)                                   |
// | withoutBot   | withoutBot   | owner: seat/quit | two or more tanks stay                                    |
// | withBot or   | the same     | server (turns)   | the round played RESHUFFLE_TURNS turns: a new round with  |
// | withoutBot   |              |                  | the same tanks, points and statistics on new squares      |
// | any          | closing      | server (clock)   | the day's end: monthly.ts records the day; no turn runs   |
// | closing      | idle, withBot| server           | the records are saved: a new day round with every seated  |
// |              | or withoutBot|                  | tank at 0 points (closing stays while a save fails)       |
// Seat of an account: none -> seated (take a seat) -> none (quit). Nothing else removes a seat.
// Statistics (K2): each seat keeps today's totals (engine stats.ts), added after every turn and
// carried by rebuild; the bot has none. They start at zero at a seat and go at an unseat.
// Terminal state: none; a league closes only at a month close that leaves it empty.
//
// Bot rule (one bot at most, never in a ranking):
// | Seated tanks | What runs                              |
// |--------------|----------------------------------------|
// | 0            | no turn; the page shows the empty board|
// | 1            | the tank and one bot                   |
// | 2 or more    | the tanks, no bot                      |

import { plainTankLook, type LeagueDayPhase, type LeagueTank, type PlayerId, type TankColour, type TankLook } from "@game/arena";
import { addTurn, arenaSize, createOpenRound, EMPTY_STATS, joinRound, leaveRound, PRESETS, ruleSet, STANDARD_RULE_SET_ID, stepRound, turnsOf, type RoundState, type Snapshot, type Strategy, type TankStats, type TickResult } from "@game/engine";
import { newBotId, newSeed } from "../secrets.ts";
import { MONTHLY_SEATS } from "@game/arena";

/** What the round needs of a seated tank. */
export interface DayTank {
  readonly id: PlayerId;
  readonly name: string;
  readonly look: TankLook;
  readonly strategy: Strategy;
}

interface Seated {
  tank: DayTank;
  /** True when the tank was seated at the day's first turn. */
  readonly counts: boolean;
  /** What its rules did today (K2): fixed in size, gone with the seat at a quit and zero at a new day. */
  stats: TankStats;
}

const BOT_PRESET = "picker";
const botStrategy: Strategy = (() => {
  const preset = PRESETS.find((p) => p.id === BOT_PRESET);
  // Checked at load, so a renamed preset stops the start instead of a day.
  if (preset === undefined) throw new Error(`The league's bot uses the preset "${BOT_PRESET}", which the engine does not have.`);
  return preset.strategy;
})();
const BOT_NAME = "Splashy";

/**
 * Turns a day round plays before its tanks start again on new random squares with full water,
 * keeping their points: 333 turns are 5 minutes at 900 ms a turn, the owner's choice. A day is
 * one round of about 96,000 turns, and two or three tanks could settle into a loop that ran for
 * the rest of it: in one measured field the same tank hit the same target 15,833 times in a row.
 * Measured on 14 November 2026 over 3 seeds with a new start every 1,000 turns: that run was at
 * most 70, and fields without a loop kept their result. 333 turns cut a loop shorter still.
 */
export const RESHUFFLE_TURNS = 333;

/** The empty board of a league: sized for MONTHLY_SEATS tanks, like every day round. */
function emptyBoard(ticksTotal: number): Snapshot {
  const { width, height } = arenaSize(MONTHLY_SEATS, ruleSet(STANDARD_RULE_SET_ID));
  return { width, height, tick: 0, ticksTotal, survivorsAfterRound: null, ruleSetId: STANDARD_RULE_SET_ID, bots: [] };
}

export class LeagueDay {
  private round: RoundState | null = null;
  private readonly seated = new Map<PlayerId, Seated>();
  private bot: { readonly id: PlayerId; readonly look: TankLook } | null = null;

  constructor(readonly league: number) {}

  /**
   * Seats a tank between turns. `ticksLeft` sizes a round that starts now. `points` is 0, or
   * today's points of a tank that resumes after a restart; `counts` whether today counts for it.
   */
  seat(tank: DayTank, points: number, counts: boolean, ticksLeft: number, stats: TankStats = EMPTY_STATS): void {
    if (this.seated.has(tank.id)) throw new Error(`Seat ${tank.id} is already in league ${this.league}.`);
    this.round ??= createOpenRound({ seed: newSeed(), ticksTotal: ticksLeft, ruleSetId: STANDARD_RULE_SET_ID, boardFor: MONTHLY_SEATS });
    joinRound(this.round, { id: tank.id, strategy: tank.strategy }, points);
    this.seated.set(tank.id, { tank, counts, stats });
    this.syncBot();
  }

  /** Takes a tank off the board between turns. Returns its points and whether today counted for it. */
  unseat(id: PlayerId): { readonly points: number; readonly counts: boolean } {
    const seated = this.seated.get(id);
    if (seated === undefined || this.round === null) throw new Error(`Seat ${id} is not in league ${this.league}.`);
    const points = this.pointsOf(id);
    leaveRound(this.round, id);
    this.seated.delete(id);
    this.syncBot();
    return { points, counts: seated.counts };
  }

  rename(id: PlayerId, name: string): void {
    const seated = this.seated.get(id);
    if (seated === undefined) throw new Error(`Seat ${id} is not in league ${this.league}.`);
    seated.tank = { ...seated.tank, name };
  }

  pointsOf(id: PlayerId): number {
    const bot = this.round?.snapshot.bots.find((b) => b.id === id);
    if (bot === undefined) throw new Error(`Seat ${id} is not on the board of league ${this.league}.`);
    return bot.score;
  }

  countsToday(id: PlayerId): boolean {
    const seated = this.seated.get(id);
    if (seated === undefined) throw new Error(`Seat ${id} is not in league ${this.league}.`);
    return seated.counts;
  }

  /** Every seated tank with its points now and whether today counts, in board order. */
  standings(): readonly { readonly id: PlayerId; readonly points: number; readonly counts: boolean }[] {
    return [...this.seated.values()].map(({ tank, counts }) => ({ id: tank.id, points: this.pointsOf(tank.id), counts }));
  }

  /** What the seat's rules did today. */
  statsOf(id: PlayerId): TankStats {
    const seated = this.seated.get(id);
    if (seated === undefined) throw new Error(`Seat ${id} is not in league ${this.league}.`);
    return seated.stats;
  }

  phase(): Exclude<LeagueDayPhase, "closing"> {
    return this.seated.size === 0 ? "idle" : this.seated.size === 1 ? "withBot" : "withoutBot";
  }

  /** One turn, or null when no turn runs: no tank, or the planned turns of the day are played and the clock has not closed it yet. */
  step(): TickResult | null {
    if (this.round === null || this.seated.size === 0 || this.round.isOver) return null;
    const before = this.round.snapshot;
    const result = stepRound(this.round);
    this.count(before, result);
    return result;
  }

  /**
   * Adds the turn to each seat's statistics. They only read the turn, so a failure here is
   * logged and the turn still counts: a throw would make monthly.ts start the day round again.
   */
  private count(before: Snapshot, result: TickResult): void {
    try {
      const turns = turnsOf(before, result);
      for (const seated of this.seated.values()) {
        const turn = turns.get(seated.tank.id);
        if (turn === undefined) throw new Error(`Turn ${result.tick} has no tank ${seated.tank.id}.`);
        seated.stats = addTurn(seated.stats, turn);
      }
    } catch (error) {
      console.error(`The statistics of league ${this.league} missed turn ${result.tick}:`, error);
    }
  }

  /** True when the round has played RESHUFFLE_TURNS turns, so monthly.ts starts it again with rebuild. */
  reshuffleDue(): boolean {
    return this.round !== null && this.round.snapshot.tick >= RESHUFFLE_TURNS;
  }

  /**
   * A new round with the same tanks, points and statistics: every RESHUFFLE_TURNS turns, and for a
   * round the engine could not step. Positions, water and running step sequences are lost, as
   * after a restart, and the bot comes back as a new tank with 0 points.
   */
  rebuild(ticksLeft: number): void {
    const tanks = [...this.seated.values()].map(({ tank, counts, stats }) => ({ tank, counts, stats, points: this.pointsOf(tank.id) }));
    this.round = null;
    this.seated.clear();
    this.bot = null;
    for (const { tank, counts, stats, points } of tanks) this.seat(tank, points, counts, ticksLeft, stats);
  }

  /** The tanks in board order and the board now. */
  view(ticksLeft: number): { readonly tanks: readonly LeagueTank[]; readonly board: Snapshot } {
    if (this.round === null) return { tanks: [], board: emptyBoard(ticksLeft) };
    const board = this.round.snapshot;
    const tanks = board.bots.map((b): LeagueTank => {
      if (this.bot !== null && b.id === this.bot.id) return { id: b.id, name: BOT_NAME, look: this.bot.look, isBot: true };
      const seated = this.seated.get(b.id);
      if (seated === undefined) throw new Error(`Tank ${b.id} of league ${this.league} has no seat.`);
      return { id: b.id, name: seated.tank.name, look: seated.tank.look, isBot: false };
    });
    return { tanks, board };
  }

  /** What it holds, for the test that nothing grows per turn. */
  holdings(): { readonly seated: number; readonly onBoard: number } {
    return { seated: this.seated.size, onBoard: this.round?.snapshot.bots.length ?? 0 };
  }

  /** The bot rule of the header. */
  private syncBot(): void {
    if (this.round === null) return;
    if (this.seated.size === 0) {
      this.round = null;
      this.bot = null;
      return;
    }
    if (this.seated.size === 1 && this.bot === null) {
      const [only] = this.seated.values();
      const colour = (((only?.tank.look.colour ?? 1) % 12) + 1) as TankColour;
      this.bot = { id: newBotId(), look: plainTankLook(colour) };
      joinRound(this.round, { id: this.bot.id, strategy: botStrategy });
    } else if (this.seated.size > 1 && this.bot !== null) {
      leaveRound(this.round, this.bot.id);
      this.bot = null;
    }
  }
}
