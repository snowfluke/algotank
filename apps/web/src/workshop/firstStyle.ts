// The "Your first play style" checklist (docs/specs/revamp/65-guidance.md, section 4): the
// workshop tour's progress as five lines. Each line is done once the tour has passed the
// step named here, so the checklist cannot disagree with the tour, and it survives leaving
// and coming back because the tour's state is stored (guide/guideStore.ts).

import { stepOf, type TourState } from "../guide/tourMachine.ts";
import { tourSteps } from "../guide/tours.ts";
import type { StepKey } from "../guide/messages.ts";

export type ChecklistItem = "start" | "read" | "change" | "test" | "name";

export const CHECKLIST: readonly { readonly item: ChecklistItem; readonly after: StepKey }[] = [
  { item: "start", after: "workshopStart" },
  { item: "read", after: "workshopWhenDo" },
  { item: "change", after: "workshopChange" },
  { item: "test", after: "workshopRun" },
  { item: "name", after: "workshopName" },
];

/** Which lines are ticked, in order. A finished tour ticks them all. */
export function checklistTicks(state: TourState): readonly boolean[] {
  if (state.kind === "finished") return CHECKLIST.map(() => true);
  const at = stepOf(state) ?? 0;
  const steps = tourSteps("workshop");
  return CHECKLIST.map(({ after }) => at > steps.findIndex((step) => step.key === after));
}
