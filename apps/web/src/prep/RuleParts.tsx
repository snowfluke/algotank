// The controls inside the rule steps: a problem list, a grouped picker for a condition
// or an action (groups first, then one group's choices), and the action and condition editors (the picker, then the sentence
// with a control where each parameter goes). Every change goes through editor/edit.ts.

import { CircleAlert } from "lucide-react";
import { ACTIONS } from "@game/engine";
import { ultimatesOn } from "@game/arena";
import type { ActionRef, ConditionRef, UltimateId } from "@game/engine";
import { actionOf, conditionOf } from "../editor/edit.ts";
import { useMessages } from "../i18n/I18nProvider.tsx";
import { Picker } from "../ui/Picker.tsx";
import { actionGroups, actionParts, conditionGroups, conditionParts, type PickGroup } from "../vocabulary/sentence.ts";
import { PhraseEditor } from "./PhraseEditor.tsx";

/** The problems of one part. `inline` draws them as spans, for use inside a button. */
export function Problems({ problems, inline = false }: { readonly problems: readonly string[]; readonly inline?: boolean }) {
  if (problems.length === 0) return null;
  const List = inline ? "span" : "ul";
  const Item = inline ? "span" : "li";
  return (
    <List className="m-0 flex shrink-0 list-none flex-col gap-1 p-0">
      {problems.map((problem) => (
        <Item key={problem} className="flex items-start gap-1.5 font-semibold text-hit [overflow-wrap:anywhere]">
          <CircleAlert aria-hidden size={18} strokeWidth={2.5} className="mt-0.5 shrink-0" />
          {problem}
        </Item>
      ))}
    </List>
  );
}

/** A picker of vocabulary entries under their group names: 30 conditions or 12 actions, so the group names come first. */
function VocabularyPicker<T extends string>(props: { readonly label: string; readonly groups: readonly PickGroup<T>[]; readonly value: string; readonly hook: string; onPick(id: T): void }) {
  const m = useMessages();
  return (
    <Picker
      label={props.label}
      value={props.value}
      placeholder={m.vocabulary.unknown}
      data-picker={props.hook}
      groups={props.groups.map((group) => ({ name: group.name, choices: group.items.map((item) => ({ value: item.id, label: item.name })) }))}
      onChange={props.onPick}
    />
  );
}

/** The action of a rule or of "If no rule fits": which action, then its sentence with controls. */
export function ActionEditor({ action, fallback, onChange }: { readonly action: ActionRef; readonly fallback?: true; onChange(next: ActionRef): void }) {
  const m = useMessages();
  const parts = actionParts(m.vocabulary, action.action);
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <VocabularyPicker label={m.prep.rules.action} hook="action" groups={actionGroups(m.vocabulary, fallback)} value={action.action} onPick={(id) => onChange(actionOf(id, action))} />
      {parts === null || ACTIONS[action.action]?.params.length === 0 ? null : (
        <PhraseEditor parts={parts} values={action.params} context={m.prep.rules.action} onChange={(params) => onChange({ ...action, params })} />
      )}
    </div>
  );
}

/** One condition: which condition, then its sentence with controls. `label` names it ("Condition 2"). */
export function ConditionEditor({ condition, label, ultimate, onChange }: { readonly condition: ConditionRef; readonly label: string; readonly ultimate: UltimateId; onChange(next: ConditionRef): void }) {
  const m = useMessages();
  const parts = conditionParts(m.vocabulary, condition.condition);
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <VocabularyPicker label={label} hook="condition" groups={conditionGroups(m.vocabulary, ultimate, ultimatesOn(Date.now()))} value={condition.condition} onPick={(id) => onChange(conditionOf(id, condition))} />
      {parts === null ? null : <PhraseEditor parts={parts} values={condition.params} context={label} onChange={(params) => onChange({ ...condition, params })} />}
    </div>
  );
}
