// The editor of one of my play styles: the arena's own panes (Rules with its steps,
// Upgrades, Try it; it opens on Rules, the algorithm, 71-workshop-appeal.md C1), reused from prep/, behind BottomTabs, with the name field and
// the save line above them. The draft is kept by a StrategySession whose source is
// the library; every edit is written to the library at once (a draft with a problem
// too, see editorSession.ts) and the account follows (workshop/library.ts).

import { ArrowLeft, CircleAlert, CircleCheck, Cog, Crosshair, Droplet, Droplets, ListChecks, Pencil, Play, Scale } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { ACCOUNT_STRATEGY_LIMITS } from "@game/arena";
import { parseStrategy, ruleSet, RULE_SET_IDS, STANDARD_RULE_SET_ID, type RuleSetId, type UltimateId } from "@game/engine";
import { GroundIcon } from "../catalogue/catalogue.tsx";
import { UltimateEmblem } from "../catalogue/UltimateEmblem.tsx";
import { guideSignal } from "../guide/guideStore.ts";
import { useMessages } from "../i18n/I18nProvider.tsx";
import { WhenStrategyReady } from "../player/WhenStrategyReady.tsx";
import { Practice } from "../practice/Practice.tsx";
import { issuePlace } from "../prep/issues.ts";
import { issueSentence } from "../prep/messages.ts";
import { RulesPane } from "../prep/RulesPane.tsx";
import { focusLater, resolveView, RULES_LIST, type RulesNav } from "../prep/rulesNav.ts";
import { UpgradesPane } from "../prep/UpgradesPane.tsx";
import { usePaneWidth } from "../prep/usePaneWidth.ts";
import { useStrategySession } from "../prep/useStrategySession.ts";
import { useMyTank } from "../mytank/useMyTank.ts";
import { AppHeader } from "../ui/AppHeader.tsx";
import { AppShell } from "../ui/AppShell.tsx";
import { BottomTabs, tabPanelProps } from "../ui/BottomTabs.tsx";
import { INPUT_CLASSES } from "../ui/Field.tsx";
import { IconButton } from "../ui/IconButton.tsx";
import { Pager } from "../ui/Pager.tsx";
import { StatusBanner } from "../ui/StatusBanner.tsx";
import { StepSheet } from "../ui/StepSheet.tsx";
import { ChooseUltimateStep } from "./ChooseUltimateStep.tsx";
import { editDraft, editorSource } from "./editorSession.ts";
import { ChecklistLine, ChecklistSheet } from "./FirstStyleGuide.tsx";
import type { LibrarySnapshot, MyPlayStyle } from "./library.ts";
import { playStyleLibrary } from "./useLibrary.ts";
import { workshopSaveView } from "./workshopState.ts";

type Pane = "rules" | "upgrades" | "try";

export interface WorkshopEditorProps {
  readonly style: MyPlayStyle;
  readonly library: LibrarySnapshot;
  readonly nowMs?: number;
  onBack(): void;
}

/** The name as a field in the editor's top row. A valid, unique name is kept as it is typed. */
function NameField({ style }: { readonly style: MyPlayStyle }) {
  const m = useMessages();
  const w = m.workshop;
  const [text, setText] = useState(style.name);
  const [problem, setProblem] = useState<string | null>(null);
  // The name when the field took focus, so leaving it with a new name counts as naming the play style (the tour's step).
  const before = useRef(style.name);
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-1">
      <label className="sr-only" htmlFor="workshop-name">
        {w.name}
      </label>
      <input
        id="workshop-name"
        data-coach="style-name"
        value={text}
        maxLength={ACCOUNT_STRATEGY_LIMITS.nameMax + 8}
        aria-invalid={problem === null ? undefined : true}
        aria-describedby={problem === null ? undefined : "workshop-name-problem"}
        className={`${INPUT_CLASSES} font-display text-lead font-semibold`}
        onChange={(event) => {
          setText(event.target.value);
          const result = playStyleLibrary.rename(style.id, event.target.value);
          setProblem(result.ok ? null : result.problem === "nameTaken" ? w.nameTaken : w.nameProblem);
        }}
        onFocus={() => {
          before.current = playStyleLibrary.get(style.id)?.name ?? style.name;
        }}
        // A child presses Enter (the phone's Go) when the name is done; leaving the field is what keeps it.
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
        }}
        onBlur={() => {
          // A name that was not kept goes back to the saved one, so the field never shows a name that is not saved.
          const saved = playStyleLibrary.get(style.id)?.name ?? style.name;
          setText(saved);
          setProblem(null);
          if (saved !== before.current) guideSignal("styleNamed");
        }}
      />
      {problem === null ? null : (
        <p id="workshop-name-problem" className="font-semibold text-hit">
          {problem}
        </p>
      )}
    </div>
  );
}

