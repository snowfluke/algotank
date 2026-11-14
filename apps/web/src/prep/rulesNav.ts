// Which part of the rules editor is open: the list of the chosen mode, or one step
// (the modes, a rule, one condition of a rule, "If no rule fits"). The screen keeps
// it (the arena's preparation pane, the workshop editor), so a step can replace the
// whole pane on a phone and sit beside the list on a wide pane, and a resize keeps it.

import type { Mode, StrategyInput } from "@game/engine";

export type RuleSection = "when" | "do" | "more";

export type RulesView =
  | { readonly kind: "list" }
  | { readonly kind: "modes" }
  /** The chosen mode's name, start and delete. */
  | { readonly kind: "modeOptions" }
  | { readonly kind: "rule"; readonly ruleId: string; readonly section: RuleSection }
  | { readonly kind: "condition"; readonly ruleId: string; readonly index: number }
  /** One step of a rule's steps in order (S3): its kind, its place, remove. */
  | { readonly kind: "seqStep"; readonly ruleId: string; readonly index: number }
  | { readonly kind: "fallback" };

export interface RulesNav {
  /** The chosen mode; null or a mode that is gone means the first one. */
  readonly modeId: string | null;
  readonly view: RulesView;
}

export const RULES_LIST: RulesNav = { modeId: null, view: { kind: "list" } };

export function chosenMode(strategy: StrategyInput, modeId: string | null): { readonly mode: Mode; readonly index: number } | null {
  const index = Math.max(0, strategy.modes.findIndex((mode) => mode.id === modeId));
  const mode = strategy.modes[index];
  return mode === undefined ? null : { mode, index };
}

/** The view, or the list when the rule or condition it names is gone (deleted, or replaced by a play style). */
export function resolveView(strategy: StrategyInput, nav: RulesNav): RulesView {
  const { view } = nav;
  if (view.kind !== "rule" && view.kind !== "condition" && view.kind !== "seqStep") return view;
  const rule = chosenMode(strategy, nav.modeId)?.mode.rules.find((r) => r.id === view.ruleId);
  if (rule === undefined) return { kind: "list" };
  if (view.kind === "condition" && rule.conditions[view.index] === undefined) return { kind: "rule", ruleId: rule.id, section: "when" };
  if (view.kind === "seqStep" && !("steps" in rule.action && rule.action.steps[view.index] !== undefined)) return { kind: "rule", ruleId: rule.id, section: "do" };
  return view;
}

/** The data-focus-key of the control that opened a view, so focus goes back there when the step closes. */
export function openerKey(view: RulesView): string | null {
  switch (view.kind) {
    case "list":
      return null;
    case "modes":
      return "modes";
    case "modeOptions":
      return "mode-options";
    case "rule":
      return `rule:${view.ruleId}`;
    case "condition":
      return `condition:${view.ruleId}:${view.index}`;
    case "seqStep":
      return `step:${view.ruleId}:${view.index}`;
    case "fallback":
      return "fallback";
  }
}

/** Moves focus to the control with this key after the next paint, when the screen has drawn it again. */
export function focusLater(key: string | null): void {
  if (key === null || typeof requestAnimationFrame === "undefined") return;
  requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-focus-key="${CSS.escape(key)}"]`)?.focus());
}
