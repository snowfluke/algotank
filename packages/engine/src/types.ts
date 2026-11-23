// The engine contract. The server, the simulation script and the browser all
// import these shapes, so a change here is a change to every one of them.
//
// Four rules hold for every implementation behind this file:
// 1. Determinism. The same RoundConfig gives the same TickResult list. Every
//    random draw comes from the round seed. Nothing reads Math.random or the clock.
// 2. Same-snapshot decisions. On each tick every bot decides from the snapshot
//    taken before the tick. Moves then resolve one at a time in a shuffled order.
// 3. A strategy always answers. Each mode has a fallback action, so "no rule
//    matched" does not exist. A rule whose action cannot act (it needs a target
//    and the selector finds nobody) is skipped, never replaced by another move.
//    A fallback that cannot act makes the bot throw ahead, which stands still.
//    A throw at a bot spends water from the thrower's tank (see combat/rule-sets.ts),
//    so a throw from a tank that holds too little water does nothing.
// 4. Each turn reads arena rules from its snapshot. Monthly weather can change
//    the condition between turns, and a layout can give different squares different rules.
//
// The rules of play for the eight directions are a table in directions.ts.

import type { UltimateId } from "./ultimates/ultimates.ts";
import type { RuleSetId } from "./combat/rule-sets.ts";
import type { Cell } from "./round/grid.ts";
import type { ArenaLayout } from "./round/arena-layouts.ts";

/** The eight facings, clockwise from north. Each is 45 degrees from the next. directions.ts holds the geometry. */
export const DIRECTIONS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"] as const;
export type Direction = (typeof DIRECTIONS)[number];

/**
 * F = forward one cell (diagonal included), L and R = turn 90 degrees left or
 * right, L45 and R45 = turn 45 degrees left or right, T = throw straight ahead,
 * W = wait: the bot stays, keeps its facing and throws nothing. W is last, so the
 * index of every older move (packages/arena/src/compact-tick.ts) stays the same.
 */
export const MOVES = ["F", "L", "R", "L45", "R45", "T", "W"] as const;
export type Move = (typeof MOVES)[number];
/** The moves that only change the facing. */
export type TurnMove = Extract<Move, "L" | "R" | "L45" | "R45">;

export type BotId = string;

// ---------------------------------------------------------------------------
// Items (items/items.ts holds the rules, docs/specs/revamp/84-items.md the design)
// ---------------------------------------------------------------------------

/** The kinds of item, in the order of every table and of the compact tick's item index. A tank holds one until it acts. */
export const ITEM_KINDS = ["bucket", "umbrella", "pinwheel", "mudBall"] as const;
export type ItemKind = (typeof ITEM_KINDS)[number];
/** Dizzy: the tank spins round for its first turns, then checks its rules from the bottom up (items/items.ts). Stuck: the tank cannot drive or turn. */
export const TANK_EFFECT_KINDS = ["dizzy", "stuck"] as const;
export type TankEffectKind = (typeof TANK_EFFECT_KINDS)[number];

/** Turns left include spin turns. Older pinwheel snapshots derive spins from turnsLeft. */
export type TankEffect =
  | { readonly kind: "stuck"; readonly turnsLeft: number }
  | { readonly kind: "dizzy"; readonly turnsLeft: number; readonly spinTurnsLeft?: number };

export type UltimateState = { readonly id: UltimateId } & (
  | { readonly kind: "charging"; readonly turnsLeft: number; readonly turnsTotal: number }
  | { readonly kind: "ready" }
);

export type UltimateEffect =
  | { readonly kind: "smoke"; readonly turnsLeft: number }
  | { readonly kind: "bigUmbrella"; readonly blocksLeft: number }
  | { readonly kind: "fullTank"; readonly freeShots: number };

/** An item that lies on a square nobody holds. */
export interface BoardItem {
  readonly kind: ItemKind;
  readonly x: number;
  readonly y: number;
  /** Turns until it leaves the board, from 1 up. */
  readonly turnsLeft: number;
}

/** A tank took an item on this turn. */
export interface Pickup {
  readonly botId: BotId;
  readonly item: ItemKind;
}

// ---------------------------------------------------------------------------
// Random numbers
// ---------------------------------------------------------------------------

/** Seeded generator. One instance per round; the draw order is part of the rules. */
export interface Rng {
  /** Uniform float in [0, 1). */
  next(): number;
  /** Uniform integer in [0, maxExclusive). */
  int(maxExclusive: number): number;
  /** True with the given probability, where percent is 0 to 100. */
  chance(percent: number): boolean;
  /** Returns a shuffled copy. */
  shuffle<T>(items: readonly T[]): T[];
}

