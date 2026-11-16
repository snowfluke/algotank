// One league's day round in memory: the engine round, the seated tanks and the bot
// (docs/specs/revamp/77-monthly-league.md, section 2). It knows no clock, no file and no stream;
// monthly.ts drives it between turns and saves what it reports.
//
// The league's day:
// | From         | To           | Actor            | Guard / effect                                            |
// |--------------|--------------|------------------|-----------------------------------------------------------|
// | idle         | withBot      | owner: seat      | the first tank arrives: a new open round, the tank joins  |
// |              |              |                  | it and the bots are drawn (at least one, see below)       |
// | withBot or   | the same     | owner: seat      | another tank arrives; the bots stay until the next new    |
// | withoutBot   |              |                  | start                                                     |
// | withBot or   | withBot or   | owner: quit      | the tank leaves; when one tank is left without a bot, one |
// | withoutBot   | withoutBot   |                  | bot joins at once                                         |
// | withBot or   | idle         | owner: quit      | the last tank leaves; the round and its bots are dropped  |
// | withoutBot   |              |                  | (its points were saved at the quit)                       |
// | withBot or   | withBot or   | server (turns)   | the round played RESHUFFLE_TURNS turns: a new round with  |
// | withoutBot   | withoutBot   |                  | the same tanks, points and statistics on new squares, and |
// |              |              |                  | the bots are drawn again                                  |
// | any          | closing      | server (clock)   | the day's end: monthly.ts records the day; no turn runs   |
// | closing      | idle, withBot| server           | the records are saved: a new day round with every seated  |
// |              | or withoutBot|                  | tank at 0 points (closing stays while a save fails)       |
// Seat of an account: none -> seated (take a seat) -> none (quit). Nothing else removes a seat.
// Statistics (K2): each seat keeps today's totals (engine stats.ts), added after every turn and
// carried by rebuild; the bot has none. They start at zero at a seat and go at an unseat.
// | withBot or   | withBot or   | owner: seat      | the seated tanks pass BOARD_GROWTH times the tanks the    |
// | withoutBot   | withoutBot   |                  | board is sized for: a rebuild at once, on a board for all |
// |              |              |                  | of them (a rush of joiners never fills the board)         |
// Terminal state: none; a league closes only at a month close that leaves it empty.
//
// Ties: a target selector settles a tie by the tanks' tie ranks in an open round (BotState.tieRank,
// drawn at each join), and some rules by the board's tank order. Both change at every new round:
// the engine draws new ranks, and start() seats the tanks in a random order. A seat's fixed id was
// worth thousands of points a day before (2026-11-16).
//
// Board size: every new round (a new day, a restart, a new start, a rebuild) gets a board for the
// tanks seated then (boardTanksFor), so a few tanks still meet and a full league has room. A board
// for N tanks has about 6.7 N squares (round/grid.ts), so the seats can pass N by half before the
// rebuild with up to MAX_BOTS bots and never run out of squares.
//
// Bot rule (owner, 2026-11-14: bots come and go every few minutes; a bot never appears in a ranking):
// | Seated tanks | Bots drawn at each new round (a new start, a new day, a rebuild)        |
// |--------------|--------------------------------------------------------------------------|
// | 0            | none; no turn runs and the page shows the empty board                    |
// | 1            | 1 to 3: a draw of 0 is raised to 1, so the tank always has an opponent   |
// | 2 or more    | 0 to 3                                                                   |
// Each bot takes a play style from BOT_LINEUP (apps/server/src/bots.ts), the practice arena's mix
// of weak, middle and strong bots. A player keeps the points won from or lost to a bot; the bot's
// own points go with it at the next new start.

