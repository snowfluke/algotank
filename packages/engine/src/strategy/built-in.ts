// Whether a strategy is a built-in play style in all but name (owner, 2026-11-20: "i don't want preset guy win the
// match or private tournament or monthly or any, neither the low-effort changing 1 number").
//
// Two tests, because each alone has a hole (measured 2026-11-20, built-in.test.ts):
// 1. Changes: what the rules check and do, as a set of rule shapes per mode (conditions with their choices, the
//    action with its choices, the mode it switches to), against each built-in style. Numbers, chances, rule order,
//    duplicate rules, names, upgrades and the ultimate are not part of a shape, so changing them is no change. A
//    strategy needs OWN_RULE_CHANGES changes (a shape added or removed) from its nearest built-in style. Alone this
//    lets two rules that never run count as rules of its own.
// 2. Likeness: on a fixed bank of board situations from seeded rounds of the built-in styles, the strategy and each
//    built-in style decide from the same board with the same draws, mode by mode; the share of equal choices (the
//    same move and the same next mode) must stay below BUILT_IN_LIKENESS. Alone this misses a one-number edit that
//    changes many choices: the evader with one number changed makes 24% of its choices differently.
// A strategy is a built-in style in all but name when it fails either test.

import { createRound, stepRound } from "../round/round.ts";
import type { BotState, DecisionContext, Snapshot, Strategy } from "../types.ts";
import type { RuleSetId } from "../combat/rule-sets.ts";
import { createRng } from "../round/rng.ts";
import { decide } from "./decide.ts";
import { parseStrategy } from "./parse.ts";
import { PRESETS, PRESET_IDS, type PresetId } from "./presets.ts";
import BEFORE_RETUNE from "./former-presets/presets-before-2026-11-16.json";
import BEFORE_DRY_SPELL from "./former-presets/presets-before-2026-11-16-dry-spell.json";
import BEFORE_GRAB from "./former-presets/presets-before-2026-11-16-grab.json";

/**
 * The built-in styles a strategy is held against: today's, and each style's rules from before a retune, so a tank that
 * kept an older built-in style counts as that style too. A retired version takes today's ultimate of its style.
 */
let references: readonly { readonly id: PresetId; readonly strategy: Strategy }[] | null = null;

/** Parsed once, on the first check, so importing the engine costs nothing. */
function referencesOf(): readonly { readonly id: PresetId; readonly strategy: Strategy }[] {
  if (references !== null) return references;
  references = [
  ...PRESETS.map((preset) => ({ id: preset.id, strategy: preset.strategy })),
  ...[BEFORE_RETUNE, BEFORE_DRY_SPELL, BEFORE_GRAB].flatMap((versions) =>
    Object.entries(versions as Readonly<Record<string, unknown>>).map(([id, input]) => {
      const current = PRESETS.find((preset) => preset.id === id);
      if (current === undefined || !PRESET_IDS.includes(current.id)) throw new Error(`A retired built-in style "${id}" has no style today.`);
      const parsed = parseStrategy({ ...(input as object), ultimate: current.strategy.ultimate });
      if (!parsed.ok) throw new Error(`The retired built-in style "${id}" does not parse: ${parsed.errors.join("; ")}`);
      return { id: current.id, strategy: parsed.strategy };
    }),
  ),
  ];
  return references;
}

/**
 * The likeness from which a strategy counts as a built-in style. Between two different built-in styles the highest
 * likeness is far lower, and a one-number edit stays far above it (built-in.test.ts prints both); 0.9 sits between,
 * so a child must change what the tank does in about one board situation in ten.
 */
export const BUILT_IN_LIKENESS = 0.9;

/** Changes in what the rules check or do (a rule shape added, removed, or replaced, which is both) a strategy needs. */
export const OWN_RULE_CHANGES = 2;

type ShapedStrategy = Pick<Strategy, "modes">;

