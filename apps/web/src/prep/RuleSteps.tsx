// The steps of the rules editor (a "step" here is a sheet of the editor, not a step of a
// rule's sequence, which StepsEditor.tsx edits), each a StepSheet that replaces the pane (or sits
// beside the list on a wide pane): one rule (When, Do, More options as three parts
// behind a switch), one condition of a rule, "If no rule fits", and the modes. A step
// edits one thing and fits the height it gets; a long list inside it is paged.

import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Copy, Flag, Pencil, Plus, Trash2 } from "lucide-react";
import { useRef } from "react";
import { LIMITS, isSequence } from "@game/engine";
import type { Rule } from "@game/engine";
import {
  addCondition,
  addMode,
  canAddCondition,
  canAddMode,
  canAddRule,
  canDeleteMode,
  canRemoveCondition,
  deleteMode,
  deleteRule,
  duplicateRule,
  moveModeToFirst,
  moveRule,
  removeCondition,
  renameMode,
  replaceRule,
  restoreRule,
  ruleIdAt,
  setChance,
  setCondition,
  setFallback,
  toOneAction,
  toSteps,
  canRemoveStep,
  moveStep,
  removeStep,
  stepsOf,
} from "../editor/edit.ts";
import { useLanguage, useMessages } from "../i18n/I18nProvider.tsx";
import { Button } from "../ui/Button.tsx";
import { TextInput } from "../ui/Field.tsx";
import { IconButton } from "../ui/IconButton.tsx";
import { Pager } from "../ui/Pager.tsx";
import { Picker } from "../ui/Picker.tsx";
import { StepSheet } from "../ui/StepSheet.tsx";
import { useToast } from "../ui/Toast.tsx";
import { useFitDetail } from "../ui/useFitDetail.ts";
import { conditionText, modeName, ruleText } from "../vocabulary/sentence.ts";
import { ModesDrawing } from "./ModesDrawing.tsx";
import { NumberField } from "./NumberField.tsx";
import { PaneSwitch } from "./PaneSwitch.tsx";
import { ActionEditor, ConditionEditor, Problems } from "./RuleParts.tsx";
import { StepChoices, StepsEditor } from "./StepsEditor.tsx";
import { placeIssues, problemsAt, type RulesEditorProps } from "./RulesList.tsx";
import { chosenMode, focusLater, openerKey, resolveView, type RuleSection, type RulesView } from "./rulesNav.ts";

/** The open step, or null when the list is shown. */
export function RulesStep(props: RulesEditorProps) {
  const view = resolveView(props.strategy, props.nav);
  switch (view.kind) {
    case "list":
      return null;
    case "modes":
      return <ModesStep {...props} />;
    case "modeOptions":
      return <ModeOptionsStep {...props} />;
    case "fallback":
      return <FallbackStep {...props} />;
    case "rule":
      return <RuleStep {...props} ruleId={view.ruleId} section={view.section} />;
    case "condition":
      return <ConditionStep {...props} ruleId={view.ruleId} index={view.index} />;
    case "seqStep":
      return <SeqStepSheet {...props} ruleId={view.ruleId} index={view.index} />;
  }
}

/** Goes to another view of the same mode; back to the list moves focus to the control that opened the step. */
function useGo(props: RulesEditorProps) {
  return (view: RulesView, from?: RulesView) => {
    props.onNav({ ...props.nav, view });
    if (from !== undefined) focusLater(openerKey(from));
  };
}

