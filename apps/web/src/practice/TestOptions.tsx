// The choices of a test match, as a step that replaces the test match pane. Every
// choice has a default, so the player can run a match without opening this. The
// round rules are a second step (one rule set per page with its sentence), because
// six rule sets with their sentences do not fit beside the other choices on a phone.

import { useId, useState } from "react";
import { PRESETS, RULE_SET_IDS } from "@game/engine";
import type { RuleSetId } from "@game/engine";
import { useMessages } from "../i18n/I18nProvider.tsx";
import { Button } from "../ui/Button.tsx";
import { Carousel } from "../ui/Carousel.tsx";
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
  /** Null until the player picks a set, so the choice follows the set announced for the next round. */
  readonly ruleSetId: RuleSetId | null;
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
  const [rulesIndex, setRulesIndex] = useState(() =>
    Math.max(0, RULE_SET_IDS.indexOf(chosenRules)),
  );

  if (step === "rules") {
    return (
      <StepSheet title={p.roundRules} onBack={() => setStep("options")}>
        <Carousel
          label={p.roundRules}
          items={RULE_SET_IDS}
          itemKey={(id) => id}
          index={rulesIndex}
          onIndexChange={setRulesIndex}
          renderItem={(id) => {
            const chosen = id === chosenRules;
            return (
              <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3">
                <h3 className="text-title [overflow-wrap:anywhere]">
                  {m.vocabulary.roundRules[id].name}
                </h3>
                <p className="[overflow-wrap:anywhere]">
                  {m.vocabulary.roundRules[id].summary}
                </p>
                <Button
                  variant={chosen ? "secondary" : "primary"}
                  className="self-start"
                  aria-pressed={chosen}
                  onClick={() => onChoices({ ...choices, ruleSetId: id })}
                >
                  {chosen ? p.rulesChosen : p.useRules}
                </Button>
              </div>
            );
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
            {m.vocabulary.roundRules[chosenRules].name}
          </Button>
        </div>
      </div>
    </StepSheet>
  );
}
