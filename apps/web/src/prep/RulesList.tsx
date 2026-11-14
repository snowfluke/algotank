// The rules of the chosen mode as a picture of an algorithm (71-workshop-appeal.md, C2
// and C3). Each rule is a card of blocks: "When", one blue block per condition with
// "and" or "or" between them, an arrow, and one green block for the action with its
// icon, or, for steps in order, a row of green step blocks joined by green arrows
// (StepRow.tsx, S3); a chip names the mode it switches to and the chance. The rule numbers sit on one
// line with arrowheads that runs from the first rule down into "If no rule fits", so the
// order of checking is drawn. A tank with two or more modes gets a strip of mode chips
// above the list; the chosen chip opens into the list like a tab, and arrows between
// chips show where a rule can switch the tank. Tapping a card opens its step
// (RuleSteps.tsx). Problems from parseStrategy show on the rule they belong to;
// problems in another mode are named above the list.

import { ArrowRight, CornerDownRight, Dices, Flag, Pencil, Plus } from "lucide-react";
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { ACTION_IDS, LIMITS } from "@game/engine";
import type { ActionId, ActionRef, Mode, RoundRules, Rule, StrategyInput, StrategyIssue } from "@game/engine";
import { addRule, canAddRule, ruleIdAt } from "../editor/edit.ts";
import { useLanguage, useMessages } from "../i18n/I18nProvider.tsx";
import { Button } from "../ui/Button.tsx";
import { IconButton } from "../ui/IconButton.tsx";
import { Pager } from "../ui/Pager.tsx";
import { StatusBanner } from "../ui/StatusBanner.tsx";
import { useBoxSize } from "../ui/useBoxSize.ts";
import { isOneOf } from "../vocabulary/ids.ts";
import type { VocabularyText } from "../vocabulary/messages.ts";
import { actionText, amountText, fallbackText, modeName, ruleBriefText, ruleParts } from "../vocabulary/sentence.ts";
import { ACTION_ICONS } from "./actionIcons.ts";
import { issuePlace, type IssuePlace } from "./issues.ts";
import { issueSentence, type PrepText } from "./messages.ts";
import { MAX_MODES_WITH_ARROWS, neighbourLinks, type NeighbourLink } from "./modes.ts";
import { Problems } from "./RuleParts.tsx";
import { StepRow } from "./StepRow.tsx";
import { chosenMode, type RulesNav } from "./rulesNav.ts";

/** The sentence about how rules work shows only with this much height, so the rules keep the room. */
const INTRO_MIN_HEIGHT_PX = 460;
/** The sentence that says where the tank starts shows only with this much height. */
const STARTS_MIN_HEIGHT_PX = 400;

export interface PlacedIssue {
  readonly place: IssuePlace;
  readonly sentence: string;
}

export function placeIssues(text: PrepText, issues: readonly StrategyIssue[]): PlacedIssue[] {
  return issues.map((issue) => ({ place: issuePlace(issue), sentence: issueSentence(text, issue) }));
}

export function problemsAt(placed: readonly PlacedIssue[], test: (place: IssuePlace) => boolean): string[] {
  return placed.filter((p) => test(p.place)).map((p) => p.sentence);
}

export interface RulesEditorProps {
  readonly strategy: StrategyInput;
  readonly issues: readonly StrategyIssue[];
  /** The rules of the coming round for the water sentence, or null when they are secret. */
  readonly rules: RoundRules | null;
  readonly nav: RulesNav;
  onNav(next: RulesNav): void;
  onChange(next: StrategyInput): void;
  /** A control the host adds at the end of the list's top row (the arena's "Save as my play style"). */
  readonly actions?: ReactNode;
}

type Item =
  | { readonly kind: "rule"; readonly rule: Rule; readonly index: number }
  /** The slot where a new rule will appear: after the last rule, before "If no rule fits". */
  | { readonly kind: "add" }
  | { readonly kind: "fallback" };