import { plainTankLook, type LeagueDayPhase, type LeagueTank, type PlayerId, type TankColour, type TankLook } from "@game/arena";
import { BOT_LINEUP, BOT_NAMES } from "../bots.ts";
import { addTurn, arenaSize, createOpenRound, EMPTY_STATS, joinRound, leaveRound, PRESETS, replaceStrategy, RULE_SET_IDS, ruleSet, STANDARD_RULE_SET_ID, stepRound, type RuleSetId, turnsOf, type RoundState, type Snapshot, type Strategy, type TankStats, type TickResult } from "@game/engine";
import { newBotId, newSeed } from "../secrets.ts";
import { MONTHLY_BOARD_MIN_TANKS } from "@game/arena";

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

/** The most bots a league draws at a new round. */
const MAX_BOTS = 3;
const botStrategies: readonly Strategy[] = BOT_LINEUP.map((slot) => {
  const preset = PRESETS.find((p) => p.id === slot.presetId);
  // Checked at load, so a renamed preset stops the start instead of a day.
  if (preset === undefined) throw new Error(`The bot lineup names the preset "${slot.presetId}", which the engine does not have.`);
  return preset.strategy;
});

/** A number from 0 (inclusive) to 1 (exclusive): Math.random in the server, a fixed value in tests. */
export type Random = () => number;

interface LeagueBot {
  readonly id: PlayerId;
  readonly name: string;
  readonly look: TankLook;
}

/**
 * Turns a day round plays before its tanks start again on new random squares with full water,
 * keeping their points: 333 turns are 5 minutes at 900 ms a turn, the owner's choice. A day is
 * one round of about 96,000 turns, and two or three tanks could settle into a loop that ran for
 * the rest of it: in one measured field the same tank hit the same target 15,833 times in a row.
 * Measured on 14 November 2026 over 3 seeds with a new start every 1,000 turns: that run was at
 * most 70, and fields without a loop kept their result. 333 turns cut a loop shorter still.
 */
export const RESHUFFLE_TURNS = 333;

/** A seat that makes the seated tanks more than this many times the board's tanks rebuilds the round at once. */
export const BOARD_GROWTH = 1.5;

/** The tanks a new round's board is sized for: the seated tanks, and at least MONTHLY_BOARD_MIN_TANKS. */
/**
 * The arena conditions a monthly round draws from (owner, 2026-11-16): the ones under which the
 * presets play about equal, every preset within 40 points a day of the field mean, measured with
 * 4 tanks of each of the 7 designed presets on one board, the same 24 seeded days for every
 * condition (paired runs, standard error 3 to 6) and then 16 other days. Points a day against the
 * field mean, worst preset each way, 24 days (hold-out of 16 days):
 * - standard: item-hunter +28, dry-hunter -24 (+19, -17).
 * - sharp-eyes: item-hunter +24, dry-hunter -23 (+23, -24).
 * - dry-spell: item-hunter +25, picker and dry-hunter -18 (+24, -19). No tank grabs items there.
 * - arms-length: picker -29, item-hunter +28 (dry-hunter -38, item-hunter +34).
 * - open-field: item-hunter +26, dry-hunter -20 (+30, -31). A square is about 14 px wide on a phone.
 * Left out: downpour (evader +129, dry-hunter -113, picker -109, ambusher +47, item-hunter +46, 24
 * days). Giving the Picker and the Dry hunter a chase of the nearest tank when none holds less water,
 * a throw while they refill, and no grab rule for the Evader there did not bring it in (12 days).
 * Before the grab rules of presets.ts the same days gave item-hunter +56 and evader -40 in standard,
 * and item-hunter +126 and evader -63 in open-field.
 */
export const MONTHLY_CONDITIONS: readonly RuleSetId[] = ["standard", "sharp-eyes", "dry-spell", "arms-length", "open-field"];

export function boardTanksFor(seated: number): number {
  return Math.max(MONTHLY_BOARD_MIN_TANKS, seated);
}

/** The empty board of a league: the board of a round with no tank. */
function emptyBoard(ticksTotal: number): Snapshot {
  const { width, height } = arenaSize(boardTanksFor(0), ruleSet(STANDARD_RULE_SET_ID));
  return { width, height, tick: 0, ticksTotal, survivorsAfterRound: null, ruleSetId: STANDARD_RULE_SET_ID, bots: [], items: [] };
}