function RuleStep(props: RulesEditorProps & { readonly ruleId: string; readonly section: RuleSection }) {
  const m = useMessages();
  const [language] = useLanguage();
  const r = m.prep.rules;
  const toast = useToast();
  const go = useGo(props);
  // Undo runs seconds later and must restore into the strategy as it is then.
  const latest = useRef(props.strategy);
  latest.current = props.strategy;
  const chosen = chosenMode(props.strategy, props.nav.modeId);
  const index = chosen?.mode.rules.findIndex((rule) => rule.id === props.ruleId) ?? -1;
  const rule = chosen?.mode.rules[index];
  const sentence = rule === undefined ? "" : ruleText(m.vocabulary, rule, props.strategy.modes);
  const detail = useFitDetail<HTMLDivElement>(3, `${language}:${props.section}:${sentence}`);
  if (chosen === null || rule === undefined) return null;
  const { mode, index: modeIndex } = chosen;
  const number = index + 1;
  const self: RulesView = { kind: "rule", ruleId: rule.id, section: props.section };
  const problems = problemsAt(placeIssues(m.prep, props.issues), (p) => p.kind === "rule" && p.mode === modeIndex && p.rule === index);
  const change = (next: Rule) => props.onChange(replaceRule(props.strategy, mode.id, next));
  const close = () => go({ kind: "list" }, self);

  return (
    <StepSheet
      title={r.ruleNumber(number)}
      onBack={close}
      action={
        <>
          <Button onClick={close}>{r.done}</Button>
          <IconButton label={r.moveUp(number)} icon={<ArrowUp aria-hidden size={20} />} disabled={index === 0} onClick={() => props.onChange(moveRule(props.strategy, mode.id, rule.id, -1))} />
          <IconButton
            label={r.moveDown(number)}
            icon={<ArrowDown aria-hidden size={20} />}
            disabled={index === mode.rules.length - 1}
            onClick={() => props.onChange(moveRule(props.strategy, mode.id, rule.id, 1))}
          />
          <IconButton
            label={r.duplicate(number)}
            icon={<Copy aria-hidden size={20} />}
            disabled={!canAddRule(props.strategy, mode.id)}
            onClick={() => {
              const next = duplicateRule(props.strategy, mode.id, rule.id);
              const copyId = ruleIdAt(next, mode.id, index + 1);
              props.onChange(next);
              if (copyId !== undefined) go({ kind: "rule", ruleId: copyId, section: props.section });
            }}
          />
          <IconButton
            label={r.remove(number)}
            icon={<Trash2 aria-hidden size={20} />}
            onClick={() => {
              props.onChange(deleteRule(props.strategy, mode.id, rule.id));
              props.onNav({ ...props.nav, view: { kind: "list" } });
              focusLater("add-rule");
              toast.show({ message: r.ruleDeleted(number), onUndo: () => props.onChange(restoreRule(latest.current, mode.id, index, rule)) });
            }}
          />
        </>
      }
    >
      <Problems problems={problems} />
      <div ref={detail.ref} className="flex min-h-0 min-w-0 flex-1 flex-col gap-3 fit:overflow-hidden">
        {detail.level === 0 ? <p className="shrink-0 text-lead [overflow-wrap:anywhere]">{sentence}</p> : null}
        {/* data-coach: the workshop tour's steps about When and Do and about changing the rule (guide/tours.ts) point at
            the switch and the open part together, so a callout never covers a condition the child wants to tap. */}
        <div data-coach="rule-sections" className={`flex min-w-0 flex-col gap-3 ${props.section === "when" ? "min-h-0 flex-1" : "shrink-0"}`}>
        <div className="shrink-0">
          <PaneSwitch
            legend={r.sectionLegend}
            hook="rule-section"
            options={[
              { value: "when", label: r.when },
              { value: "do", label: r.do },
              { value: "more", label: r.more },
            ]}
            value={props.section}
            onChange={(section) => go({ ...self, section })}
          />
        </div>
        {props.section === "when" ? (
          <WhenPart {...props} rule={rule} number={number} change={change} />
        ) : props.section === "do" ? (
          <div className="flex min-w-0 flex-col gap-3">
            <PaneSwitch
              legend={r.doKindLegend}
              hook="rule-do-kind"
              options={[
                { value: "one", label: r.oneAction },
                { value: "steps", label: r.stepsInOrder },
              ]}
              value={isSequence(rule.action) ? "steps" : "one"}
              onChange={(kind) => change(kind === "steps" ? toSteps(rule) : toOneAction(rule))}
            />
            {detail.level === 0 && isSequence(rule.action) ? <p className="text-muted">{r.stepsHelp}</p> : null}
            {isSequence(rule.action) ? (
              <StepsEditor rule={rule} change={change} onOpen={(index) => go({ kind: "seqStep", ruleId: rule.id, index })} />
            ) : (
              <ActionEditor action={rule.action} onChange={(action) => change({ ...rule, action })} />
            )}
            {/* The water sentence is about shots, so steps without a shoot step leave it out. */}
            {detail.level === 0 && (!isSequence(rule.action) || rule.action.steps.some((step) => step.action === "throw")) ? <p className="text-muted">{r.water(props.rules)}</p> : null}
          </div>
        ) : (
          <MorePart {...props} rule={rule} change={change} brief={detail.level >= 2} />
        )}
        </div>
      </div>
    </StepSheet>
  );
}

