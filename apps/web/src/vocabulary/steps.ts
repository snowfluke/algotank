// The steps of a rule's sequence as the player sees them: one kind per block, each a
// short label and an icon. A kind is one atomic action with fixed parameters, so the
// editor offers kinds and stores the engine's ActionRef (packages/engine/src/strategy/sequence.ts).

import type { ActionRef } from "@game/engine";

/** The kinds the step editor offers, in its order: the slight turns face a diagonal. */
export const STEP_KINDS = ["forward", "left", "right", "slightLeft", "slightRight", "shoot", "wait"] as const;
export type StepKind = (typeof STEP_KINDS)[number];

const REF_OF: Readonly<Record<StepKind, ActionRef>> = {
  forward: { action: "stepForward", params: {} },
  left: { action: "turn", params: { way: "left" } },
  right: { action: "turn", params: { way: "right" } },
  slightLeft: { action: "turn", params: { way: "slightLeft" } },
  slightRight: { action: "turn", params: { way: "slightRight" } },
  shoot: { action: "throw", params: {} },
  wait: { action: "wait", params: {} },
};

/** The step a kind stands for, as the strategy stores it. */
export function stepRefOf(kind: StepKind): ActionRef {
  return REF_OF[kind];
}

/** The kind of a stored step, or null for an action this version cannot show as a step. */
export function stepKindOf(ref: ActionRef): StepKind | null {
  switch (ref.action) {
    case "stepForward":
      return "forward";
    case "throw":
      return "shoot";
    case "wait":
      return "wait";
    case "turn": {
      const way = ref.params["way"];
      return way === "left" || way === "right" || way === "slightLeft" || way === "slightRight" ? way : null;
    }
    default:
      return null;
  }
}