export class LeagueDay {
  private round: RoundState | null = null;
  private readonly seated = new Map<PlayerId, Seated>();
  private bots: LeagueBot[] = [];
  /** The tanks the round's board is sized for. */
  private boardFor = boardTanksFor(0);

  constructor(
    readonly league: number,
    private readonly random: Random = Math.random,
  ) {}

  /**
   * Seats a tank between turns. `ticksLeft` sizes a round that starts now. `points` is 0, or
   * today's points of a tank that resumes after a restart; `counts` whether today counts for it.
   */
  seat(tank: DayTank, points: number, counts: boolean, ticksLeft: number, stats: TankStats = EMPTY_STATS): void {
    if (this.seated.has(tank.id)) throw new Error(`Seat ${tank.id} is already in league ${this.league}.`);
    const fresh = this.round === null;
    if (this.round === null) this.round = this.newRound(1, ticksLeft);
    joinRound(this.round, { id: tank.id, strategy: tank.strategy }, points);
    this.seated.set(tank.id, { tank, counts, stats });
    if (fresh) this.drawBots();
    // A rush of joiners: the next new start may be minutes away, so the board grows now.
    else if (this.seated.size > this.boardFor * BOARD_GROWTH) this.rebuild(ticksLeft);
  }

  /**
   * A round on a board for `tanks` tanks (boardTanksFor), under an arena condition (round rules)
   * drawn for it, each one as likely: owner, 2026-11-16, "randomize the arena condition each
   * reshuffle". The draw comes first, before the seating order and the bots. "open-field" makes
   * the board about twice as large (engine arenaSize).
   */
  private newRound(tanks: number, ticksLeft: number): RoundState {
    this.boardFor = boardTanksFor(tanks);
    const ruleSetId = MONTHLY_CONDITIONS[Math.floor(this.random() * MONTHLY_CONDITIONS.length)] ?? STANDARD_RULE_SET_ID;
    return createOpenRound({ seed: newSeed(), ticksTotal: ticksLeft, ruleSetId, boardFor: this.boardFor, items: true });
  }

  /** Takes a tank off the board between turns. Returns its points and whether today counted for it. */
  /**
   * A seated tank's new rules ("Ubah aturan", owner 2026-11-16: the new rules play at once). It
   * keeps its id, today's points, whether today counts, its statistics, and its place on the board
   * with its water, item and effect (engine replaceStrategy), so a change is no escape or refill.
   */
  restrategy(id: PlayerId, strategy: Strategy): void {
    const seated = this.seated.get(id);
    if (seated === undefined || this.round === null) throw new Error(`Seat ${id} is not in league ${this.league}.`);
    replaceStrategy(this.round, id, strategy);
    this.seated.set(id, { ...seated, tank: { ...seated.tank, strategy } });
  }

  unseat(id: PlayerId): { readonly points: number; readonly counts: boolean } {
    const seated = this.seated.get(id);
    if (seated === undefined || this.round === null) throw new Error(`Seat ${id} is not in league ${this.league}.`);
    const points = this.pointsOf(id);
    leaveRound(this.round, id);
    this.seated.delete(id);
    if (this.seated.size === 0) {
      this.round = null;
      this.bots = [];
    } else if (this.seated.size === 1 && this.bots.length === 0) {
      this.addBot();
    }
    return { points, counts: seated.counts };
  }

  rename(id: PlayerId, name: string): void {
    const seated = this.seated.get(id);
    if (seated === undefined) throw new Error(`Seat ${id} is not in league ${this.league}.`);
    seated.tank = { ...seated.tank, name };
  }