const CARD = "press flex w-full min-w-0 flex-col gap-1 rounded-[var(--radius-card)] border-2 border-b-4 bg-panel px-2 py-1 text-left [@media(hover:hover)]:hover:border-line-strong";
// A card's words. On a narrow list they stack, one block per line: "When" and the first
// condition, each further condition, then the arrow and the action, then the chips. From
// 32rem they flow as one sentence. A block is always one box: it moves to the next line
// whole, and a block wider than the card wraps its text inside itself.
const FLOW = "flex min-w-0 flex-col items-start gap-0.5 text-caption leading-snug @lg/rules:block @lg/rules:text-body @lg/rules:leading-[2.15]";
const LINE = "max-w-full @lg/rules:inline";
const WORD = "font-display font-semibold text-muted";
const BLOCK = "inline-block max-w-full rounded-[0.5rem] border-2 px-1.5 py-px align-middle leading-snug [overflow-wrap:anywhere]";
/** A condition: the test the tank makes. Blue, the colour of a question the tank asks the arena. */
const CONDITION_BLOCK = `${BLOCK} border-water-light bg-water-soft`;
/** The action: what the tank does. Green, so a test and a deed never look alike. */
const ACTION_BLOCK = `${BLOCK} border-ok bg-ok-soft font-semibold`;
const CHIP = "inline-flex max-w-full items-center gap-1 rounded-full border-2 px-2 align-middle text-caption leading-tight font-semibold";
const INLINE_ICON = "inline-block shrink-0 align-[-0.2em]";

/** The left column of a list item: the rule's number on the order line, and the line down to the next item. */
function OrderMark({ mark, last }: { readonly mark: number | "add" | "fallback"; readonly last: boolean }) {
  return (
    <span aria-hidden="true" className="flex min-h-full flex-col items-center">
      {mark === "fallback" ? (
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full border-2 border-water-light bg-panel text-water">
          <CornerDownRight size={18} strokeWidth={2.5} />
        </span>
      ) : mark === "add" ? (
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full border-2 border-dashed border-water-light bg-panel text-water">
          <Plus size={18} strokeWidth={2.5} />
        </span>
      ) : (
        <span className="tabular flex size-8 shrink-0 items-center justify-center rounded-full bg-water font-display font-semibold text-water-ink">{mark + 1}</span>
      )}
      {last ? null : (
        <>
          <span className="w-1 flex-1 rounded-full bg-water-light" />
          <svg viewBox="0 0 12 7" width={12} height={7} className="block shrink-0">
            <path d="M0 0 L6 7 L12 0 Z" style={{ fill: "var(--color-water-light)" }} />
          </svg>
        </>
      )}
    </span>
  );
}

/** The arrow of a mode switch: drawn the same between the strip's chips and in a rule's "to mode" chip, so the eye links them. */
function SwitchArrow({ size }: { readonly size: number }) {
  return (
    <svg viewBox="0 0 22 14" width={size * 1.5} height={size} aria-hidden="true" className="inline-block shrink-0" fill="none" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" style={{ stroke: "var(--color-water)" }}>
      <path d="M2 7 H19 M15 3 L19 7 L15 11" />
    </svg>
  );
}

function OneActionBlock({ id, text }: { readonly id: ActionId | null; readonly text: string }) {
  const Icon = id === null ? null : ACTION_ICONS[id];
  return (
    <span className={ACTION_BLOCK}>
      {Icon === null ? null : <Icon size={17} strokeWidth={2.5} className={`${INLINE_ICON} mr-1 text-ok`} />}
      {text}
    </span>
  );
}

function ActionBlock({ v, action }: { readonly v: VocabularyText; readonly action: ActionRef }) {
  return <OneActionBlock id={isOneOf(ACTION_IDS, action.action) ? action.action : null} text={actionText(v, action)} />;
}

