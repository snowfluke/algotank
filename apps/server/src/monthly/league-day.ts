// One league's day round in memory: the engine round, the seated tanks and the bot
// (docs/specs/revamp/77-monthly-league.md, section 2). It reads the clock when it creates a round;
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
// | withBot or   | withBot or   | server (turns)   | after the moves, the next tanks in the rotation go through |
// | withoutBot   | withoutBot   |                  | a tunnel and keep points, stats and ultimate state; a bot  |
// |              |              |                  | is redrawn or leaves. The round keeps counting.            |
// | withBot or   | the same     | server (turns)   | every RESHUFFLE_TURNS turns, draw the weather. If it       |
// | withoutBot   |              |                  | changes, apply it between turns and keep the turn number. |
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
// worth thousands of points a day before (2026-11-16). A fresh start draws one tank's rank
// and puts it last in board order (owner, 2026-11-19).
//
// Board size: every new round (a new day, a restart, a rebuild) gets a board for the
// tanks seated then (boardTanksFor), so a few tanks still meet and a full league has room. A board
// for N tanks has about 6.7 N squares (round/grid.ts), so the seats can pass N by half before the
// rebuild with up to MAX_BOTS bots and never run out of squares, even when open-field ends.
//
// Bot rule (owner, 2026-11-14: bots come and go every few minutes; a bot never appears in a ranking):
// | Seated tanks | Bots drawn at each new round (a new day, a restart, a rebuild)           |
// |--------------|--------------------------------------------------------------------------|
// | 0            | none; no turn runs and the page shows the empty board                    |
// | 1            | 1 to 3: a draw of 0 is raised to 1, so the tank always has an opponent   |
// | 2 or more    | 0 to 3                                                                   |
// Each bot takes a play style from BOT_LINEUP (apps/server/src/bots.ts), the practice arena's mix
// of weak, middle and strong bots. A player keeps the points won from or lost to a bot; the bot's
// own points go with it at its fresh start (owner, 2026-11-19). A positive draw replaces
// just that bot and a zero removes it. The same draw keeps at least one bot for a lone seat.

import { plainTankLook, type FreshStart, type LeagueDayPhase, type LeagueTank, type PlayerId, type TankColour, type TankLook } from "@game/arena";
import { BOT_LINEUP, BOT_NAMES } from "../bots.ts";
import { addTurn, ARENA_LAYOUT_IDS, arenaConditionOf, arenaSize, boardRuleSetId, changeRoundRules, createOpenRound, EMPTY_STATS, freshStartRound, handicapOf, joinRound, leaveRound, PRESETS, replaceStrategy, RULE_SET_IDS, setPlayerHandicap, ruleSet, STANDARD_RULE_SET_ID, stepRound, type ArenaConditionId, turnsOf, type RoundPlayer, type RoundState, type Handicap, type Rng, type Snapshot, type Strategy, type TankStats, type TickResult } from "@game/engine";
import { newBotId, secureRandom, secureRng } from "../secrets.ts";
import { MONTHLY_BOARD_MIN_TANKS, RESHUFFLE_TURNS, ultimatesOn } from "@game/arena";
import type { Clock } from "../timers.ts";

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
  /** Its changes of rules today, each taking RULE_CHANGE_RELIEF of its handicap off; zero at a seat and a new day. */
  ruleChanges: number;
  /** The handicap of its rules after today's relief, played only while it holds a place of HANDICAP_PLACES. */
  handicap: Handicap | undefined;
}

/**
 * A tank with a built-in style plays with its handicap only while it holds one of the first HANDICAP_PLACES places of
 * today's standings (owner, 2026-11-22: "the handicap activated once they enter top 10, so it is situational"). Lower,
 * it plays as it is, so a beginner who starts from a built-in style is not held back at the bottom. The places are
 * counted as the page's list counts them, by points with game masters left out (LeagueDay's `unranked`), from the
 * points before each turn, so the rule needs nothing saved: a restart or a new round counts again at its first turn.
 * Ties keep the board's order, where the page breaks them by seat order. A bot is not in the standings, so it always
 * plays with its style's handicap, as before. Measured on the live league, 42 days (2026-11-22): built-in tanks then hold
 * 4.0 of the top 10 places at the day's end (0.0 with the handicap at every place) and win no day; the owner chose it.
 */
export const HANDICAP_PLACES = 10;

/**
 * The share of a tank's handicap each change of rules during a day takes off, to another built-in style too (owner,
 * 2026-11-21: "slightly lower the handicap by 4.167% per change, we at least reward the effort"). After 24 changes in
 * a day, eight hours at the hourly limit, the handicap is gone until the next day.
 */
