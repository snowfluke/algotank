// Steps in order (76-email-and-sequences.md, S3), edited with taps only, no drag.
// StepsEditor is the rule's "Do" part: the steps as the same row of blocks the rule card
// draws, and "Add a step". A tap on a block opens that step's own sheet (StepChoices, shown
// by RuleSteps.tsx like a condition's sheet): large buttons set its kind, and the sheet's action
// bar moves it earlier or later or removes it. The sheet keeps the Do part short enough for a 360 x 640 phone.
// Every change goes through editor/edit.ts.

import { Plus } from "lucide-react";
import { LIMITS } from "@game/engine";
import type { Rule } from "@game/engine";
import { addStep, canAddStep, setStep, stepsOf } from "../editor/edit.ts";
import { useMessages } from "../i18n/I18nProvider.tsx";
import { Button } from "../ui/Button.tsx";
import { stepBlocks } from "../vocabulary/sentence.ts";
import { STEP_KINDS, stepKindOf, stepRefOf } from "../vocabulary/steps.ts";
import { STEP_ICONS } from "./actionIcons.ts";
import { StepRow } from "./StepRow.tsx";

/** The data-focus-key of a step block, so focus returns to it when its sheet closes (rulesNav.ts openerKey). */
const stepFocusKey = (ruleId: string, index: number) => `step:${ruleId}:${index}`;

export function StepsEditor({ rule, change, onOpen }: { readonly rule: Rule; change(next: Rule): void; onOpen(index: number): void }) {
  const m = useMessages();
  const r = m.prep.rules;
  const steps = stepsOf(rule);
  if (steps === null) return null;
  return (
    <div className="flex min-w-0 flex-col gap-2" data-steps-editor="">
      <div className="flex min-w-0 flex-wrap items-center gap-x-1 gap-y-1.5">
        <StepRow
          steps={stepBlocks(m.vocabulary, steps)}
          layout="row"
          onPick={onOpen}
          blockLabel={(i, name) => r.stepBlock(i + 1, name)}
          focusKey={(i) => stepFocusKey(rule.id, i)}
        />
        {canAddStep(rule) ? (
          <Button
            variant="quiet"
            icon={<Plus aria-hidden size={20} strokeWidth={2.5} />}
            data-step-add=""
            onClick={() => {
              change(addStep(rule));
              onOpen(steps.length);
            }}
          >
            {r.addStep}
          </Button>
        ) : null}
      </div>
      {canAddStep(rule) ? null : <p className="text-caption text-muted">{r.stepsFull(LIMITS.maxStepsPerSequence)}</p>}
    </div>
  );
}

/** One step's sheet: the row with this step chosen, and its kind as large buttons. Earlier, later and remove sit in the sheet's action bar (RuleSteps.tsx), so the sheet fits a 360 x 640 phone. */
export function StepChoices({ rule, index, change }: { readonly rule: Rule; readonly index: number; change(next: Rule): void }) {
  const m = useMessages();
  const r = m.prep.rules;
  const steps = stepsOf(rule);
  const step = steps?.[index];
  if (steps === null || step === undefined) return null;
  const kind = stepKindOf(step);
  const n = index + 1;
  return (
    <div className="flex min-w-0 flex-col gap-3" data-step-choices="">
      <StepRow steps={stepBlocks(m.vocabulary, steps)} layout="row" chosen={index} />
      <fieldset className="m-0 flex min-w-0 flex-col border-0 p-0">
        <legend className="mb-1.5 p-0 font-display font-semibold">{r.step(n)}</legend>
        <div className="flex min-w-0 flex-wrap gap-1.5">
          {STEP_KINDS.map((option) => {
            const Icon = STEP_ICONS[option];
            const on = option === kind;
            return (
              <button
                key={option}
                type="button"
                aria-pressed={on}
                data-step-kind={option}
                onClick={() => change(setStep(rule, index, stepRefOf(option)))}
                className={`press flex min-h-11 min-w-11 items-center gap-1.5 rounded-[var(--radius-control)] border-2 border-b-4 px-3 font-display font-semibold ${on ? "border-ok bg-ok-soft text-ink" : "border-line bg-panel text-ink [@media(hover:hover)]:hover:border-line-strong"}`}
              >
                <Icon aria-hidden size={20} strokeWidth={2.5} className="shrink-0 text-ok" />
                <span className="min-w-0 [overflow-wrap:anywhere]">{m.vocabulary.steps[option].name}</span>
              </button>
            );
          })}
        </div>
      </fieldset>
    </div>
  );
}
