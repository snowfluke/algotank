// Under the replay's board, for a strategy with steps in order (76-email-and-sequences.md,
// S3): on a turn of a sequence, which rule runs which step, with that rule's step row and
// the running step filled in; on any other turn, that the tank is checking its rules. It
// keeps the height of its tallest case, so the board does not jump between turns.

import { isSequence } from "@game/engine";
import type { Rule, StrategyInput } from "@game/engine";
import { useMessages } from "../i18n/I18nProvider.tsx";
import { StepRow } from "../prep/StepRow.tsx";
import { stepBlocks } from "../vocabulary/sentence.ts";
import { PLAYER_ID, type PracticeRun } from "./run.ts";

/** The rules of the strategy that have steps, with their numbers in their mode. */
function sequenceRules(strategy: StrategyInput): Rule[] {
  return strategy.modes.flatMap((mode) => mode.rules.filter((rule) => isSequence(rule.action)));
}

export function SequenceNow({ run, frame }: { readonly run: PracticeRun; readonly frame: number }) {
  const m = useMessages();
  const p = m.practice;
  const v = m.vocabulary;
  const withSteps = sequenceRules(run.strategy);
  const longest = withSteps.reduce<Rule | null>((best, rule) => (best === null || stepCount(rule) > stepCount(best) ? rule : best), null);
  if (longest === null || !isSequence(longest.action)) return null;

  const decision = frame === 0 ? undefined : run.ticks[frame - 1]?.decisions.find((d) => d.botId === PLAYER_ID);
  const mode = run.strategy.modes.find((candidate) => candidate.id === decision?.modeId);
  const ruleIndex = mode === undefined || decision?.ruleId == null ? -1 : mode.rules.findIndex((rule) => rule.id === decision.ruleId);
  const rule = mode?.rules[ruleIndex];
  const step = decision?.step;
  const running = step !== undefined && rule !== undefined && isSequence(rule.action) ? { rule: rule.action, number: ruleIndex + 1, step } : null;

  return (
    // Both cases sit in one grid cell over a hidden copy of the tallest one, so the strip keeps its height.
    <div className="grid min-w-0 shrink-0" data-sequence-now="">
      <div aria-hidden="true" className="invisible col-start-1 row-start-1 flex min-w-0 flex-col gap-1">
        <p className="text-caption font-semibold">{p.runningStep(9, 4, 4)}</p>
        <StepRow steps={stepBlocks(v, longest.action.steps)} layout="row" />
      </div>
      <div className="col-start-1 row-start-1 flex min-w-0 flex-col gap-1">
        {running === null ? (
          <p className="text-caption font-semibold text-muted">{p.readingRules}</p>
        ) : (
          <>
            <p className="text-caption font-semibold">{p.runningStep(running.number, running.step.index, running.step.count)}</p>
            <StepRow steps={stepBlocks(v, running.rule.steps)} layout="row" current={running.step.index - 1} />
          </>
        )}
      </div>
    </div>
  );
}

function stepCount(rule: Rule): number {
  return isSequence(rule.action) ? rule.action.steps.length : 1;
}