export const RULE_CHANGE_RELIEF = 1 / 24;

/** A handicap after `changes` changes of rules today. */
export function relieved(handicap: Handicap, changes: number): Handicap | undefined {
  const left = Math.max(0, 1 - changes * RULE_CHANGE_RELIEF);
  return left === 0 ? undefined : { miss: handicap.miss * left, exposure: handicap.exposure * left };
}

/** The most bots a league draws at a new round. */
const MAX_BOTS = 3;
const botStrategies: readonly Strategy[] = BOT_LINEUP.map((slot) => {
  const preset = PRESETS.find((p) => p.id === slot.presetId);
  // Checked at load, so a renamed preset stops the start instead of a day.
  if (preset === undefined) throw new Error(`The bot lineup names the preset "${slot.presetId}", which the engine does not have.`);
  return preset.strategy;
});

/** A number from 0 (inclusive) to 1 (exclusive): secureRandom in the server, a fixed value in tests. */
export type Random = () => number;

interface LeagueBot {
  readonly id: PlayerId;
  readonly name: string;
  readonly look: TankLook;
}


/** The usual turn result up to the end of the moves, with the tunnels that follow. */
export interface LeagueTurn extends TickResult {
  readonly freshStarts: readonly FreshStart[];
  /** Bot quits and joins still use a state message after the tick. */
  readonly botsChanged: boolean;
  /** A new condition needs a state at the same turn, including any bot quits and joins. */
  readonly weatherChanged: boolean;
}

/** A seat that makes the seated tanks more than this many times the board's tanks rebuilds the round at once. */
export const BOARD_GROWTH = 1.5;

/**
 * The single conditions originally chosen on 2026-11-16 kept every preset within 40
 * points a day of the field mean, measured with
 * 4 tanks of each of the 7 designed presets on one board, the same 24 seeded days for every
 * condition (paired runs, standard error 3 to 6) and then 16 other days. Points a day against the
 * field mean, worst preset each way, 24 days (hold-out of 16 days):
 * - standard: item-hunter +28, dry-hunter -24 (+19, -17).
 * - sharp-eyes: item-hunter +24, dry-hunter -23 (+23, -24).
 * - dry-spell: item-hunter +25, picker and dry-hunter -18 (+24, -19). No tank grabs items there.
 * - arms-length: picker -29, item-hunter +28 (dry-hunter -38, item-hunter +34).
 * - open-field: item-hunter +26, dry-hunter -20 (+30, -31). A square is about 14 px wide on a phone.
 * Left out at the time: downpour (evader +129, dry-hunter -113, picker -109, ambusher +47, item-hunter +46, 24
 * days). Giving the Picker and the Dry hunter a chase of the nearest tank when none holds less water,
 * a throw while they refill, and no grab rule for the Evader there did not bring it in (12 days).
 * Before the grab rules of presets.ts the same days gave item-hunter +56 and evader -40 in standard,
 * and item-hunter +126 and evader -63 in open-field.
 */
// Owner, 2026-11-19 (87-hybrid-arenas.md): all six single conditions share the normal draw.
export const MONTHLY_CONDITIONS = RULE_SET_IDS;