function RuleBlocks({ v, rule, modes }: { readonly v: VocabularyText; readonly rule: Rule; readonly modes: readonly Mode[] }) {
  const m = useMessages();
  const parts = ruleParts(v, rule, modes);
  const last = parts.conditions.length - 1;
  return (
    <span aria-hidden="true" className={FLOW}>
      {parts.conditions.map((condition, i) => (
        // The blocks are the rule's own conditions, so their position is a stable key while the card shows.
        <span key={i} className={LINE}>
          {i === 0 ? <span className={WORD}>{`${v.rule.when} `}</span> : null}
          <span className={CONDITION_BLOCK}>{condition}</span>
          {i < last ? <span className={WORD}>{` ${parts.joiner} `}</span> : null}{" "}
        </span>
      ))}
      <span className={LINE}>
        <ArrowRight size={18} strokeWidth={2.75} className={`${INLINE_ICON} mr-1 text-muted`} />
        {parts.action.kind === "steps" ? <StepRow steps={parts.action.steps} layout="inline" /> : <OneActionBlock id={parts.action.id} text={parts.action.text} />}{" "}
      </span>
      {parts.switchTo === null && parts.chance === null ? null : (
        <span className={`${LINE} flex flex-wrap gap-1 @lg/rules:inline`}>
          {parts.switchTo === null ? null : (
            <span className={`${CHIP} border-water bg-water-soft text-ink`}>
              <SwitchArrow size={12} />
              <span className="min-w-0 [overflow-wrap:anywhere]">{m.prep.rules.toMode(parts.switchTo)}</span>
            </span>
          )}{" "}
          {parts.chance === null ? null : (
            <span className={`${CHIP} border-line bg-ground`}>
              <Dices size={15} strokeWidth={2.5} className="shrink-0" />
              {amountText(parts.chance, v.units.percent)}
            </span>
          )}
        </span>
      )}
    </span>
  );
}

/** The arrow between two neighbouring mode chips: which way a rule can switch the tank. */
function LinkArrow({ link }: { readonly link: NeighbourLink }) {
  return (
    <svg viewBox="0 0 26 18" width={26} height={18} aria-hidden="true" className="mb-3 block shrink-0" style={{ stroke: "var(--color-water)" }} fill="none" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      {link === "forward" || link === "both" ? <path d={link === "both" ? "M3 5 H22 M18 1.5 L22 5 L18 8.5" : "M3 9 H22 M18 5.5 L22 9 L18 12.5"} /> : null}
      {link === "back" || link === "both" ? <path d={link === "both" ? "M23 13 H4 M8 9.5 L4 13 L8 16.5" : "M23 9 H4 M8 5.5 L4 9 L8 12.5"} /> : null}
      {link === "none" ? <path d="M5 9 H21" strokeDasharray="2 3" style={{ stroke: "var(--color-line-strong)" }} /> : null}
    </svg>
  );
}

/**
 * How the strip shows its chips: beside the label in one row (with arrows when they fit), on their own line under
 * the label and the pencil (with arrows when they fit one line, else wrapping onto a second chip line), or, when even
 * that is too much (more than 4 modes that do not fit), only the chosen chip and "+N".
 */
type StripFit = "inlineArrows" | "inline" | "belowArrows" | "below" | "chosen";

/** The first layout that fits. Pure, for the test: widths in px, the chip rows as measured in one line. */
export function stripFit(widths: { readonly strip: number; readonly beside: number; readonly withArrows: number; readonly withoutArrows: number }, modes: number): StripFit {
  const arrowsAllowed = modes <= MAX_MODES_WITH_ARROWS;
  if (arrowsAllowed && widths.withArrows <= widths.beside) return "inlineArrows";
  if (widths.withoutArrows <= widths.beside) return "inline";
  if (arrowsAllowed && widths.withArrows <= widths.strip) return "belowArrows";
  if (modes <= MAX_MODES_WITH_ARROWS) return "below";
  return "chosen";
}

