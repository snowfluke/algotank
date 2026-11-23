// The choices of a test match, as a step that replaces the test match pane. Every
// choice has a default, so the player can run a match without opening this. The
// round rules are a second step, the list of arena conditions the workshop uses
// (rules/ConditionChoices.tsx): the single conditions, the league's mixed arenas, and
// "random", which draws one for each match as the monthly arena does (owner, 2026-11-23).

import { useId, useState } from "react";
import { ARENA_LAYOUT_IDS, PRESETS, RULE_SET_IDS } from "@game/engine";
import type { RuleSetId } from "@game/engine";
import { conditionText } from "../monthly/ArenaCondition.tsx";
import { useMessages } from "../i18n/I18nProvider.tsx";
import { ConditionChoices, type ConditionChoice } from "../rules/ConditionChoices.tsx";
import { Button } from "../ui/Button.tsx";
import { Picker } from "../ui/Picker.tsx";
import { SegmentedControl } from "../ui/SegmentedControl.tsx";
import { StepSheet } from "../ui/StepSheet.tsx";
import { Stepper } from "../ui/Stepper.tsx";
import type { TestChoices } from "./testChoices.ts";
import {
  MATCH_LENGTH_IDS,
  OPPONENTS_MAX,
  OPPONENTS_MIN,
  type MatchLength,
  type OpponentMix,
} from "./run.ts";

/** The picker's value for "a mix of play styles". Every other value is a play style's id. */
const MIX_VALUE = "mix";

export interface TestOptionsProps {
  readonly choices: TestChoices;
  /** The rule set shown while the player has not picked one. */
  readonly defaultRuleSetId: RuleSetId;
  onChoices(next: TestChoices): void;
  /** Leaves the options; the choices are already kept. */
  onBack(): void;
}

/** A draw for each match first, then the single conditions, then the mixed arenas the league plays. */
const CONDITIONS: readonly ConditionChoice[] = ["random", ...RULE_SET_IDS, ...ARENA_LAYOUT_IDS];

/** The round rules as their own step: the list of arena conditions. Choosing one returns. */
export function TestRulesStep({ choices, defaultRuleSetId, onChoices, onBack }: TestOptionsProps) {
  const p = useMessages().practice;
  return (
    <StepSheet title={p.roundRules} onBack={onBack}>
      <ConditionChoices
        label={p.roundRules}
        items={CONDITIONS}
        value={choices.ruleSetId ?? defaultRuleSetId}
        random={p.random}
        onChoose={(ruleSetId) => {
          onChoices({ ...choices, ruleSetId });
          onBack();
        }}
      />
    </StepSheet>
  );
}

/** The choices themselves: the options step shows them, and a wide Try it pane beside its run button (Practice). */
export function TestOptionFields({ choices, defaultRuleSetId, onChoices, onOpenRules }: Omit<TestOptionsProps, "onBack"> & { onOpenRules(): void }) {
  const m = useMessages();
  const p = m.practice;
  const rulesLabelId = useId();
  const chosenRules = choices.ruleSetId ?? defaultRuleSetId;
  return (
    <div data-test-option-fields="" className="grid min-w-0 grid-cols-1 content-start gap-4 laptop:grid-cols-2 laptop:gap-x-8">
      <Stepper
        label={p.botCount}
        value={choices.opponents}
        min={OPPONENTS_MIN}
        max={OPPONENTS_MAX}
        onChange={(opponents) => onChoices({ ...choices, opponents })}
      />
      {/* Nine choices: more than a segmented row holds, so this one is a picker. */}
      <Picker
        label={p.botStyles}
        value={choices.mix.kind === "eachOnce" ? MIX_VALUE : choices.mix.presetId}
        data-picker="bot-styles"
        choices={[
          { value: MIX_VALUE, label: p.mixOfStyles },
          ...PRESETS.map((preset) => ({ value: preset.id, label: p.onlyStyle(m.vocabulary.playStyles[preset.id].name) })),
        ]}
        onChange={(value) => onChoices({ ...choices, mix: value === MIX_VALUE ? { kind: "eachOnce" } : { kind: "only", presetId: value } })}
      />
      <SegmentedControl
        legend={p.length}
        value={choices.length}
        onChange={(length) => onChoices({ ...choices, length })}
        options={MATCH_LENGTH_IDS.map((id) => ({ value: id, label: p.lengths[id] }))}
      />
      <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2">
        <span id={rulesLabelId} className="min-w-0 flex-1 font-semibold">
          {p.roundRules}
        </span>
        <Button variant="secondary" aria-describedby={rulesLabelId} data-test-rules="" onClick={onOpenRules}>
          {chosenRules === "random" ? p.random.name : conditionText(m, chosenRules).name}
        </Button>
      </div>
    </div>
  );
}

/** The options as a step over the pane, from a phone's Try it pane and from a match's result. */
export function TestOptions(props: TestOptionsProps) {
  const p = useMessages().practice;
  const [step, setStep] = useState<"options" | "rules">("options");
  if (step === "rules") return <TestRulesStep {...props} onBack={() => setStep("options")} />;
  return (
    // No Done button: every choice is kept as it is made, so Back is enough, and the step keeps its height for the choices.
    <StepSheet title={p.options} onBack={props.onBack}>
      <TestOptionFields {...props} onOpenRules={() => setStep("rules")} />
    </StepSheet>
  );
}