/** The tanks a new round's board is sized for: the seated tanks, and at least MONTHLY_BOARD_MIN_TANKS. */
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
  private freshStartCredit = 0;
  private normalStreak = 0;
  private pendingWeather: ArenaConditionId | undefined;
  /** The tanks the round's board is sized for. */
  private boardFor = boardTanksFor(0);

  constructor(
    readonly league: number,
    private readonly random: Random = secureRandom,
    private readonly now: Clock,
    // The balance script pairs seeded rounds and holds one condition for each run; the game draws from the system.
    private readonly field: {
      readonly rng: () => Rng;
      readonly conditions?: readonly ArenaConditionId[];
      /** The balance scripts try other handicaps; the league uses the engine's (handicapOf, "league"). */
      readonly handicap?: (strategy: Strategy) => Handicap | undefined;
      /** The seats that take no place in today's standings, the game masters' (HANDICAP_PLACES); asked once a turn. */
      readonly unranked?: () => ReadonlySet<PlayerId>;
      /** The scripts measure other cut-offs; the league uses HANDICAP_PLACES. */
      readonly handicapPlaces?: number;
    } = { rng: secureRng },
  ) {}

  /** The handicap set on the board for each seat now, so a turn changes only the seats that crossed the line. */
  private readonly handicapsSet = new Map<PlayerId, Handicap | undefined>();

  /**
   * Seats a tank between turns. `ticksLeft` sizes a round that starts now. `points` is 0, or
   * today's points of a tank that resumes after a restart; `counts` whether today counts for it.
   * Returns true when the board had to grow.
   */
  seat(tank: DayTank, points: number, counts: boolean, ticksLeft: number, stats: TankStats = EMPTY_STATS, ruleChanges = 0): boolean {
    if (this.seated.has(tank.id)) throw new Error(`Seat ${tank.id} is already in league ${this.league}.`);
    const fresh = this.round === null;
    if (this.round === null) this.round = this.newRound(1, ticksLeft);
    joinRound(this.round, { id: tank.id, strategy: tank.strategy }, points);
    this.seated.set(tank.id, { tank, counts, stats, ruleChanges, handicap: this.handicapFor(tank.strategy, ruleChanges) });
    if (fresh) this.drawBots();
    else if (this.seated.size > this.boardFor * BOARD_GROWTH) {
      this.rebuild(ticksLeft);
      return true;
    }
    return false;
  }

  /**
   * A round on a board for `tanks` tanks (boardTanksFor), under an arena condition (round rules)
   * drawn for it. A new round draws before the seating order and the bots, as before the
   * between-turn weather changes (77-monthly-league.md, owner 2026-11-19).
   */
  private newRound(tanks: number, ticksLeft: number): RoundState {
    this.boardFor = boardTanksFor(tanks);
    this.freshStartCredit = 0;
    this.pendingWeather = undefined;
    const ruleSetId = this.drawCondition();
    // Hold the release choice for this round, even if a seat joins after the gate opens (85-ultimates.md).
    return createOpenRound({ rng: this.field.rng(), ticksTotal: ticksLeft, ruleSetId, boardFor: this.boardFor, items: true, ultimates: ultimatesOn(this.now()) });
  }

  private drawCondition(): ArenaConditionId {
    // The balance script fixes a condition for its paired runs.
    const fixed = this.field.conditions;
    if (fixed !== undefined) return fixed[Math.floor(this.random() * fixed.length)] ?? STANDARD_RULE_SET_ID;

    // Hybrid layouts arrive with the ultimates on 20 November (owner, 2026-11-19: "hold it for 22 nov"), so a
    // release of main before then draws only single conditions.
    if (!ultimatesOn(this.now())) return MONTHLY_CONDITIONS[Math.floor(this.random() * MONTHLY_CONDITIONS.length)] ?? STANDARD_RULE_SET_ID;
    // The odds rise after each pair of normal draws, including repeats (87-hybrid-arenas.md, owner 2026-11-19).
    const hybridChance = Math.min(100, 20 + 20 * Math.floor(this.normalStreak / 2));
    const hybrid = this.random() * 100 < hybridChance;
    this.normalStreak = hybrid ? 0 : this.normalStreak + 1;
    const conditions = hybrid ? ARENA_LAYOUT_IDS : MONTHLY_CONDITIONS;
    return conditions[Math.floor(this.random() * conditions.length)] ?? STANDARD_RULE_SET_ID;
  }

  /** Consecutive normal draws, saved so a restart draws at the same odds. */
  normalWeatherStreak(): number {
    return this.normalStreak;
  }

  /** Takes a tank off the board between turns. Returns its points and whether today counted for it. */
  /**
   * A seated tank's new rules ("Ubah aturan", owner 2026-11-16: the new rules play at once). It
   * keeps its id, today's points, whether today counts, its statistics, and its place on the board
   * with its water, item and tank effect. The engine restarts the charge if the ultimate changes.
   */
  restrategy(id: PlayerId, strategy: Strategy): void {
    const seated = this.seated.get(id);
    if (seated === undefined || this.round === null) throw new Error(`Seat ${id} is not in league ${this.league}.`);
    const ruleChanges = seated.ruleChanges + 1;
    // The new rules start without a handicap; the next turn sets theirs if the tank holds a place of HANDICAP_PLACES.
    replaceStrategy(this.round, id, strategy, undefined);
    this.handicapsSet.delete(id);
    this.seated.set(id, { ...seated, tank: { ...seated.tank, strategy }, ruleChanges, handicap: this.handicapFor(strategy, ruleChanges) });
  }

  unseat(id: PlayerId): { readonly points: number; readonly counts: boolean } {
    const seated = this.seated.get(id);
    if (seated === undefined || this.round === null) throw new Error(`Seat ${id} is not in league ${this.league}.`);
    const points = this.pointsOf(id);
    leaveRound(this.round, id);
    this.seated.delete(id);
    this.handicapsSet.delete(id);
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

  /** Every seated tank with its points now and whether today counts. */
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
  step(): LeagueTurn | null {
    const round = this.round;
    if (round === null || this.seated.size === 0 || round.isOver) return null;
    this.placeHandicaps(round);
    const before = round.snapshot;
    const result = stepRound(round);
    this.count(before, result);
    // Board order is the queue: a fresh start or join goes to its end. Carry unused credit
    // (77-monthly-league.md, 2026-11-19) so gaps alternate between floor and ceil of 333 / N
    // for small boards. Above 333, at most ceil(N / 333) go per turn. Even when N does not
    // divide 333, exactly N starts are scheduled in 333 turns at a stable tank count.
    this.freshStartCredit += before.bots.length;
    const count = Math.floor(this.freshStartCredit / RESHUFFLE_TURNS);
    const dashed = new Set(result.fires?.filter(({ kind }) => kind === "dash").map(({ botId }) => botId));
    const freshStarts: FreshStart[] = [];
    if (result.snapshot.tick % RESHUFFLE_TURNS === 0) this.pendingWeather = this.drawCondition();
    const nextRules = this.weatherAfterMoves(result.snapshot, dashed);
    const weatherChanged = nextRules !== arenaConditionOf(before);
    // Shrink first so no tank tunnels into a square about to disappear. Grow last so the
    // compact tick's tunnel destinations still fit the board the viewer has before the state.
    if (weatherChanged && ruleSet(boardRuleSetId(nextRules)).gridFillRatio > ruleSet(before.ruleSetId).gridFillRatio) {
      for (const { id, x, y } of changeRoundRules(round, nextRules, this.boardFor)) freshStarts.push({ id, x, y });
    }
    const displaced = freshStarts.length === 0 ? null : new Set(freshStarts.map(({ id }) => id));
    let botsChanged = false;
    for (const { id } of before.bots.slice(0, count)) {
      // The dash uses this turn's movement. Its tank keeps its place in the queue.
      if (dashed.has(id)) continue;
      this.freshStartCredit -= RESHUFFLE_TURNS;
      // A tank that just lost its square already went through a tunnel on this turn.
      if (displaced?.has(id)) continue;
      if (this.seated.has(id)) {
        const { x, y } = freshStartRound(round, id);
        freshStarts.push({ id, x, y });
      } else {
        this.freshStartBot(round, id);
        botsChanged = true;
      }
    }
    if (weatherChanged && arenaConditionOf(round.snapshot) !== nextRules) changeRoundRules(round, nextRules, this.boardFor);
    return { ...result, freshStarts, botsChanged, weatherChanged };
  }

  private weatherAfterMoves(snapshot: Snapshot, dashed: ReadonlySet<PlayerId>): ArenaConditionId {
    const next = this.pendingWeather;
    if (next === undefined) return arenaConditionOf(snapshot);
    if (dashed.size > 0) {
      const { width, height } = arenaSize(this.boardFor, ruleSet(boardRuleSetId(next)));
      // Apply the same draw on a later turn if the smaller floor would tunnel a dashing tank.
      if (snapshot.bots.some(({ id, x, y }) => dashed.has(id) && (x >= width || y >= height))) return arenaConditionOf(snapshot);
    }
    this.pendingWeather = undefined;
    return next;
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

  /**
   * A new round with the same tanks, points and statistics: for board growth or a round the
   * engine could not step. Positions, water and running step sequences are lost, as
   * after a restart, and the bots are drawn again as new tanks with 0 points.
   */
  rebuild(ticksLeft: number): void {
    const tanks = [...this.seated.values()].map(({ tank, counts, stats, ruleChanges }) => ({ tank, counts, stats, ruleChanges, points: this.pointsOf(tank.id) }));
    this.round = null;
    this.seated.clear();
    this.bots = [];
    this.start(tanks, ticksLeft);
  }

  /**
   * A new round with all these tanks at once, then one draw of the bots: a new day, a restart and
   * a rebuild. Seating them one by one would make the first draw see one tank and always add a bot.
   */
  start(tanks: readonly { readonly tank: DayTank; readonly points: number; readonly counts: boolean; readonly stats: TankStats | undefined; readonly ruleChanges?: number | undefined }[], ticksLeft: number, normalStreak = this.normalStreak): void {
    if (this.round !== null) throw new Error(`League ${this.league} already has a round.`);
    this.normalStreak = normalStreak;
    if (tanks.length === 0) return;
    const round = this.newRound(tanks.length, ticksLeft);
    this.round = round;
    this.handicapsSet.clear();
    // A random seating order, so the board's tank order (which settles some ties) changes with every
    // new round, like the tie ranks the engine draws at each join (BotState.tieRank).
    for (const { tank, points, counts, stats, ruleChanges = 0 } of this.shuffled(tanks)) {
      if (this.seated.has(tank.id)) throw new Error(`Seat ${tank.id} is already in league ${this.league}.`);
      joinRound(round, { id: tank.id, strategy: tank.strategy }, points);
      this.seated.set(tank.id, { tank, counts, stats: stats ?? EMPTY_STATS, ruleChanges, handicap: this.handicapFor(tank.strategy, ruleChanges) });
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
    const count = this.drawBotCount();
    for (let i = 0; i < count; i++) this.addBot();
  }

  private drawBotCount(): number {
    const drawn = Math.min(MAX_BOTS, Math.floor(this.random() * (MAX_BOTS + 1)));
    return this.seated.size === 1 ? Math.max(1, drawn) : drawn;
  }

  private freshStartBot(round: RoundState, id: PlayerId): void {
    const replaced = this.bots.findIndex((bot) => bot.id === id);
    if (replaced < 0) throw new Error(`Bot ${id} is not in league ${this.league}.`);
    const count = this.drawBotCount();
    // Join while the old square is still occupied so the new bot always comes out elsewhere.
    this.bots.splice(replaced, 1);
    if (count > 0) this.addBot();
    leaveRound(round, id);
  }

  /** One bot with a play style from the practice mix, a bot name and a colour no seated tank has, if one is free. */
  private addBot(): void {
    if (this.round === null) throw new Error(`League ${this.league} has no round for a bot.`);
    const strategy = botStrategies[Math.floor(this.random() * botStrategies.length)];
    if (strategy === undefined) throw new Error("The bot lineup is empty.");
    const taken = new Set<number>([...this.seated.values()].map(({ tank }) => tank.look.colour));
    for (const bot of this.bots) taken.add(bot.look.colour);
    const colour = ([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as const).find((c) => !taken.has(c)) ?? (((this.bots.length % 12) + 1) as TankColour);
    const name = BOT_NAMES.find((name) => this.bots.every((bot) => bot.name !== name)) ?? `Bot ${this.bots.length + 1}`;
    const bot: LeagueBot = { id: newBotId(), name, look: plainTankLook(colour) };
    joinRound(this.round, this.player(bot.id, strategy));
    this.bots.push(bot);
  }

  /** A bot as the engine plays it: with its built-in style's handicap at all times (HANDICAP_PLACES). */
  private player(id: PlayerId, strategy: Strategy): RoundPlayer {
    const handicap = this.handicapFor(strategy, 0);
    return handicap === undefined ? { id, strategy } : { id, strategy, handicap };
  }

  /** The handicap of a built-in style (handicapOf, "league") after `ruleChanges` changes today, or undefined for none. */
  private handicapFor(strategy: Strategy, ruleChanges: number): Handicap | undefined {
    const full = this.field.handicap === undefined ? handicapOf(strategy, "league") : this.field.handicap(strategy);
    return full === undefined ? undefined : relieved(full, ruleChanges);
  }

  /** Before a turn: each seat with a handicap plays it only while it holds a place of HANDICAP_PLACES. */
  private placeHandicaps(round: RoundState): void {
    const places = this.field.handicapPlaces ?? HANDICAP_PLACES;
    const unranked = this.field.unranked?.();
    const points = new Map(round.snapshot.bots.map((bot) => [bot.id, bot.score]));
    const standing = [...this.seated.values()].filter(({ tank }) => unranked === undefined || !unranked.has(tank.id));
    // A stable sort, so ties keep the board's order.
    standing.sort((a, b) => (points.get(b.tank.id) ?? 0) - (points.get(a.tank.id) ?? 0));
    const placed = new Set(standing.slice(0, places).map(({ tank }) => tank.id));
    for (const { tank, handicap } of this.seated.values()) {
      const wanted = placed.has(tank.id) ? handicap : undefined;
      if (this.handicapsSet.has(tank.id) && this.handicapsSet.get(tank.id) === wanted) continue;
      setPlayerHandicap(round, tank.id, wanted);
      this.handicapsSet.set(tank.id, wanted);
    }
  }

  /** The handicap the seat plays with now (HANDICAP_PLACES), for the tests and the balance scripts. */
  handicapNow(id: PlayerId): Handicap | undefined {
    if (!this.seated.has(id)) throw new Error(`Seat ${id} is not in league ${this.league}.`);
    return this.handicapsSet.get(id);
  }

  /** The seat's changes of rules today, for the checkpoint. */
  ruleChangesOf(id: PlayerId): number {
    const seated = this.seated.get(id);
    if (seated === undefined) throw new Error(`Seat ${id} is not in league ${this.league}.`);
    return seated.ruleChanges;
  }
}