  /** A seated tank's new look between turns (monthly.ts followLook); the round goes on. */
  restyle(id: PlayerId, look: TankLook): void {
    const seated = this.seated.get(id);
    if (seated === undefined) throw new Error(`Seat ${id} is not in league ${this.league}.`);
    seated.tank = { ...seated.tank, look };
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
    return this.seated.size === 0 ? "idle" : this.bots.length > 0 ? "withBot" : "withoutBot";
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
   * after a restart, and the bots are drawn again as new tanks with 0 points.
   */
  rebuild(ticksLeft: number): void {
    const tanks = [...this.seated.values()].map(({ tank, counts, stats }) => ({ tank, counts, stats, points: this.pointsOf(tank.id) }));
    this.round = null;
    this.seated.clear();
    this.bots = [];
    this.start(tanks, ticksLeft);
  }

  /**
   * A new round with all these tanks at once, then one draw of the bots: a new day, a restart and
   * a rebuild. Seating them one by one would make the first draw see one tank and always add a bot.
   */
  start(tanks: readonly { readonly tank: DayTank; readonly points: number; readonly counts: boolean; readonly stats: TankStats | undefined }[], ticksLeft: number): void {
    if (this.round !== null) throw new Error(`League ${this.league} already has a round.`);
    if (tanks.length === 0) return;
    const round = this.newRound(tanks.length, ticksLeft);
    this.round = round;
    // A random seating order, so the board's tank order (which settles some ties) changes with every
    // new round, like the tie ranks the engine draws at each join (BotState.tieRank).
    for (const { tank, points, counts, stats } of this.shuffled(tanks)) {
      if (this.seated.has(tank.id)) throw new Error(`Seat ${tank.id} is already in league ${this.league}.`);
      joinRound(round, { id: tank.id, strategy: tank.strategy }, points);
      this.seated.set(tank.id, { tank, counts, stats: stats ?? EMPTY_STATS });
    }
    this.drawBots();
  }

  /** The tanks in board order and the board now. */
  view(ticksLeft: number): { readonly tanks: readonly LeagueTank[]; readonly board: Snapshot } {
    if (this.round === null) return { tanks: [], board: emptyBoard(ticksLeft) };
    const board = this.round.snapshot;
    const tanks = board.bots.map((b): LeagueTank => {
      const bot = this.bots.find((candidate) => candidate.id === b.id);
      if (bot !== undefined) return { id: b.id, name: bot.name, look: bot.look, isBot: true };
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

  /** A copy in random order (Fisher-Yates with this league's random source). */
  private shuffled<T>(items: readonly T[]): T[] {
    const copy = [...items];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(this.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j] as T, copy[i] as T];
    }
    return copy;
  }

  /** The bot rule of the header, at a new round: the round holds the seated tanks and no bot yet. */
  private drawBots(): void {
    const drawn = Math.min(MAX_BOTS, Math.floor(this.random() * (MAX_BOTS + 1)));
    const count = this.seated.size === 1 ? Math.max(1, drawn) : drawn;
    for (let i = 0; i < count; i++) this.addBot();
  }

  /** One bot with a play style from the practice mix, a bot name and a colour no seated tank has, if one is free. */
  private addBot(): void {
    if (this.round === null) throw new Error(`League ${this.league} has no round for a bot.`);
    const strategy = botStrategies[Math.floor(this.random() * botStrategies.length)];
    if (strategy === undefined) throw new Error("The bot lineup is empty.");
    const taken = new Set<number>([...this.seated.values()].map(({ tank }) => tank.look.colour));
    for (const bot of this.bots) taken.add(bot.look.colour);
    const colour = ([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as const).find((c) => !taken.has(c)) ?? (((this.bots.length % 12) + 1) as TankColour);
    const name = BOT_NAMES[this.bots.length] ?? `Bot ${this.bots.length + 1}`;
    const bot: LeagueBot = { id: newBotId(), name, look: plainTankLook(colour) };
    joinRound(this.round, { id: bot.id, strategy });
    this.bots.push(bot);
  }
}
