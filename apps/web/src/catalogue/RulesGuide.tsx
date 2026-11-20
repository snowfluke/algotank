// The catalogue's rules guide (owner, 2026-11-20: "a catalogue for rules ... so user can easily learn what's possible
// first without opening the workshop and guessing on each dropdown"). It lists, in the rules editor's own words and
// order, every condition (Kalau), every action (Lakukan), every tank a rule can aim at (Sasaran) and the other options
// of a rule (Opsi lainnya). Each condition and action shows a sentence with the editor's starting values and, for each
// dropdown, all its choices. Everything is read from the engine's tables and the vocabulary the editor uses
// (vocabulary/sentence.ts, prep/PhraseEditor.tsx), so a new condition or choice shows here without an edit.

import { ACTIONS, CONDITIONS, LIMITS, TARGET_IDS, type ParamSpec } from "@game/engine";
import { BrickWall, Gift, Target, Timer, User, Users, Zap, type LucideIcon } from "lucide-react";
import { actionOf, conditionOf } from "../editor/edit.ts";
import { useMessages } from "../i18n/I18nProvider.tsx";
import { ACTION_ICONS } from "../prep/actionIcons.ts";
import { paramName } from "../prep/PhraseEditor.tsx";
import { Pager } from "../ui/Pager.tsx";
import { SegmentedControl } from "../ui/SegmentedControl.tsx";
import type { ConditionGroupId } from "../vocabulary/ids.ts";
import { actionGroups, actionText, conditionGroups, conditionText, optionText } from "../vocabulary/sentence.ts";

/** The parts of the guide: the rules editor's three tabs, with the tanks a rule can aim at between them. */
export const GUIDE_PARTS = ["when", "do", "targets", "more"] as const;
export type GuidePart = (typeof GUIDE_PARTS)[number];

type Messages = ReturnType<typeof useMessages>;

/** One dropdown of a condition or an action: the editor's question and every answer it offers. */
interface GuideChoice {
  readonly question: string;
  readonly answers: string;
}

/** A group's heading, drawn above the group's first row: one item with it, so a page never ends on a lone heading. */
interface GuideHeading {
  readonly name: string;
  readonly icon: LucideIcon | null;
}

export interface GuideItem {
  readonly key: string;
  readonly heading: GuideHeading | null;
  readonly name: string;
  /** An example sentence or what the option does; null when it would only repeat the name ("Shoot", "Shoot"). */
  readonly sentence: string | null;
  readonly choices: readonly GuideChoice[];
  readonly icon: LucideIcon | null;
}

/** A picture for each heading of the condition picker, so a child finds a group before reading it. */
const CONDITION_GROUP_ICONS: Readonly<Record<ConditionGroupId, LucideIcon>> = {
  otherTanks: Users,
  oneTank: Target,
  me: User,
  walls: BrickWall,
  round: Timer,
  items: Gift,
  ultimate: Zap,
};

function choicesOf(m: Messages, params: readonly ParamSpec[]): GuideChoice[] {
  const r = m.prep.rules;
  const g = m.catalogue.rulesGuide;
  return params.map((spec): GuideChoice => {
    const question = r.paramQuestions[paramName(spec)];
    switch (spec.kind) {
      case "target":
        return { question, answers: g.pickTarget };
      case "choice":
        return { question, answers: spec.options.map((option) => optionText(m.vocabulary, spec, option.value)).join(" · ") };
      case "int":
        return { question, answers: spec.options === undefined ? g.range(spec.min, spec.max) : spec.options.join(" · ") };
    }
  });
}

const capital = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/** The sentence, or null when it says no more than the name. */
const unlessName = (name: string, sentence: string) => (sentence.toLowerCase() === name.toLowerCase() ? null : sentence);

/** The rows of the groups, the first row of each carrying its heading. */
function grouped(groups: readonly { readonly heading: GuideHeading; readonly rows: readonly Omit<GuideItem, "heading">[] }[]): GuideItem[] {
  return groups.flatMap(({ heading, rows }) => rows.map((row, index) => ({ ...row, heading: index === 0 ? heading : null })));
}

