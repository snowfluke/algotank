// Where each problem from parseStrategy belongs on the screen, so the editor
// shows it next to the rule or field it is about and never as a raw path.

import type { StrategyIssue } from "@game/engine";

export type IssuePlace =
  | { readonly kind: "rule"; readonly mode: number; readonly rule: number }
  | { readonly kind: "fallback"; readonly mode: number }
  | { readonly kind: "mode"; readonly mode: number }
  | { readonly kind: "upgrades" }
  | { readonly kind: "strategy" };

export function issuePlace(issue: StrategyIssue): IssuePlace {
  const [first, mode, part, rule] = issue.path;
  if (first === "build") return { kind: "upgrades" };
  if (first !== "modes" || typeof mode !== "number") return { kind: "strategy" };
  if (part === "rules" && typeof rule === "number") return { kind: "rule", mode, rule };
  if (part === "fallback") return { kind: "fallback", mode };
  return { kind: "mode", mode };
}