// ---------------------------------------------------------------------------
// Vocabulary: the conditions, target selectors, actions and build attributes a
// player can choose from. Each kind lives in one table keyed by id, so adding
// an entry edits one file and the editor picks it up from the table.
// ---------------------------------------------------------------------------

export type ParamSpec =
  | {
      readonly kind: "int";
      readonly key: string;
      readonly label: string;
      readonly min: number;
      readonly max: number;
      readonly default: number;
      readonly options?: readonly number[];
      readonly unit?: string;
    }
  | {
      readonly kind: "choice";
      readonly key: string;
      readonly label: string;
      readonly options: readonly { readonly value: string; readonly label: string }[];
      readonly default: string;
    }
  /** The value is the id of a TargetSelectorDef. */
  | { readonly kind: "target"; readonly key: string; readonly label: string; readonly default: string };

export type ParamValues = Readonly<Record<string, number | string>>;

/** What a condition or an action can read while a bot decides. */
export interface DecisionContext {
  readonly self: BotState;
  /** The snapshot from before this tick. It includes self. */
  readonly snapshot: Snapshot;
}

export interface ConditionDef {
  readonly id: string;
  /** Editor group heading, for example "Enemies" or "Score". */
  readonly group: string;
  /** Plain sentence shown in the editor. `{key}` marks where a parameter goes. */
  readonly label: string;
  readonly params: readonly ParamSpec[];
  /** False even when negated in a round without ultimates. */
  readonly requiresUltimate?: true;
  /** Must not draw random numbers; a condition is a fact about the snapshot. */
  test(ctx: DecisionContext, params: ParamValues): boolean;
}

export interface TargetSelectorDef {
  readonly id: string;
  readonly label: string;
  /** Returns null when no bot qualifies. Ties must resolve without random draws. */
  pick(ctx: DecisionContext): BotState | null;
}

export interface ActionDef {
  readonly id: string;
  readonly group: string;
  readonly label: string;
  readonly params: readonly ParamSpec[];
  /** The fallback cannot use this action. */
  readonly ruleOnly?: true;
  /**
   * Turns the intent into one move or one ultimate for this tick, or returns null when
   * the action cannot act: it needs a target and the selector finds nobody, or
   * it answers to a threat and there is none. It must not return a substitute
   * move then. decide() skips the rule, or throws ahead when it is the fallback.
   */
  toMove(ctx: DecisionContext, params: ParamValues, rng: Rng): Move | UltimateAction | null;
}

export interface AttributeDef {
  readonly id: string;
  readonly label: string;
  /** One sentence for the editor that states what a higher level does. */
  readonly effect: string;
  /** Index is the level. `cost` is the points that level takes from the budget. */
  readonly levels: readonly { readonly cost: number; readonly label: string }[];
}

// ---------------------------------------------------------------------------
// Strategy: what a player submits. It is data. The engine never runs player code.
// ---------------------------------------------------------------------------

/** Attribute id to chosen level. Every attribute in the table has an entry. */
export type Build = Readonly<Record<string, number>>;

export interface ConditionRef {
  readonly condition: string;
  readonly params: ParamValues;
  /** True turns the condition into its opposite ("is NOT ..."). */
  readonly negate: boolean;
}

export interface ActionRef {
  readonly action: string;
  readonly params: ParamValues;
}

/**
 * A fixed order of 2 to 4 steps (LIMITS). A step is an atomic action only
 * (STEP_ACTION_IDS in strategy/sequence.ts), so every step is one move and never
 * reads the arena. strategy/sequence.ts holds the rules of a running sequence.
 */
export interface StepSequence {
  readonly steps: readonly ActionRef[];
}

/** What a rule does: one action, decided on the turn (the stored shape of every older strategy), or a sequence of steps. Tell them apart with `"steps" in action`. */
export type RuleAction = ActionRef | StepSequence;

export interface Rule {
  readonly id: string;
  /** "all": every condition must hold. "any": one is enough. */
  readonly match: "all" | "any";
  /** At least one condition. */
  readonly conditions: readonly ConditionRef[];
  readonly action: RuleAction;
  /**
   * 1 to 100. When the conditions hold, the rule runs with this probability.
   * When the roll fails, evaluation continues with the next rule.
   */
  readonly chance: number;
  /**
   * When set, the bot uses this mode from the next tick on. The switch happens
   * after the action, so a tick always produces a move and modes cannot loop.
   * With a sequence, it happens after the last step.
   */
  readonly switchToMode: string | null;
}