/** The rows of one part, headings included, in the order the rules editor offers them. */
export function guideItems(m: Messages, part: GuidePart, hybridOn: boolean): GuideItem[] {
  const v = m.vocabulary;
  const r = m.prep.rules;
  const g = m.catalogue.rulesGuide;
  switch (part) {
    case "when": {
      const groupIds = Object.keys(v.conditionGroups) as ConditionGroupId[];
      return grouped(
        conditionGroups(v, null, hybridOn).map((group) => {
          const groupId = groupIds.find((id) => v.conditionGroups[id] === group.name);
          return {
            heading: { name: group.name, icon: groupId === undefined ? null : CONDITION_GROUP_ICONS[groupId] },
            rows: group.items.map((item) => ({
              key: item.id,
              name: item.name,
              sentence: `${v.rule.when} ${conditionText(v, conditionOf(item.id))}`,
              choices: choicesOf(m, CONDITIONS[item.id]?.params ?? []),
              icon: null,
            })),
          };
        }),
      );
    }
    case "do":
      return grouped(
        actionGroups(v, hybridOn).map((group) => ({
          heading: { name: group.name, icon: null },
          rows: group.items.map((item) => ({
            key: item.id,
            name: item.name,
            sentence: unlessName(item.name, capital(actionText(v, actionOf(item.id)))),
            choices: choicesOf(m, ACTIONS[item.id]?.params ?? []),
            icon: ACTION_ICONS[item.id],
          })),
        })),
      );
    case "targets":
      // Each tank in a sentence the child knows from the editor: "Move toward the nearest tank".
      return TARGET_IDS.map((id): GuideItem => ({
        key: id,
        heading: null,
        name: capital(v.targets[id]),
        sentence: capital(actionText(v, { action: "moveToward", params: { target: id } })),
        choices: [],
        icon: null,
      }));
    case "more": {
      const row = (key: string, name: string, sentence: string): GuideItem => ({ key, heading: null, name, sentence, choices: [], icon: null });
      return [
        row("match", r.matchLegend, g.match),
        row("negate", g.negateName, r.negateHelp),
        row("steps", r.stepsInOrder, r.stepsHelp),
        row("chance", r.chance, r.chanceHelp),
        row("switch", r.switchTo, r.switchHelp),
        row("modes", r.modesTitle, g.modes(LIMITS.maxModes)),
        row("fallback", r.fallbackTitle, g.fallback),
      ];
    }
  }
}

/** The guide: a switch of its parts and the chosen part's rows, a page at a time like every list of the game. */
export function RulesGuide({ part, onPart, hybridOn }: { readonly part: GuidePart; onPart(next: GuidePart): void; readonly hybridOn: boolean }) {
  const m = useMessages();
  const r = m.prep.rules;
  const g = m.catalogue.rulesGuide;
  const labels: Readonly<Record<GuidePart, string>> = { when: r.when, do: r.do, targets: g.targets, more: r.more };
  const items = guideItems(m, part, hybridOn);
  return (
    <div data-rules-guide={part} className="flex min-h-0 min-w-0 flex-1 flex-col gap-3">
      <div className="shrink-0">
        <SegmentedControl
          legend={g.partsLabel}
          hideLegend
          value={part}
          onChange={onPart}
          options={GUIDE_PARTS.map((value) => ({ value, label: labels[value], ...(value === "more" ? { shortLabel: g.moreShort } : {}) }))}
        />
      </div>
      <Pager
        key={part}
        label={labels[part]}
        items={items}
        itemKey={(item) => item.key}
        ordered={false}
        renderItem={(item) => (
          <div className="flex min-w-0 flex-col gap-1.5">
            {item.heading === null ? null : <GroupHeading heading={item.heading} />}
            <Entry item={item} />
          </div>
        )}
      />
    </div>
  );
}

function GroupHeading({ heading }: { readonly heading: GuideHeading }) {
  const Icon = heading.icon;
  return (
    <h3 className="flex min-w-0 items-center gap-2 pt-1 font-display text-lead font-semibold text-water-deep">
      {Icon === null ? null : <Icon aria-hidden size={20} strokeWidth={2.5} className="shrink-0" />}
      <span className="min-w-0 [overflow-wrap:anywhere]">{heading.name}</span>
    </h3>
  );
}

function Entry({ item }: { readonly item: GuideItem }) {
  const Icon = item.icon;
  return (
    <div data-rules-guide-entry={item.key} className="@container flex min-w-0 items-start gap-3 rounded-[var(--radius-card)] bg-panel px-3 py-2">
      {Icon === null ? null : (
        <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-water-soft text-water-deep">
          <Icon aria-hidden size={18} strokeWidth={2.5} />
        </span>
      )}
      {/* Name beside the sentence when the row is wide, so a laptop page holds about twice the rows. */}
      <div className="grid min-w-0 flex-1 grid-cols-1 gap-x-4 gap-y-0.5 @2xl:grid-cols-[minmax(0,15rem)_minmax(0,1fr)]">
        <span className="font-display font-semibold [overflow-wrap:anywhere]">{item.name}</span>
        <span className="flex min-w-0 flex-col gap-0.5">
          {item.sentence === null ? null : <span className="text-muted [overflow-wrap:anywhere]">{item.sentence}</span>}
          {item.choices.map((choice) => (
            <span key={choice.question} className="text-caption [overflow-wrap:anywhere]">
              <span className="font-semibold">{choice.question}</span> {choice.answers}
            </span>
          ))}
        </span>
      </div>
    </div>
  );
}