function RoundRulesStep({ value, onChange, onBack }: { readonly value: RuleSetId; onChange(id: RuleSetId): void; onBack(): void }) {
  const m = useMessages();
  const w = m.workshop;
  const v = m.vocabulary;
  return (
    <StepSheet title={w.roundRulesTitle} onBack={onBack}>
      <p className="shrink-0 text-muted">{w.roundRulesIntro}</p>
      <Pager
        label={w.roundRulesTitle}
        items={RULE_SET_IDS}
        itemKey={(id) => id}
        ordered={false}
        renderItem={(id) => {
          const chosen = id === value;
          const rules = ruleSet(id);
          const note = w.conditionNotes[id];
          // The numbers a child compares at a glance, from the engine's table; a note says what they cannot (conditionNotes).
          const numbers = [
            { key: "reach", icon: <Crosshair aria-hidden size={14} strokeWidth={2.5} />, text: w.conditionNumbers.reach(rules.baseRange) },
            { key: "carry", icon: <Droplets aria-hidden size={14} strokeWidth={2.5} />, text: w.conditionNumbers.carry(rules.waterCapacity) },
            { key: "cost", icon: <Droplet aria-hidden size={14} strokeWidth={2.5} />, text: w.conditionNumbers.cost(rules.waterPerThrow) },
          ];
          return (
            <button
              type="button"
              aria-pressed={chosen}
              data-round-rules={id}
              onClick={() => {
                onChange(id);
                onBack();
              }}
              className={`press flex min-h-12 w-full min-w-0 items-center gap-3 rounded-[var(--radius-card)] border-2 border-b-4 px-3 py-1.5 text-left ${chosen ? "border-water bg-water-soft" : "border-line bg-panel [@media(hover:hover)]:hover:border-line-strong"}`}
            >
              <span className="flex h-8 w-11 shrink-0 items-center justify-center">
                <GroundIcon ruleSetId={id} />
              </span>
              {/* One line on a laptop, a few on a phone: the six cards fit a page as the plain list did. */}
              <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1">
                <span className="min-w-0 font-display text-lead font-semibold [overflow-wrap:anywhere]">{v.roundRules[id].name}</span>
                <span className="flex min-w-0 flex-wrap gap-1.5">
                  {numbers.map((number) => (
                    <span key={number.key} className={`inline-flex min-w-0 items-center gap-1 rounded-full px-2 py-px text-caption font-semibold text-ink ${chosen ? "bg-panel" : "bg-ground"}`}>
                      <span className="shrink-0 text-water">{number.icon}</span>
                      <span className="min-w-0 [overflow-wrap:anywhere]">{number.text}</span>
                    </span>
                  ))}
                </span>
                {note === undefined ? null : <span className="min-w-0 text-caption text-muted [overflow-wrap:anywhere]">{note}</span>}
              </span>
              {chosen ? <CircleCheck aria-label={w.chosen} size={22} strokeWidth={2.5} className="shrink-0 text-water" /> : null}
            </button>
          );
        }}
      />
    </StepSheet>
  );
}