export interface Mode {
  readonly id: string;
  readonly name: string;
  readonly rules: readonly Rule[];
  /** Runs when no rule ran. */
  readonly fallback: ActionRef;
}

export interface StrategyInput {
  /** At least one mode. The first mode is the one a bot starts each round in. */
  readonly modes: readonly Mode[];
  readonly build: Build;
  readonly ultimate: UltimateId;
}

declare const validStrategy: unique symbol;
/**
 * A StrategyInput that passed parseStrategy. Only parseStrategy produces this
 * type, so the engine never receives an unknown id, an out-of-range parameter
 * or a build over budget.
 */
export type Strategy = StrategyInput & { readonly [validStrategy]: true };

export type ParseResult =
  | { readonly ok: true; readonly strategy: Strategy }
  | { readonly ok: false; readonly errors: readonly string[] };

export interface Preset {
  readonly id: string;
  readonly name: string;
  /** One sentence that tells a player how this preset plays. */
  readonly summary: string;
  readonly strategy: Strategy;
}

// ---------------------------------------------------------------------------
// Round state
// ---------------------------------------------------------------------------

/** At most two items behind the acting item. They keep their full uses until they come forward. */
export type WaitingItems = readonly [ItemKind, ItemKind?];

/** The acting item, or null for an empty hand. Only Magnet can add waiting items. */
export type ItemHand =
  | { readonly item: ItemKind | null; readonly itemsWaiting?: never }
  | { readonly item: ItemKind; readonly itemsWaiting: WaitingItems };

export type BotState = ItemHand & {
  readonly id: BotId;
  readonly x: number;
  /** y grows downward; "N" faces toward y - 1. */
  readonly y: number;
  readonly direction: Direction;
  readonly score: number;
  /** True when a throw hit this bot on the previous tick. */
  readonly wasHit: boolean;
  /** The bot whose throw last hit this one in this round. */
  readonly lastHitBy: BotId | null;
  /**
   * Ticks since this bot was last hit in this round, or null when never hit.
   * It is 0 on the snapshot right after the hit, so wasHit is true exactly when it is 0.
   */
  readonly ticksSinceHit: number | null;
  readonly lastMove: Move | null;
  /** The mode this bot's strategy is in. */
  readonly modeId: string;
  readonly build: Build;
  /**
   * Ticks played in the current mode. 0 at spawn and on the snapshot right after
   * a switch to another mode. Reset each round.
   */
  readonly ticksInMode: number;
  /** Hits this bot landed this round. Reset each round. */
  readonly hitsLanded: number;
  /** Hits that landed on this bot this round. Reset each round. */
  readonly hitsTaken: number;
  /**
   * Ticks since this bot last landed a hit, or null when it has not landed one.
   * It is 0 on the snapshot right after the hit, like ticksSinceHit.
   */
  readonly ticksSinceLandedHit: number | null;
  /**
   * Water in the tank, full at spawn and capped at the arena's limit. A throw at a bot
   * spends waterPerThrow from the thrower's square. A tank that spent none adds
   * waterRefillPerTick from the square where it ends the turn (see RoundRules).
   */
  readonly water: number;
  /** Uses left of the acting item (ITEM_RULES.uses); 0 when the hand is empty. Not sent to the pages. */
  readonly itemUses: number;
  /** Dizzy or stuck, while it lasts, or null. */
  readonly effect: TankEffect | null;
  /** Present during a round with ultimates on. Changing the ultimate starts a fresh charge. */
  readonly ultimate?: UltimateState;
  /** The tank's own active ultimate, independent of dizziness or mud. */
  readonly ultimateEffect?: UltimateEffect | null;
  /**
   * Only in an open round (joinRound): a number from the round seed, drawn at join, that settles a
   * target selector's tie in place of the id (strategy/targets.ts). A monthly seat keeps its id all
   * month, and a fixed tie order was worth thousands of points a day (2026-11-16); each tank
   * draws a new rank at its fresh start (2026-11-19). Absent in every other
   * round, so those play exactly as before. Never sent to viewers (PublicBot).
   */
  readonly tieRank?: number;
};

