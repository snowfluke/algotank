// The arena conditions as a list of cards to choose from: the workshop's "Try an arena
// condition" step and the test match's round rules (owner, 2026-11-23: one list "like the
// catalogue", in place of a carousel whose buttons sat far below its one card on a laptop).
// A single condition shows its ground and the numbers a child compares at a glance; a
// mixed arena of the league shows the grounds of its areas and their names; "random"
// (the test match only) draws one for each match. Choosing a card calls `onChoose`.

import { CircleCheck, Crosshair, Dices, Droplet, Droplets } from "lucide-react";
import type { ReactNode } from "react";
import { areaRuleSetIds, isArenaLayoutId, ruleSet, type ArenaConditionId } from "@game/engine";
import { GroundIcon } from "../catalogue/catalogue.tsx";
import { useMessages } from "../i18n/I18nProvider.tsx";
import { conditionText } from "../monthly/ArenaCondition.tsx";
import { Pager } from "../ui/Pager.tsx";

/** A condition, or a new draw for each test match. */
export type ConditionChoice = ArenaConditionId | "random";

export interface ConditionChoicesProps {
  readonly label: string;
  readonly items: readonly ConditionChoice[];
  readonly value: ConditionChoice;
  /** The name and sentence of "random", when the list has it. */
  readonly random?: { readonly name: string; readonly note: string };
  onChoose(choice: ConditionChoice): void;
}

interface Chip {
  readonly key: string;
  readonly icon: ReactNode;
  readonly text: string;
}

export function ConditionChoices({ label, items, value, random, onChoose }: ConditionChoicesProps) {
  const m = useMessages();
  const w = m.workshop;
  const card = (choice: ConditionChoice): { readonly picture: ReactNode; readonly name: string; readonly chips: readonly Chip[]; readonly note: string | undefined } => {
    if (choice === "random") {
      if (random === undefined) throw new Error("A list with the random choice needs its words.");
      return { picture: <Dices aria-hidden size={28} strokeWidth={2.25} className="text-water" />, name: random.name, chips: [], note: random.note };
    }
    if (isArenaLayoutId(choice)) {
      const areas = areaRuleSetIds(choice);
      return {
        // One ground per area, two to a row, so the mixed arena reads as its parts.
        picture: (
          <span className="grid grid-cols-2 gap-0.5">
            {areas.map((area) => (
              <span key={area} className="flex h-4 w-5 items-center justify-center">
                <GroundIcon ruleSetId={area} />
              </span>
            ))}
          </span>
        ),
        name: conditionText(m, choice).name,
        chips: areas.map((area) => ({ key: area, icon: null, text: m.vocabulary.roundRules[area].name })),
        note: conditionText(m, choice).summary,
      };
    }
    const rules = ruleSet(choice);
    return {
      picture: <GroundIcon ruleSetId={choice} />,
      name: m.vocabulary.roundRules[choice].name,
      // The numbers from the engine's table; a note says what they cannot (conditionNotes).
      chips: [
        { key: "reach", icon: <Crosshair aria-hidden size={14} strokeWidth={2.5} />, text: w.conditionNumbers.reach(rules.baseRange) },
        { key: "carry", icon: <Droplets aria-hidden size={14} strokeWidth={2.5} />, text: w.conditionNumbers.carry(rules.waterCapacity) },
        { key: "cost", icon: <Droplet aria-hidden size={14} strokeWidth={2.5} />, text: w.conditionNumbers.cost(rules.waterPerThrow) },
      ],
      note: w.conditionNotes[choice],
    };
  };
  return (
    <Pager
      label={label}
      items={items}
      itemKey={(choice) => choice}
      ordered={false}
      renderItem={(choice) => {
        const chosen = choice === value;
        const { picture, name, chips, note } = card(choice);
        return (
          <button
            type="button"
            aria-pressed={chosen}
            data-round-rules={choice}
            onClick={() => onChoose(choice)}
            className={`press flex min-h-12 w-full min-w-0 items-center gap-3 rounded-[var(--radius-card)] border-2 border-b-4 px-3 py-1.5 text-left ${chosen ? "border-water bg-water-soft" : "border-line bg-panel [@media(hover:hover)]:hover:border-line-strong"}`}
          >
            <span className="flex h-8 w-11 shrink-0 items-center justify-center">{picture}</span>
            {/* One line on a laptop, a few on a phone. */}
            <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1">
              <span className="min-w-0 font-display text-lead font-semibold [overflow-wrap:anywhere]">{name}</span>
              {chips.length === 0 ? null : (
                <span className="flex min-w-0 flex-wrap gap-1.5">
                  {chips.map((chip) => (
                    <span key={chip.key} className={`inline-flex min-w-0 items-center gap-1 rounded-full px-2 py-px text-caption font-semibold text-ink ${chosen ? "bg-panel" : "bg-ground"}`}>
                      {chip.icon === null ? null : <span className="shrink-0 text-water">{chip.icon}</span>}
                      <span className="min-w-0 [overflow-wrap:anywhere]">{chip.text}</span>
                    </span>
                  ))}
                </span>
              )}
              {note === undefined ? null : <span className="min-w-0 text-caption text-muted [overflow-wrap:anywhere]">{note}</span>}
            </span>
            {chosen ? <CircleCheck aria-label={w.chosen} size={22} strokeWidth={2.5} className="shrink-0 text-water" /> : null}
          </button>
        );
      }}
    />
  );
}