/** The mode chips, a tank with two or more modes only. The chosen one sits on the list's top edge like a tab. */
function ModeStrip(props: { readonly strategy: StrategyInput; readonly chosenIndex: number; readonly problemModes: ReadonlySet<number>; readonly actions: ReactNode; onPick(modeId: string): void; onEdit(): void }) {
  const { strategy, chosenIndex, problemModes, onPick, onEdit } = props;
  const m = useMessages();
  const [language] = useLanguage();
  const r = m.prep.rules;
  const links = neighbourLinks(strategy);
  const strip = useRef<HTMLDivElement | null>(null);
  const label = useRef<HTMLSpanElement | null>(null);
  const end = useRef<HTMLSpanElement | null>(null);
  const withArrows = useRef<HTMLDivElement | null>(null);
  const withoutArrows = useRef<HTMLDivElement | null>(null);
  const [fit, setFit] = useState<StripFit>("inline");

  // Hidden copies of the chips in one line are measured against the room beside the label and the whole strip.
  useLayoutEffect(() => {
    const decide = () => {
      if (strip.current === null || withArrows.current === null || withoutArrows.current === null) return;
      const width = strip.current.clientWidth;
      const taken = (label.current?.offsetWidth ?? 0) + (end.current?.offsetWidth ?? 0) + 16;
      setFit(stripFit({ strip: width, beside: width - taken, withArrows: withArrows.current.scrollWidth, withoutArrows: withoutArrows.current.scrollWidth }, strategy.modes.length));
    };
    decide();
    if (typeof ResizeObserver === "undefined" || strip.current === null) return;
    const observer = new ResizeObserver(decide);
    observer.observe(strip.current);
    return () => observer.disconnect();
  }, [strategy.modes, language]);

  const chip = (mode: Mode, i: number, live: boolean) => {
    const chosen = i === chosenIndex;
    const name = mode.name.trim() === "" ? r.newModeName(i + 1) : modeName(m.vocabulary, mode);
    const look = chosen ? "relative z-[1] -mb-0.5 border-water bg-water-soft text-ink" : problemModes.has(i) ? "border-hit bg-panel text-ink" : "border-line bg-panel text-muted [@media(hover:hover)]:hover:text-ink";
    const inner = (
      <>
        {i === 0 ? <Flag aria-hidden size={18} strokeWidth={2.5} className="shrink-0" /> : null}
        <span className="min-w-0 truncate">{name}</span>
        {i === 0 ? <span className="shrink-0 text-caption font-semibold text-muted">{r.startWord}</span> : null}
      </>
    );
    const shape = "flex min-h-11 items-center gap-1.5 rounded-t-[var(--radius-control)] border-2 border-b-0 px-3 font-display font-semibold";
    return live ? (
      <button key={mode.id} type="button" aria-pressed={chosen} data-mode-chip={i} onClick={() => onPick(mode.id)} className={`press min-w-11 max-w-full shrink ${shape} ${look}`}>
        {inner}
      </button>
    ) : (
      <span key={mode.id} className={`shrink-0 whitespace-nowrap ${shape}`}>
        {inner}
      </span>
    );
  };
  const others = strategy.modes.length - 1;
  const chosenMode = strategy.modes[chosenIndex];
  const arrows = fit === "inlineArrows" || fit === "belowArrows";
  const below = fit === "belowArrows" || fit === "below";
  const chips =
    fit === "chosen" ? (
      <>
        {chosenMode === undefined ? null : chip(chosenMode, chosenIndex, true)}
        <button type="button" onClick={onEdit} aria-label={r.moreModes(others)} className="press mb-1 flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-full border-2 border-line bg-panel px-2 font-display font-semibold text-muted">
          {`+${others}`}
        </button>
      </>
    ) : (
      strategy.modes.map((mode, i) => (
        <span key={mode.id} className="contents">
          {arrows && i > 0 ? <LinkArrow link={links[i - 1] ?? "none"} /> : null}
          {chip(mode, i, true)}
        </span>
      ))
    );

  return (
    <div ref={strip} className="relative flex min-w-0 shrink-0 flex-col">
      <div className="flex min-w-0 items-end gap-2">
        <span ref={label} className="flex shrink-0 items-center gap-1 pb-1">
          <span className="font-display font-semibold">{r.modesTitle}</span>
          <IconButton label={r.editModes} icon={<Pencil aria-hidden size={18} />} variant="quiet" data-focus-key="modes" onClick={onEdit} />
        </span>
        <div className="flex min-w-0 flex-1 items-end gap-1">{below ? null : chips}</div>
        <span ref={end} className="flex shrink-0 items-center pb-1 empty:hidden">
          {props.actions}
        </span>
      </div>
      {/* On a narrow pane the chips get their own line under the label, and may wrap onto a second one. */}
      {below ? <div className={`flex min-w-0 items-end gap-1 ${arrows ? "" : "flex-wrap gap-y-1"}`}>{chips}</div> : null}
      <div className="h-0.5 bg-water" />
      {/* Copies of the chips in one line, out of sight and taking no room, to know which way fits. */}
      <div aria-hidden="true" inert className="invisible absolute inset-x-0 top-0 h-0 overflow-hidden">
        <div ref={withArrows} className="flex w-max items-end gap-1">
          {strategy.modes.map((mode, i) => (
            <span key={mode.id} className="contents">
              {i > 0 ? <span className="w-[26px] shrink-0" /> : null}
              {chip(mode, i, false)}
            </span>
          ))}
        </div>
        <div ref={withoutArrows} className="flex w-max items-end gap-1">
          {strategy.modes.map((mode, i) => chip(mode, i, false))}
        </div>
      </div>
    </div>
  );
}