export interface Snapshot {
  readonly width: number;
  readonly height: number;
  /** Number of ticks already played, starting at 0. */
  readonly tick: number;
  readonly ticksTotal: number;
  /** How many bots survive this round's cut, or null in a grand final. */
  readonly survivorsAfterRound: number | null;
  /** The rule set of a single condition, or Standard for a layout. */
  readonly ruleSetId: RuleSetId;
  /** Only on hybrid monthly boards. */
  readonly layout?: ArenaLayout;
  readonly bots: readonly BotState[];
  /** Items on the board. Always empty in a round with items off. */
  readonly items: readonly BoardItem[];
}

/**
 * A handicap in percentage points of hit chance (handicapped in round/resolve.ts). `miss` comes off this tank's throws at a
 * tank with a smaller miss, and `exposure` goes onto throws at it from a tank with a smaller exposure, so two tanks
 * with the same handicap play each other as without one. Two parts, so the misses a player sees can stay small while
 * being hit more carries the rest (owner, 2026-11-21: "I want the misses hit not too apparent").
 */
export interface Handicap {
  readonly miss: number;
  readonly exposure: number;
}

export interface RoundPlayer {
  readonly id: BotId;
  readonly strategy: Strategy;
  /**
   * The tank's handicap. The server sets it; the engine never derives it, so a stored config replays as it played.
   * Absent means none, so older configs and fixtures play exactly as before. A number is a handicap of that many points
   * in both parts: rounds stored from 2026-11-21 00:15 until the two parts came carry one.
   */
  readonly handicap?: number | Handicap;
}

export interface RoundConfig {
  /** A safe integer. createRng throws on any other number. */
  readonly seed: number;
  readonly ticksTotal: number;
  readonly survivorsAfterRound: number | null;
  /** The starting rule set. createRound throws on an id that is not in RULE_SETS. */
  readonly ruleSetId: RuleSetId;
  /** At least two players, with unique ids. */
  readonly players: readonly RoundPlayer[];
  /**
   * True in every arena. False only for the balance scripts, the landing demo and the older
   * seed fixtures: such a round draws exactly what it drew before items existed.
   */
  readonly items: boolean;
  readonly ultimates: boolean;
  /**
   * True from 2026-11-23: a tank that would throw without water for a throw because a move could not go on (a tank in
   * its way, nowhere less crowded), not because its rule said to throw, waits instead (round.ts, waitsWhenDry). Absent
   * or false in rounds played before, so their replays stay exact (stored-arena.ts).
   */
  readonly waitWhenDry?: boolean;
  /**
   * True from 2026-11-23 (later the same day): such a throw, which no rule asked for, also waits when no tank stands in
   * its line, so a tank does not throw at empty squares (a fallback that cannot act, nowhere less crowded). A throw
   * that would hit the tank in its way still goes. Absent or false before, as waitWhenDry.
   */
  readonly waitWhenNoTarget?: boolean;
}

/** What one bot decided on one tick, and why. */
export type Decision = TurnAction & {
  readonly botId: BotId;
  /** The mode the bot was in when it decided. */
  readonly modeId: string;
  /** The rule that ran, including its steps. Null on fallback, spin and automatic ultimate turns. */
  readonly ruleId: string | null;
  /**
   * The action behind the move; on a turn of a sequence, the step's action. When the fallback cannot act, this is still the
   * fallback's id and the move is T, because the player's replay names the
   * fallback from the strategy.
   */
  readonly actionId: string;
  /** The mode the bot is in after this tick. */
  readonly nextModeId: string;
  /**
   * Only on a turn of a sequence: which step this is (1 for the first) of how many.
   * The key is absent on every other turn, so a round without sequences produces
   * exactly the decisions it produced before sequences existed.
   */
  readonly step?: SequenceStep;
  /**
   * A dizzy tank checked its rules from the bottom up, or spun during the first turns of the effect.
   */
  readonly dizzy?: true;
  /**
   * Only when a dizzy tank spun right in place and checked no rule.
   */
  readonly spin?: true;
};

/** Ultimate decisions use the wait move on the existing move table. */
export type TurnAction =
  | { readonly move: Move; readonly ultimate?: never }
  | UltimateAction;

export type UltimateAction = { readonly move: "W"; readonly ultimate: UltimateId };

/** The place of a turn in a running sequence: step `index` (from 1) of `count`. */
export interface SequenceStep {
  readonly index: number;
  readonly count: number;
}

/** Points a defense stopped on this roll, using the points the shot would have moved. */
export interface ShotProtection {
  readonly kind: "smoke" | "bigUmbrella" | "umbrella";
  readonly pointsSaved: number;
}