function WhenPart(props: RulesEditorProps & { readonly rule: Rule; readonly number: number; change(next: Rule): void }) {
  const m = useMessages();
  const r = m.prep.rules;
  const go = useGo(props);
  const { rule } = props;
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2">
      {rule.conditions.length > 1 ? (
        <PaneSwitch
          legend={r.matchLegend}
          hook="rule-match"
          options={[
            { value: "all", label: r.matchAll },
            { value: "any", label: r.matchAny },
          ]}
          value={rule.match}
          onChange={(match) => props.change({ ...rule, match })}
        />
      ) : null}
      {/* At least one condition's height, so a long sentence above gives way first (useFitDetail). */}
      <div className="flex min-h-32 min-w-0 flex-1 flex-col">
      <Pager
        label={r.when}
        items={rule.conditions}
        itemKey={(_, i) => String(i)}
        renderItem={(condition, i) => (
          <button
            type="button"
            data-focus-key={`condition:${rule.id}:${i}`}
            onClick={() => go({ kind: "condition", ruleId: rule.id, index: i })}
            className="press flex min-h-12 w-full min-w-0 flex-col gap-0.5 rounded-[var(--radius-control)] border-2 border-b-4 border-line bg-panel px-3 py-2 text-left [@media(hover:hover)]:hover:border-line-strong"
          >
            {/* The condition's own sentence says "not" when the opposite is on, so the label is only its number. */}
            <span className="text-caption font-semibold text-muted">{r.condition(i + 1)}</span>
            <span className="min-w-0 [overflow-wrap:anywhere]">{conditionText(m.vocabulary, condition)}</span>
          </button>
        )}
      />
      </div>
      {/* A full rule shows why instead of a button that does nothing. */}
      {canAddCondition(rule) ? (
        <div className="shrink-0">
          <Button
            variant="quiet"
            icon={<Plus aria-hidden size={20} strokeWidth={2.5} />}
            onClick={() => {
              props.change(addCondition(rule));
              go({ kind: "condition", ruleId: rule.id, index: rule.conditions.length });
            }}
          >
            {r.addCondition}
          </Button>
        </div>
      ) : (
        <p className="shrink-0 text-caption text-muted">{r.conditionsFull(LIMITS.maxConditionsPerRule)}</p>
      )}
    </div>
  );
}

/** `brief` leaves out the help sentences when the step is short. */
function MorePart(props: RulesEditorProps & { readonly rule: Rule; readonly brief: boolean; change(next: Rule): void }) {
  const m = useMessages();
  const r = m.prep.rules;
  const { rule } = props;
  const modeId = chosenMode(props.strategy, props.nav.modeId)?.mode.id;
  const switchChoices = props.strategy.modes.filter((mode) => mode.id !== modeId || mode.id === rule.switchToMode);
  return (
    // Side by side when the step's column is wide enough (a container query on the step's own width).
    <div className="@container min-w-0">
    <div className="grid min-w-0 grid-cols-1 gap-4 @md:grid-cols-2">
      <div className="flex min-w-0 flex-col gap-1">
        <span className="font-semibold">{r.chance}</span>
        <NumberField label={r.chance} value={rule.chance} min={LIMITS.minChance} max={LIMITS.maxChance} onChange={(chance) => props.change(setChance(rule, chance))} />
        {props.brief ? null : <p className="text-caption text-muted">{r.chanceHelp}</p>}
      </div>
      {/* "Stay in this mode" and up to 5 other modes with names the player typed: too long for a segmented row. */}
      <Picker
        label={r.switchTo}
        {...(props.brief ? {} : { hint: r.switchHelp })}
        value={rule.switchToMode ?? ""}
        data-picker="switch-to"
        choices={[{ value: "", label: r.stay }, ...switchChoices.map((mode) => ({ value: mode.id, label: modeName(m.vocabulary, mode) }))]}
        onChange={(next) => props.change({ ...rule, switchToMode: next === "" ? null : next })}
      />
    </div>
    </div>
  );
}