export function RulesList({ strategy, issues, nav, onNav, onChange, actions }: RulesEditorProps) {
  const m = useMessages();
  const r = m.prep.rules;
  const v = m.vocabulary;
  const { ref, box } = useBoxSize<HTMLDivElement>();
  const chosen = chosenMode(strategy, nav.modeId);
  if (chosen === null) return null;
  const { mode, index: modeIndex } = chosen;
  const placed = placeIssues(m.prep, issues);
  const elsewhere = placed.filter((p) => p.place.kind !== "upgrades" && (!("mode" in p.place) || p.place.mode !== modeIndex));
  const problemModes = new Set(placed.flatMap((p) => (p.place.kind === "mode" ? [p.place.mode] : [])));
  const items: Item[] = [...mode.rules.map((rule, index) => ({ kind: "rule" as const, rule, index })), { kind: "add" }, { kind: "fallback" }];
  const canAdd = canAddRule(strategy, mode.id);
  const many = strategy.modes.length > 1;
  const first = strategy.modes[0];

  function add(): void {
    const next = addRule(strategy, mode.id);
    const addedId = ruleIdAt(next, mode.id, mode.rules.length);
    onChange(next);
    if (addedId !== undefined) onNav({ modeId: mode.id, view: { kind: "rule", ruleId: addedId, section: "when" } });
  }

  function renderItem(item: Item) {
    if (item.kind === "fallback") {
      const problems = problemsAt(placed, (p) => p.kind === "fallback" && p.mode === modeIndex);
      return (
        <span className="grid min-w-0 grid-cols-[2rem_minmax(0,1fr)] gap-x-2">
          <OrderMark mark="fallback" last />
          <button type="button" data-focus-key="fallback" data-rule-fallback="" onClick={() => onNav({ ...nav, view: { kind: "fallback" } })} className={`${CARD} ${problems.length > 0 ? "border-hit" : "border-line"}`}>
            <span aria-hidden="true" className={FLOW}>
              <span className={LINE}>
                <span className={WORD}>{v.rule.fallbackLead}</span>{" "}
              </span>
              <span className={LINE}>
                <ArrowRight size={18} strokeWidth={2.75} className={`${INLINE_ICON} mr-1 text-muted`} />
                <ActionBlock v={v} action={mode.fallback} />
              </span>
            </span>
            <span className="sr-only">{fallbackText(v, mode.fallback)}</span>
            <Problems problems={problems} inline />
          </button>
        </span>
      );
    }
    if (item.kind === "add") {
      return (
        <span className="grid min-w-0 grid-cols-[2rem_minmax(0,1fr)] gap-x-2">
          <OrderMark mark="add" last={false} />
          <span className="flex min-w-0 flex-col pb-2">
            {/* A full mode says why instead of a button that does nothing. */}
            {canAdd ? (
              <button
                type="button"
                data-focus-key="add-rule"
                data-rule-add=""
                onClick={add}
                className="press flex min-h-11 w-full min-w-0 items-center gap-2 rounded-[var(--radius-card)] border-2 border-dashed border-water-light bg-panel px-2.5 text-left font-display font-semibold text-water [@media(hover:hover)]:hover:border-water"
              >
                <Plus aria-hidden size={18} strokeWidth={2.5} className="shrink-0" />
                {r.addRule}
              </button>
            ) : (
              <p className="flex min-h-11 items-center rounded-[var(--radius-card)] border-2 border-dashed border-line px-2.5 text-caption text-muted">{r.rulesFull(LIMITS.maxRulesPerMode)}</p>
            )}
          </span>
        </span>
      );
    }
    const { rule, index } = item;
    const problems = problemsAt(placed, (p) => p.kind === "rule" && p.mode === modeIndex && p.rule === index);
    return (
      <span className="grid min-w-0 grid-cols-[2rem_minmax(0,1fr)] gap-x-2">
        <OrderMark mark={index} last={false} />
        {/* The spacing under a card is inside the item, so the order line runs on through it to the next number. */}
        <span className="flex min-w-0 flex-col pb-2">
          <button
            type="button"
            data-rule-open=""
            data-focus-key={`rule:${rule.id}`}
            onClick={() => onNav({ ...nav, view: { kind: "rule", ruleId: rule.id, section: "when" } })}
            className={`${CARD} ${problems.length > 0 ? "border-hit" : "border-line"}`}
          >
            <RuleBlocks v={v} rule={rule} modes={strategy.modes} />
            <span className="sr-only">{`${r.ruleNumber(index + 1)}. ${ruleBriefText(v, rule, strategy.modes)}`}</span>
            <Problems problems={problems} inline />
          </button>
        </span>
      </span>
    );
  }

  return (
    <div ref={ref} className="@container/rules mx-auto flex min-h-0 w-full max-w-[60rem] min-w-0 flex-1 flex-col gap-2">
      {/* A tank with one mode: "Add a mode" and the host's action in one quiet row. With modes, they sit in the strip. */}
      {many ? (
        <ModeStrip
          strategy={strategy}
          chosenIndex={modeIndex}
          problemModes={problemModes}
          actions={actions}
          onPick={(modeId) => onNav({ modeId, view: { kind: "list" } })}
          onEdit={() => onNav({ modeId: mode.id, view: { kind: "modes" } })}
        />
      ) : (
        <div className="flex min-w-0 shrink-0 flex-wrap items-center gap-2">
          <Button variant="quiet" icon={<Plus aria-hidden size={18} strokeWidth={2.5} />} data-focus-key="modes" onClick={() => onNav({ modeId: mode.id, view: { kind: "modes" } })}>
            {r.addMode}
          </Button>
          {actions === undefined ? null : <span className="ml-auto flex shrink-0 items-center">{actions}</span>}
        </div>
      )}
      {many && first !== undefined && box !== null && box.height >= STARTS_MIN_HEIGHT_PX ? (
        <p className="shrink-0 text-caption font-semibold text-muted">{r.startsIn(first.name.trim() === "" ? r.newModeName(1) : modeName(v, first))}</p>
      ) : null}
      {box !== null && box.height >= INTRO_MIN_HEIGHT_PX ? <p className="shrink-0 text-muted">{r.intro}</p> : null}
      {elsewhere.length === 0 ? null : (
        <StatusBanner
          tone="danger"
          title={r.needsFix}
          body={elsewhere
            .map((p) => {
              const other = "mode" in p.place ? strategy.modes[p.place.mode] : undefined;
              return other === undefined ? p.sentence : `${r.elsewhere(modeName(v, other))} ${p.sentence}`;
            })
            .join(" ")}
        />
      )}
      {mode.rules.length === 0 ? <p className="shrink-0 text-muted">{r.empty}</p> : null}
      <Pager label={r.listLabel} items={items} gap={0} itemKey={(item) => (item.kind === "rule" ? item.rule.id : item.kind)} renderItem={renderItem} />
    </div>
  );
}