/** Empty, dry and dodged throws draw no roll.
 * A dry tank lacks the water for a shot on its square. A dodged throw still costs a shot. */
export type ThrowEvent =
  | { readonly throwerId: BotId; readonly outcome: "empty" }
  | {
      readonly throwerId: BotId;
      /** The first bot in the line within range. */
      readonly targetId: BotId;
      readonly distance: number;
    } & ({ readonly outcome: "dry" } | { readonly outcome: "dodged" })
  | {
      readonly throwerId: BotId;
      readonly outcome: "deflected";
      /** The smoked tank in the throw line, which scores if the deflection hits. */
      readonly targetId: BotId;
      readonly distance: number;
      readonly hitChance: number;
      readonly deflectedTo: BotId;
      /** Clockwise eighths from the original shot to the neighbour's square at impact. */
      readonly deflectedTurn: number;
      readonly deflection: "hit" | "blocked" | "dodged";
      /** Balance measurements for the original miss and the deflected impact. */
      readonly protection?: ShotProtection;
      readonly deflectedProtection?: ShotProtection;
    }
  | {
      readonly throwerId: BotId;
      /** "blocked": the roll hit, and the target's umbrella stopped it, so no point moved. */
      readonly outcome: "miss" | "hit" | "blocked";
      /** The first bot in the line within range. */
      readonly targetId: BotId;
      readonly distance: number;
      /** The probability used for the roll, 0 to 100. A Dash ram is sure and draws nothing. */
      readonly hitChance: number;
      /**
       * Only on a hit from a tank with a bucket: the hit moved ITEM_RULES.bucketHitPoints points.
       * The key is absent on every other throw, so a round without items gives the throws it gave before.
       */
      readonly bucket?: true;
      /** Recorded in rounds with ultimates on, for the balance comparison. */
      readonly protection?: ShotProtection;
    };

export type SplashSquare = Cell & (
  | { readonly outcome: "empty"; readonly targetId?: never; readonly protection?: never }
  | { readonly outcome: "miss" | "hit" | "blocked" | "dodged"; readonly targetId: BotId; readonly protection?: ShotProtection }
);

export interface MagnetFire {
  readonly kind: "magnet";
  readonly botId: BotId;
  readonly at: Cell;
  /** Floor pulls closest first, then the new bucket with no source square. */
  readonly items: readonly ({ readonly kind: ItemKind; readonly from: Cell } | { readonly kind: "bucket"; readonly from?: never })[];
}

export type UltimateFire = { readonly botId: BotId; readonly at: Cell } & (
  | { readonly kind: "dash"; readonly path: readonly Cell[]; readonly shot: ThrowEvent; readonly points: number }
  | { readonly kind: "splash"; readonly squares: readonly SplashSquare[] }
  | { readonly kind: "mudBomb"; readonly center: Cell | null; readonly area: readonly Cell[]; readonly affected: readonly BotId[]; readonly points: number }
  | { readonly kind: "whirlwind"; readonly area: readonly Cell[]; readonly affected: readonly BotId[]; readonly points: number }
  | { readonly kind: "smoke" | "fullTank" | "bigUmbrella" }
) | MagnetFire;

export interface TickResult {
  /** The tick just played, starting at 0. */
  readonly tick: number;
  /** The order in which moves resolved. */
  readonly order: readonly BotId[];
  /** One entry per bot, in the snapshot's bot order. */
  readonly decisions: readonly Decision[];
  readonly throws: readonly ThrowEvent[];
  /** Items taken on this tick, in the order of the board's item list. A backfired one is listed too. */
  readonly pickups: readonly Pickup[];
  /** In move order, present in rounds with ultimates on. */
  readonly fires?: readonly UltimateFire[];
  /** The state after the tick. */
  readonly snapshot: Snapshot;
}

/** Opaque handle for a round in progress. Create it with createRound. */
export interface RoundState {
  readonly config: RoundConfig;
  /** The current state: the spawn state before the first step, then the state after each tick. */
  readonly snapshot: Snapshot;
  readonly isOver: boolean;
}

export interface Standing {
  readonly botId: BotId;
  readonly score: number;
  /**
   * 1 is best. Unique. Order: more points, then more hits landed, then the
   * lower tie-break number drawn from the round seed.
   */
  readonly rank: number;
  /** Hits this bot landed in the round. */
  readonly hitsLanded: number;
  /** Hits this bot took in the round. */
  readonly hitsTaken: number;
}
