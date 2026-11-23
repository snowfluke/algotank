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
import {
  MATCH_LENGTH_IDS,
  OPPONENTS_MAX,
  OPPONENTS_MIN,
  type MatchLength,
  type OpponentMix,
} from "./run.ts";

export interface TestChoices {
  readonly opponents: number;
  readonly mix: OpponentMix;
  readonly length: MatchLength;
  /**
   * A single condition, a mixed arena, or a draw for each match ("random"). Null until the player picks one, so the
   * choice follows the set announced for the next round.
   */
  readonly ruleSetId: ConditionChoice | null;
}

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

export function TestOptions({
  choices,
  defaultRuleSetId,
  onChoices,
  onBack,
}: TestOptionsProps) {
  const m = useMessages();
  const p = m.practice;
  const rulesLabelId = useId();
  const [step, setStep] = useState<"options" | "rules">("options");
  const chosenRules = choices.ruleSetId ?? defaultRuleSetId;
  if (step === "rules") {
    return (
      <StepSheet title={p.roundRules} onBack={() => setStep("options")}>
        <ConditionChoices
          label={p.roundRules}
          items={CONDITIONS}
          value={chosenRules}
          random={p.random}
          onChoose={(ruleSetId) => {
            onChoices({ ...choices, ruleSetId });
            setStep("options");
          }}
        />
      </StepSheet>
    );
  }

  return (
    // No Done button: every choice is kept as it is made, so Back is enough, and the step keeps its height for the choices.
    <StepSheet title={p.options} onBack={onBack}>
      <div className="grid min-w-0 grid-cols-1 content-start gap-4 laptop:grid-cols-2 laptop:gap-x-8">
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
          value={
            choices.mix.kind === "eachOnce" ? MIX_VALUE : choices.mix.presetId
          }
          data-picker="bot-styles"
          choices={[
            { value: MIX_VALUE, label: p.mixOfStyles },
            ...PRESETS.map((preset) => ({
              value: preset.id,
              label: p.onlyStyle(m.vocabulary.playStyles[preset.id].name),
            })),
          ]}
          onChange={(value) => {
            onChoices({
              ...choices,
              mix:
                value === MIX_VALUE
                  ? { kind: "eachOnce" }
                  : { kind: "only", presetId: value },
            });
          }}
        />
        <SegmentedControl
          legend={p.length}
          value={choices.length}
          onChange={(length) => onChoices({ ...choices, length })}
          options={MATCH_LENGTH_IDS.map((id) => ({
            value: id,
            label: p.lengths[id],
          }))}
        />
        <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2">
          <span id={rulesLabelId} className="min-w-0 flex-1 font-semibold">
            {p.roundRules}
          </span>
          <Button
            variant="secondary"
            aria-describedby={rulesLabelId}
            data-test-rules=""
            onClick={() => setStep("rules")}
          >
            {chosenRules === "random" ? p.random.name : conditionText(m, chosenRules).name}
          </Button>
        </div>
      </div>
    </StepSheet>
  );
}