function ConditionStep(props: RulesEditorProps & { readonly ruleId: string; readonly index: number }) {
  const m = useMessages();
  const r = m.prep.rules;
  const go = useGo(props);
  const chosen = chosenMode(props.strategy, props.nav.modeId);
  const ruleIndex = chosen?.mode.rules.findIndex((rule) => rule.id === props.ruleId) ?? -1;
  const rule = chosen?.mode.rules[ruleIndex];
  const condition = rule?.conditions[props.index];
  if (chosen === null || rule === undefined || condition === undefined) return null;
  const self: RulesView = { kind: "condition", ruleId: rule.id, index: props.index };
  const back = () => go({ kind: "rule", ruleId: rule.id, section: "when" }, self);
  const change = (next: Rule) => props.onChange(replaceRule(props.strategy, chosen.mode.id, next));
  return (
    <StepSheet
      title={r.conditionTitle(props.index + 1, ruleIndex + 1)}
      onBack={back}
      action={
        <>
          <Button onClick={back}>{r.done}</Button>
          {canRemoveCondition(rule) ? (
            <Button
              variant="secondary"
              icon={<Trash2 aria-hidden size={20} />}
              onClick={() => {
                change(removeCondition(rule, props.index));
                go({ kind: "rule", ruleId: rule.id, section: "when" });
              }}
            >
              {r.removeCondition(props.index + 1)}
            </Button>
          ) : null}
        </>
      }
    >
      {/* data-coach: the workshop tour's "change one thing" step points at the whole editor, and a callout never
          covers its target, so the picker and the number's minus and plus stay free to use. */}
      <div data-coach="condition-edit" className="flex min-w-0 shrink-0 flex-col gap-3">
        <ConditionEditor condition={condition} label={r.condition(props.index + 1)} onChange={(next) => change(setCondition(rule, props.index, next))} />
      </div>
      <div className="flex min-w-0 flex-col gap-1">
        <label className="flex min-h-11 cursor-pointer items-center gap-3">
          <input
            type="checkbox"
            className="size-5 shrink-0 accent-water"
            checked={condition.negate}
            onChange={(event) => change(setCondition(rule, props.index, { ...condition, negate: event.target.checked }))}
          />
          <span className="min-w-0">{r.negate(props.index + 1)}</span>
        </label>
        <p className="text-caption text-muted">{r.negateHelp}</p>
      </div>
    </StepSheet>
  );
}

/** One step of a rule's steps in order: its kind, its place and remove (StepsEditor.tsx). */
function SeqStepSheet(props: RulesEditorProps & { readonly ruleId: string; readonly index: number }) {
  const m = useMessages();
  const r = m.prep.rules;
  const go = useGo(props);
  const chosen = chosenMode(props.strategy, props.nav.modeId);
  const ruleIndex = chosen?.mode.rules.findIndex((rule) => rule.id === props.ruleId) ?? -1;
  const rule = chosen?.mode.rules[ruleIndex];
  if (chosen === null || rule === undefined) return null;
  const self: RulesView = { kind: "seqStep", ruleId: rule.id, index: props.index };
  const back = () => go({ kind: "rule", ruleId: rule.id, section: "do" }, self);
  const change = (next: Rule) => props.onChange(replaceRule(props.strategy, chosen.mode.id, next));
  return (
    <StepSheet
      title={r.stepTitle(props.index + 1, ruleIndex + 1)}
      onBack={back}
      action={
        <>
          <Button onClick={back}>{r.done}</Button>
          <IconButton
            label={r.stepEarlier(props.index + 1)}
            icon={<ArrowLeft aria-hidden size={20} />}
            disabled={props.index === 0}
            onClick={() => {
              change(moveStep(rule, props.index, -1));
              go({ kind: "seqStep", ruleId: rule.id, index: props.index - 1 });
            }}
          />
          <IconButton
            label={r.stepLater(props.index + 1)}
            icon={<ArrowRight aria-hidden size={20} />}
            disabled={props.index === (stepsOf(rule)?.length ?? 0) - 1}
            onClick={() => {
              change(moveStep(rule, props.index, 1));
              go({ kind: "seqStep", ruleId: rule.id, index: props.index + 1 });
            }}
          />
          {canRemoveStep(rule) ? (
            <IconButton
              label={r.removeStep(props.index + 1)}
              icon={<Trash2 aria-hidden size={20} />}
              data-step-remove=""
              onClick={() => {
                change(removeStep(rule, props.index));
                go({ kind: "rule", ruleId: rule.id, section: "do" });
              }}
            />
          ) : null}
        </>
      }
    >
      <StepChoices rule={rule} index={props.index} change={change} />
    </StepSheet>
  );
}

