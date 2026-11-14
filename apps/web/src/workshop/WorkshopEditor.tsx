// The editor of one of my play styles: the arena's own panes (Rules with its steps,
// Upgrades, Try it; it opens on Rules, the algorithm, 71-workshop-appeal.md C1), reused from prep/, behind BottomTabs, with the name field and
// the save line above them. The draft is kept by a StrategySession whose source is
// the library; every edit is written to the library at once (a draft with a problem
// too, see editorSession.ts) and the account follows (workshop/library.ts).

import { ArrowLeft, CircleAlert, CircleCheck, Cog, ListChecks, Play, Scale } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { ACCOUNT_STRATEGY_LIMITS } from "@game/arena";
import { parseStrategy, ruleSet, RULE_SET_IDS, STANDARD_RULE_SET_ID, type RuleSetId } from "@game/engine";
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
import { editDraft, editorSource } from "./editorSession.ts";
import { ChecklistLine, ChecklistSheet } from "./FirstStyleGuide.tsx";
import type { LibrarySnapshot, MyPlayStyle } from "./library.ts";
import { playStyleLibrary } from "./useLibrary.ts";
import { workshopSaveView } from "./workshopState.ts";

type Pane = "rules" | "upgrades" | "try";

export interface WorkshopEditorProps {
  readonly style: MyPlayStyle;
  readonly library: LibrarySnapshot;
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
        renderItem={(id) => (
          <button
            type="button"
            aria-pressed={id === value}
            onClick={() => {
              onChange(id);
              onBack();
            }}
            className={`press flex min-h-12 w-full min-w-0 flex-col gap-0.5 rounded-[var(--radius-control)] border-2 border-b-4 px-3 py-2 text-left ${id === value ? "border-water bg-water-soft" : "border-line bg-panel"}`}
          >
            <span className="flex min-w-0 items-center gap-2 font-display font-semibold">
              <span className="min-w-0 flex-1">{v.roundRules[id].name}</span>
              {id === value ? <CircleCheck aria-label={w.chosen} size={18} strokeWidth={2.5} className="shrink-0 text-water" /> : null}
            </span>
            <span className="text-caption text-muted [overflow-wrap:anywhere]">{v.roundRules[id].summary}</span>
          </button>
        )}
      />
    </StepSheet>
  );
}

export function WorkshopEditor({ style, library, onBack }: WorkshopEditorProps) {
  const m = useMessages();
  const w = m.workshop;
  const [pane, setPane] = useState<Pane>("rules");
  const look = useMyTank().tank.look;
  const [nav, setNav] = useState<RulesNav>(RULES_LIST);
  const [ruleSetId, setRuleSetId] = useState<RuleSetId>(STANDARD_RULE_SET_ID);
  const [choosingRules, setChoosingRules] = useState(false);
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
  // On a phone an open rules step has its own Back, so the name row gives way to it.
  const stepOpen = pane === "rules" && !width.wide && resolveView(draft, nav).kind !== "list";
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
          <div className={`min-w-0 shrink-0 flex-wrap items-center gap-x-3 gap-y-1 ${stepOpen ? "hidden" : "flex"}`}>
            <div className="flex min-w-0 flex-[1_1_20rem] items-start gap-2">
              <IconButton label={w.back} icon={<ArrowLeft aria-hidden size={22} />} variant="quiet" className="mt-0.5" onClick={onBack} />
              <NameField key={style.id} style={style} />
            </div>
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
