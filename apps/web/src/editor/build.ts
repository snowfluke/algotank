// Changes to the build. A level can be set only while the total stays inside
// the budget, so the editor cannot make a build that parseStrategy rejects.

import { ATTRIBUTES, BUILD_BUDGET, buildCost } from "@game/engine";
import type { Build, StrategyInput } from "@game/engine";

/** A build with every attribute present and every level inside its range, so buildCost cannot throw on a half-edited value. */
export function completeBuild(build: Build): Build {
  return Object.fromEntries(
    Object.values(ATTRIBUTES).map((attribute) => {
      const level = build[attribute.id];
      const highest = attribute.levels.length - 1;
      return [attribute.id, level !== undefined && Number.isInteger(level) ? Math.min(Math.max(level, 0), highest) : 0];
    }),
  );
}

export function levelOf(build: Build, attributeId: string): number {
  return completeBuild(build)[attributeId] ?? 0;
}

export function pointsSpent(build: Build): number {
  return buildCost(completeBuild(build));
}

export function pointsLeft(build: Build): number {
  return BUILD_BUDGET - pointsSpent(build);
}

/**
 * A level is allowed when the total stays within the budget. A build that is
 * already over budget may still move to a level that does not cost more, so
 * the player can always get back under the budget.
 */
export function canSetLevel(build: Build, attributeId: string, level: number): boolean {
  const attribute = Object.values(ATTRIBUTES).find((candidate) => candidate.id === attributeId);
  if (attribute === undefined || !Number.isInteger(level) || level < 0 || level >= attribute.levels.length) return false;
  const next = pointsSpent({ ...completeBuild(build), [attributeId]: level });
  return next <= BUILD_BUDGET || next <= pointsSpent(build);
}

export function setBuildLevel(strategy: StrategyInput, attributeId: string, level: number): StrategyInput {
  if (!canSetLevel(strategy.build, attributeId, level)) return strategy;
  return { ...strategy, build: { ...completeBuild(strategy.build), [attributeId]: level } };
}

/** Every upgrade back to level 0, so all the points are free to share out again ("Take all out"). */
export function emptyBuild(strategy: StrategyInput): StrategyInput {
  return { ...strategy, build: Object.fromEntries(Object.keys(ATTRIBUTES).map((id) => [id, 0])) };
}
