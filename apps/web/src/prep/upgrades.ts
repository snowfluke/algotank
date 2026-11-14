// The upgrade bench as data: the 6 upgrade points are tokens that lie in a tray or sit
// in the sockets of Range, Aim and Dodge (71-workshop-appeal.md, part B). A socket holds
// the points one level costs, so Range has 2 double sockets and Aim and Dodge 3 single
// ones. A tap on a socket, plus or minus becomes a new level, or a "blocked" answer that
// says how many points it needs, so no control looks active and does nothing.

import { ATTRIBUTES, ruleSet, STANDARD_RULE_SET_ID, throwRange } from "@game/engine";
import type { AttributeId, Build, RoundRules } from "@game/engine";
import { canSetLevel, completeBuild, levelOf, pointsLeft } from "../editor/build.ts";
import type { NextRules } from "../rules/nextRules.ts";

export const ATTRIBUTE_IDS = Object.keys(ATTRIBUTES) as AttributeId[];

/** One socket of an upgrade: filling it raises the upgrade to `level`, and it holds `tokens` points. */
export interface Socket {
  readonly level: number;
  readonly tokens: number;
}

/** The sockets of an upgrade, one per level above 0, in order. */
export function socketsOf(attribute: AttributeId): readonly Socket[] {
  const levels = ATTRIBUTES[attribute].levels;
  return levels.slice(1).map((level, i) => ({ level: i + 1, tokens: level.cost - (levels[i]?.cost ?? 0) }));
}

/** Points lying free in the tray. An over-budget draft shows none; its problem says what to fix. */
export function freePoints(build: Build): number {
  return Math.max(0, pointsLeft(build));
}

export type BenchTap =
  | { readonly kind: "set"; readonly level: number }
  /** More points are needed than lie free. */
  | { readonly kind: "blocked"; readonly need: number; readonly have: number }
  /** Nothing to do: plus at the top level, minus at level 0. Such a control is disabled. */
  | { readonly kind: "none" };

function costTo(attribute: AttributeId, level: number): number {
  return ATTRIBUTES[attribute].levels[level]?.cost ?? 0;
}

/**
 * A tap on the socket that holds `socketLevel`: an empty socket fills the upgrade up to that
 * level when the free points allow it; a filled one empties itself and every socket after it.
 */
export function tapSocket(build: Build, attribute: AttributeId, socketLevel: number): BenchTap {
  const current = levelOf(build, attribute);
  if (socketLevel <= current) return { kind: "set", level: socketLevel - 1 };
  if (canSetLevel(build, attribute, socketLevel)) return { kind: "set", level: socketLevel };
  return { kind: "blocked", need: costTo(attribute, socketLevel) - costTo(attribute, current), have: freePoints(build) };
}

export function tapPlus(build: Build, attribute: AttributeId): BenchTap {
  const current = levelOf(build, attribute);
  return current >= ATTRIBUTES[attribute].levels.length - 1 ? { kind: "none" } : tapSocket(build, attribute, current + 1);
}

export function tapMinus(build: Build, attribute: AttributeId): BenchTap {
  const current = levelOf(build, attribute);
  return current === 0 ? { kind: "none" } : { kind: "set", level: current - 1 };
}

/** The rules the bench uses: the next round's when known, the standard ones when the arena never changes them, none when they are secret. */
export function rulesForUpgrades(next: NextRules): RoundRules | null {
  switch (next.kind) {
    case "none":
      return ruleSet(STANDARD_RULE_SET_ID);
    case "known":
      return next.rules;
    case "hidden":
      return null;
  }
}

/** The round's numbers that the bench shows. */
export interface UpgradeNumbers {
  /** Squares a shot reaches with the chosen Range (throwRange). */
  readonly range: number;
  /** Aim and Dodge count from this many squares away. */
  readonly fromDistance: number;
  /** Percent that one level of Aim adds or one level of Dodge takes off. */
  readonly perLevel: number;
}

export function upgradeNumbers(rules: RoundRules | null, build: Build): UpgradeNumbers | null {
  if (rules === null) return null;
  return { range: throwRange(completeBuild(build), rules), fromDistance: rules.firstDistanceWithSkill, perLevel: rules.hitChancePerLevel };
}

/** The words of each card's live sentence (prep/messages.ts, upgrades.effects). */
export interface UpgradeEffectText {
  range(squares: number): string;
  rangeEmpty(squares: number): string;
  rangeSecret(extraSquares: number): string;
  readonly rangeEmptySecret: string;
  aim(percent: number): string;
  readonly aimEmpty: string;
  readonly aimSecret: string;
  dodge(percent: number): string;
  readonly dodgeEmpty: string;
  readonly dodgeSecret: string;
}

/** What one upgrade does now, with the round's numbers, or without them when the rules are secret. */
export function upgradeSentence(text: UpgradeEffectText, attribute: AttributeId, level: number, numbers: UpgradeNumbers | null): string {
  switch (attribute) {
    case "reach":
      if (numbers === null) return level === 0 ? text.rangeEmptySecret : text.rangeSecret(level);
      return level === 0 ? text.rangeEmpty(numbers.range) : text.range(numbers.range);
    case "aim":
      if (level === 0) return text.aimEmpty;
      return numbers === null ? text.aimSecret : text.aim(level * numbers.perLevel);
    case "dodge":
      if (level === 0) return text.dodgeEmpty;
      return numbers === null ? text.dodgeSecret : text.dodge(level * numbers.perLevel);
  }
}