/** A rule's or a fallback's choices without its numbers: ids, negation and text choices such as the target. */
function shapeOf(params: Readonly<Record<string, number | string>>): string {
  return Object.keys(params).sort().filter((key) => typeof params[key] === "string").map((key) => `${key}=${String(params[key])}`).join(",");
}

/** The set of rule shapes of a strategy, each keyed by its mode's place, so moving a rule to another mode is a change. */
function shapesOf(strategy: ShapedStrategy): ReadonlySet<string> {
  const place = (id: string | null) => (id === null ? -1 : strategy.modes.findIndex((mode) => mode.id === id));
  const shapes = new Set<string>();
  strategy.modes.forEach((mode, index) => {
    shapes.add(`${index}|fallback|${mode.fallback.action}(${shapeOf(mode.fallback.params)})`);
    for (const rule of mode.rules) {
      const conditions = rule.conditions.map((c) => `${c.negate ? "!" : ""}${c.condition}(${shapeOf(c.params)})`).sort().join("&");
      const action = "steps" in rule.action ? rule.action.steps.map((step) => `${step.action}(${shapeOf(step.params)})`).join(">") : `${rule.action.action}(${shapeOf(rule.action.params)})`;
      shapes.add(`${index}|${rule.match}|${conditions}|${action}|${place(rule.switchToMode)}`);
    }
  });
  return shapes;
}

/** Shapes in one strategy and not in the other, both ways. */
export function ruleChanges(a: ShapedStrategy, b: ShapedStrategy): number {
  const left = shapesOf(a);
  const right = shapesOf(b);
  let changes = 0;
  for (const shape of left) if (!right.has(shape)) changes++;
  for (const shape of right) if (!left.has(shape)) changes++;
  return changes;
}

/** Rounds the bank is taken from: one per rule set that changes what rules read (range, water). */
const BANK_RULE_SETS: readonly RuleSetId[] = ["standard", "arms-length", "dry-spell", "downpour"];
const BANK_TURNS = 120;
/** Every SAMPLE_EVERY-th turn of each round goes into the bank, each tank on it a situation. */
const SAMPLE_EVERY = 6;

let bank: readonly { readonly snapshot: Snapshot; readonly self: BotState }[] | null = null;

/** The situations, made once: seeded rounds of every built-in style together, so they are the same on every machine. */
function situations(): readonly { readonly snapshot: Snapshot; readonly self: BotState }[] {
  if (bank !== null) return bank;
  const made: { snapshot: Snapshot; self: BotState }[] = [];
  BANK_RULE_SETS.forEach((ruleSetId, round) => {
    const state = createRound({
      seed: 20_261_120 + round,
      ticksTotal: BANK_TURNS,
      survivorsAfterRound: null,
      ruleSetId,
      players: PRESETS.map((preset, i) => ({ id: `bank-${i}`, strategy: preset.strategy })),
      items: true,
      ultimates: true,
    });
    for (let turn = 1; turn <= BANK_TURNS; turn++) {
      const { snapshot } = stepRound(state);
      if (turn % SAMPLE_EVERY === 0) for (const self of snapshot.bots) made.push({ snapshot, self });
    }
  });
  bank = made;
  return made;
}

/** The share of situations, over the built-in style's modes, in which `strategy` chooses as `style` does. */
function likeness(strategy: Strategy, style: Strategy): number {
  let same = 0;
  let total = 0;
  const modeIndex = (modes: Strategy["modes"], id: string) => modes.findIndex((mode) => mode.id === id);
  situations().forEach(({ snapshot, self }, n) => {
    style.modes.forEach((styleMode, index) => {
      total++;
      const own = strategy.modes[index];
      if (own === undefined) return;
      const asStyle: DecisionContext = { snapshot, self: { ...self, modeId: styleMode.id } };
      const asOwn: DecisionContext = { snapshot, self: { ...self, modeId: own.id } };
      // The same draws for both, so a chance rule only differs where its chance differs.
      const a = decide(asStyle, style, createRng(n * 16 + index));
      const b = decide(asOwn, strategy, createRng(n * 16 + index));
      if (a.move === b.move && modeIndex(style.modes, a.nextModeId) === modeIndex(strategy.modes, b.nextModeId)) same++;
    });
  });
  return total === 0 ? 0 : same / total;
}