function FallbackStep(props: RulesEditorProps) {
  const m = useMessages();
  const r = m.prep.rules;
  const go = useGo(props);
  const chosen = chosenMode(props.strategy, props.nav.modeId);
  if (chosen === null) return null;
  const problems = problemsAt(placeIssues(m.prep, props.issues), (p) => p.kind === "fallback" && p.mode === chosen.index);
  const close = () => go({ kind: "list" }, { kind: "fallback" });
  return (
    <StepSheet title={r.fallbackTitle} onBack={close} action={<Button onClick={close}>{r.done}</Button>}>
      <Problems problems={problems} />
      <ActionEditor action={chosen.mode.fallback} onChange={(fallback) => props.onChange(setFallback(props.strategy, chosen.mode.id, fallback))} />
    </StepSheet>
  );
}

/** The modes as a paged list: a tap chooses the mode whose rules the list shows; the pencil opens its options. */
function ModesStep(props: RulesEditorProps) {
  const m = useMessages();
  const r = m.prep.rules;
  const go = useGo(props);
  const { strategy } = props;
  const chosen = chosenMode(strategy, props.nav.modeId);
  if (chosen === null) return null;
  const placed = placeIssues(m.prep, props.issues);
  const close = () => go({ kind: "list" }, { kind: "modes" });
  return (
    <StepSheet
      title={r.modesTitle}
      onBack={close}
      action={
        <>
          <Button onClick={close}>{r.done}</Button>
          <Button
            variant="secondary"
            icon={<Plus aria-hidden size={20} strokeWidth={2.5} />}
            disabled={!canAddMode(strategy)}
            onClick={() => {
              const next = addMode(strategy, r.newModeName);
              props.onChange(next);
              const added = next.modes.at(-1);
              if (added !== undefined) props.onNav({ modeId: added.id, view: { kind: "modeOptions" } });
            }}
          >
            {r.addMode}
          </Button>
        </>
      }
    >
      {/* The picture of what a mode is, beside its one sentence. It shows only where the window is at least 44em
          (704 px) tall, so on a short phone the list of modes keeps room for its rows.
          ponytail: a viewport query, not a measure of the step; measure the Pager's free height if it misjudges. */}
      <div className="flex min-w-0 shrink-0 flex-wrap items-center gap-x-4 gap-y-2">
        <div className="hidden h-20 w-40 max-w-full shrink-0 [@media(min-height:44em)]:block">
          <ModesDrawing />
        </div>
        <p className="min-w-0 flex-[1_1_14rem]">{r.modesIntro}</p>
      </div>
      {canAddMode(strategy) ? null : <p className="shrink-0 text-muted">{r.modesFull(LIMITS.maxModes)}</p>}
      <Pager
        label={r.pickMode}
        items={strategy.modes}
        itemKey={(candidate) => candidate.id}
        renderItem={(candidate, i) => {
          const current = candidate.id === chosen.mode.id;
          const problem = problemsAt(placed, (p) => "mode" in p && p.mode === i).length > 0;
          const name = modeLabel(r, m.vocabulary, candidate, i);
          return (
            <div className="flex min-w-0 items-center gap-2">
              <button
                type="button"
                aria-pressed={current}
                onClick={() => {
                  props.onNav({ modeId: candidate.id, view: { kind: "list" } });
                  focusLater("modes");
                }}
                className={`press flex min-h-12 min-w-0 flex-1 items-center gap-2 rounded-[var(--radius-control)] border-2 border-b-4 px-3 text-left ${current ? "border-water bg-water-soft" : problem ? "border-hit bg-panel" : "border-line bg-panel"}`}
              >
                {i === 0 ? <Flag aria-label={r.startsHere} size={18} strokeWidth={2.5} className="shrink-0 text-muted" /> : null}
                <span className="min-w-0 flex-1 truncate font-display font-semibold">{name}</span>
              </button>
              <IconButton
                label={r.modeOptions(name)}
                icon={<Pencil aria-hidden size={20} />}
                data-focus-key={`mode-options:${candidate.id}`}
                onClick={() => props.onNav({ modeId: candidate.id, view: { kind: "modeOptions" } })}
              />
            </div>
          );
        }}
      />
    </StepSheet>
  );
}