export function WorkshopEditor({ style, library, nowMs, onBack }: WorkshopEditorProps) {
  const m = useMessages();
  const w = m.workshop;
  const [pane, setPane] = useState<Pane>("rules");
  const look = useMyTank().tank.look;
  const [nav, setNav] = useState<RulesNav>(RULES_LIST);
  const [ruleSetId, setRuleSetId] = useState<RuleSetId>(STANDARD_RULE_SET_ID);
  const [choosingRules, setChoosingRules] = useState(false);
  const [ultimateChoice, setUltimateChoice] = useState<UltimateId | null>(null);
  const [checklistOpen, setChecklistOpen] = useState(false);
  const width = usePaneWidth<HTMLDivElement>();

  // The session follows the play style only; the sentence is read when the load fails.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const source = useMemo(() => editorSource(playStyleLibrary, style.id, m.workshop.notFound), [style.id]);
  const session = useStrategySession(source, style.id, () => undefined);
  const edit = editDraft(playStyleLibrary, style.id, session.setDraft);
  // Every edit also tells the workshop tour, whose step "change one thing in the rule" waits for one.
  const change = (next: Parameters<typeof edit>[0]) => {
    edit(next);
    guideSignal("ruleChanged");
  };
  const draft = session.load.kind === "ready" ? session.load.draft : style.strategy;
  const parsed = useMemo(() => parseStrategy(draft), [draft]);
  const issues = parsed.ok ? [] : parsed.issues;
  const rules = ruleSet(ruleSetId);
  const save = workshopSaveView(parsed.ok, library.account, w);
  // On a phone the name row (with the ultimate button) gives its height to an open rules step.
  const stepOpen = pane === "rules" && resolveView(draft, nav).kind !== "list";
  const closeUltimatePicker = () => {
    setUltimateChoice(null);
    focusLater("workshop-change-ultimate");
  };
  const tabs = [
    { value: "rules" as const, label: w.tabs.rules, icon: <ListChecks aria-hidden size={22} /> },
    { value: "upgrades" as const, label: w.tabs.upgrades, icon: <Cog aria-hidden size={22} /> },
    { value: "try" as const, label: w.tabs.try, icon: <Play aria-hidden size={22} /> },
  ];

  return (
    <AppShell header={<AppHeader title={w.heading} />} bottom={<BottomTabs idBase="workshop" label={w.tabsLabel} tabs={tabs} value={pane} onChange={setPane} />}>
      {checklistOpen ? (
        <ChecklistSheet
          onBack={() => {
            setChecklistOpen(false);
            focusLater("first-style-checklist");
          }}
        />
      ) : ultimateChoice !== null ? (
        <ChooseUltimateStep
          ultimate={ultimateChoice}
          problem={null}
          {...(nowMs === undefined ? {} : { nowMs })}
          onChoose={setUltimateChoice}
          onBack={closeUltimatePicker}
          onSave={() => {
            edit({ ...draft, ultimate: ultimateChoice });
            closeUltimatePicker();
          }}
        />
      ) : choosingRules ? (
        <RoundRulesStep
          value={ruleSetId}
          onChange={setRuleSetId}
          onBack={() => {
            setChoosingRules(false);
            focusLater("workshop-round-rules");
          }}
        />
      ) : (
        <div ref={width.ref} className="flex min-h-0 min-w-0 flex-1 flex-col gap-2">
          {/* One wrapping row: on a laptop the name, the save line and the round rules sit side by side, so the panes keep the height. */}
          <div className={`min-w-0 shrink-0 flex-wrap items-center gap-x-3 gap-y-1 ${stepOpen && !width.wide ? "hidden" : "flex"}`}>
            <div className="flex min-w-0 flex-[1_1_20rem] items-start gap-2">
              <IconButton label={w.back} icon={<ArrowLeft aria-hidden size={22} />} variant="quiet" className="mt-0.5" data-focus-key="workshop-editor-back" onClick={onBack} />
              <NameField key={style.id} style={style} />
            </div>
            {/* The ultimate sits beside the name as one gold button that opens the chooser, not a row of its own (owner,
                2026-11-19). An open rules step needs the height, so the button gives way to it. */}
            {stepOpen ? null : (
            <button
              type="button"
              data-workshop-ultimate=""
              data-focus-key="workshop-change-ultimate"
              aria-label={`${w.changeUltimate}: ${m.catalogue.ultimates[draft.ultimate].name}`}
              className="ultimate-tile press inline-flex min-h-11 max-w-full min-w-0 shrink-0 items-center gap-2 rounded-full border-2 border-b-4 border-guide-deep bg-guide-soft py-0.5 pr-3 pl-0.5 font-display font-semibold text-ink active:border-b-2"
              onClick={() => setUltimateChoice(draft.ultimate)}
            >
              <UltimateEmblem ultimate={draft.ultimate} size={34} />
              <span className="min-w-0 truncate">{m.catalogue.ultimates[draft.ultimate].name}</span>
              <Pencil aria-hidden size={16} strokeWidth={2.5} className="shrink-0 text-guide-ink" />
            </button>
            )}
            <p role="status" data-coach="style-saved" className={`flex min-w-0 flex-[1_1_12rem] items-start gap-1.5 text-caption font-semibold ${save.kind === "problem" ? "text-hit" : save.kind === "saved" ? "text-ok" : "text-muted"}`}>
              {save.kind === "problem" ? <CircleAlert aria-hidden size={16} strokeWidth={2.5} className="mt-0.5 shrink-0" /> : save.kind === "saved" ? <CircleCheck aria-hidden size={16} strokeWidth={2.5} className="mt-0.5 shrink-0" /> : null}
              <span className="min-w-0 [overflow-wrap:anywhere]">{save.text}</span>
            </p>
            {/* Words from 480px; on a phone the icon, with the same accessible name, keeps this to one row. */}
            <IconButton
              label={w.roundRules(m.vocabulary.roundRules[ruleSetId].name)}
              text={w.roundRules(m.vocabulary.roundRules[ruleSetId].name)}
              icon={<Scale aria-hidden size={20} />}
              variant="quiet"
              data-focus-key="workshop-round-rules"
              onClick={() => setChoosingRules(true)}
            />
            <ChecklistLine compact onOpen={() => setChecklistOpen(true)} />
          </div>
          <div {...tabPanelProps("workshop", pane)} className="flex min-h-0 min-w-0 flex-1 flex-col">
            <WhenStrategyReady strategy={session}>
              {() =>
                pane === "upgrades" ? (
                  <UpgradesPane
                    strategy={draft}
                    rules={rules}
                    look={look}
                    problems={issues.filter((issue) => issuePlace(issue).kind === "upgrades").map((issue) => issueSentence(m.prep, issue))}
                    onChange={change}
                  />
                ) : pane === "rules" ? (
                  <RulesPane strategy={draft} issues={issues} rules={rules} nav={nav} onNav={setNav} onChange={change} wide={width.wide} />
                ) : parsed.ok ? (
                  <Practice strategy={draft} name={style.name} defaultRuleSetId={ruleSetId} />
                ) : (
                  <StatusBanner tone="warning" title={w.tryInvalid} />
                )
              }
            </WhenStrategyReady>
          </div>
        </div>
      )}
    </AppShell>
  );
}