/** The built-in style most like `strategy`, with its likeness from 0 to 1. */
export function nearestBuiltIn(strategy: Strategy): { readonly id: PresetId; readonly likeness: number } {
  let best: { id: PresetId; likeness: number } | null = null;
  for (const preset of referencesOf()) {
    const value = likeness(strategy, preset.strategy);
    if (best === null || value > best.likeness) best = { id: preset.id, likeness: value };
  }
  if (best === null) throw new Error("The engine has no built-in play style.");
  return best;
}

/** How far a strategy is from the built-in styles: its fewest changes from one, and its nearest in choices. */
export interface BuiltInCheck {
  /** The built-in style with the fewest changes, and that count. */
  readonly closest: { readonly id: PresetId; readonly changes: number };
  /** The built-in style it chooses most like, and the share of equal choices. */
  readonly alike: { readonly id: PresetId; readonly likeness: number };
  /** The built-in style it plays in all but name, or null for rules of its own. */
  readonly style: PresetId | null;
}

export function checkBuiltIn(strategy: Strategy): BuiltInCheck {
  let closest: { id: PresetId; changes: number } | null = null;
  for (const preset of referencesOf()) {
    const changes = ruleChanges(strategy, preset.strategy);
    if (closest === null || changes < closest.changes) closest = { id: preset.id, changes };
  }
  if (closest === null) throw new Error("The engine has no built-in play style.");
  // The choices are compared only when the changes pass, so a plain built-in style costs no simulation.
  if (closest.changes < OWN_RULE_CHANGES) return { closest, alike: { id: closest.id, likeness: 1 }, style: closest.id };
  const alike = nearestBuiltIn(strategy);
  return { closest, alike, style: alike.likeness >= BUILT_IN_LIKENESS ? alike.id : null };
}

/** The built-in style `strategy` plays in all but name, or null for rules of its own. */
export function builtInStyleOf(strategy: Strategy): PresetId | null {
  return checkBuiltIn(strategy).style;
}

/** Where a round plays: a day of the monthly league, or a room's round (a public or private arena, the Try it match). */
export type HandicapPlace = "league" | "room";

/**
 * The handicap of a tank that plays a built-in style in all but name (RoundPlayer.handicap, round/resolve.ts), in
 * percentage points of hit chance. Owner, 2026-11-20: a built-in style should win against good rules of a child's own
 * only about 5% of the time, and the rule stays unwritten: no screen shows it. A league day of 96,000 turns averages
 * out the luck that a room's 90-turn round keeps, so the same handicap moves a day far more and the league needs less.
 * Calibrated on 2026-11-20 with the live league's rules: apps/server/scripts/handicap-calibration.ts (league) and
 * handicap-rooms.ts (rooms).
 */
// Measured: a league day with the game master's leader chase, 40 days each, built-in day wins 48% at 0, 12% at 5, 2% at 8;
// without the leader chase 5% at 0 and 0% at 10. A public tournament (16 tanks, the six best own tanks of the live
// month), 1,000 each: 59% at 0, 22% at 20, 10% at 30, 5.7% at 35.
export const BUILT_IN_HANDICAP: Readonly<Record<HandicapPlace, number>> = { league: 8, room: 35 };

const builtIn = new Map<string, boolean>();

/** RoundPlayer.handicap for a strategy; the check is remembered by its rules, so each strategy is checked once per process. */
export function handicapOf(strategy: Strategy, place: HandicapPlace): number {
  const key = JSON.stringify(strategy);
  let plays = builtIn.get(key);
  if (plays === undefined) {
    plays = builtInStyleOf(strategy) !== null;
    builtIn.set(key, plays);
  }
  return plays ? BUILT_IN_HANDICAP[place] : 0;
}