function modeLabel(r: { newModeName(n: number): string }, v: Parameters<typeof modeName>[0], mode: Parameters<typeof modeName>[1], i: number): string {
  // A name being typed can be empty for a moment; the list still needs words, and the field shows the problem.
  return mode.name.trim() === "" ? r.newModeName(i + 1) : modeName(v, mode);
}

/** The chosen mode's name, "start rounds here" and delete. */
function ModeOptionsStep(props: RulesEditorProps) {
  const m = useMessages();
  const r = m.prep.rules;
  const toast = useToast();
  const { strategy } = props;
  const chosen = chosenMode(strategy, props.nav.modeId);
  if (chosen === null) return null;
  const { mode, index } = chosen;
  const nameProblem = problemsAt(placeIssues(m.prep, props.issues), (p) => p.kind === "mode" && p.mode === index)[0] ?? null;
  const back = () => {
    props.onNav({ modeId: mode.id, view: { kind: "modes" } });
    focusLater(`mode-options:${mode.id}`);
  };

  function remove(): void {
    const before = strategy;
    const neighbour = strategy.modes[index + 1] ?? strategy.modes[index - 1];
    const shownName = modeLabel(r, m.vocabulary, mode, index);
    props.onChange(deleteMode(strategy, mode.id));
    props.onNav({ modeId: neighbour?.id ?? null, view: { kind: "modes" } });
    // ponytail: Undo puts back the whole strategy from before the delete, so an edit made in the
    // seconds before Undo is lost. Restore the mode and its incoming switches alone if that bites.
    toast.show({
      message: r.modeDeleted(shownName),
      onUndo: () => {
        props.onChange(before);
        props.onNav({ modeId: mode.id, view: { kind: "modes" } });
      },
    });
  }

  return (
    <StepSheet title={r.modeOptions(modeLabel(r, m.vocabulary, mode, index))} onBack={back} action={<Button onClick={back}>{r.done}</Button>}>
      <TextInput
        label={r.modeName}
        value={modeName(m.vocabulary, mode)}
        maxLength={LIMITS.maxNameLength}
        error={nameProblem}
        onChange={(event) => props.onChange(renameMode(strategy, mode.id, event.target.value))}
      />
      {index === 0 ? (
        <p className="flex items-center gap-2 font-semibold text-muted">
          <Flag aria-hidden size={18} strokeWidth={2.5} />
          {r.startsHere}
        </p>
      ) : (
        <div>
          <Button variant="secondary" icon={<Flag aria-hidden size={20} />} onClick={() => props.onChange(moveModeToFirst(strategy, mode.id))}>
            {r.makeStart}
          </Button>
        </div>
      )}
      {canDeleteMode(strategy) ? (
        <div>
          <Button variant="secondary" icon={<Trash2 aria-hidden size={20} />} onClick={remove}>
            {r.deleteMode}
          </Button>
        </div>
      ) : null}
    </StepSheet>
  );
}
