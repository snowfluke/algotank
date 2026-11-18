// The pane where a player prepares a tank in an arena. It fills the box the room gives
// it and never relies on the page growing (docs/specs/revamp/60-no-scroll.md): four
// tabs (Play style, Rules, Upgrades, Try it; the rules come before the upgrades because
// they are the algorithm, 71-workshop-appeal.md C1) with the save line at the end of the
// tab row, the next round's rules in one line when the arena changes them, and a step
// (an open rule, "Save as my play style", all round rules) that replaces the pane on a
// phone. "Save as my play style" sits in the top row of Rules and of Upgrades.
// The player page places it through player/StrategyPanel.tsx; the kit page shows it
// in a box of a room's size ("/kit?show=prep"). The host keeps the chosen tab, because the
// room mounts this pane again when it switches between its phone and laptop layouts
// (a window resize, a phone turned sideways), and the tab must not jump back to Play style.

import { BookmarkPlus, CircleCheck, RotateCcw } from "lucide-react";
import { useMemo, useState } from "react";
import { parseStrategy } from "@game/engine";
import type { StrategyInput } from "@game/engine";
import { useMessages } from "../i18n/I18nProvider.tsx";
import { WhenStrategyReady } from "../player/WhenStrategyReady.tsx";
import { Practice } from "../practice/Practice.tsx";
import { defaultRuleSetId, type NextRules } from "../rules/nextRules.ts";
import { useMyTank } from "../mytank/useMyTank.ts";
import type { TankLook } from "../tank/look.ts";
import { Button } from "../ui/Button.tsx";
import { IconButton } from "../ui/IconButton.tsx";
import { SaveIndicator } from "../ui/SaveIndicator.tsx";
import { StatusBanner } from "../ui/StatusBanner.tsx";
import { useLibrary } from "../workshop/useLibrary.ts";
import { issuePlace } from "./issues.ts";
import { issueSentence } from "./messages.ts";
import { PaneTabs } from "./PaneTabs.tsx";
import { currentPlayStyle } from "./playStyles.ts";
import { RoundRulesNotice, RoundRulesStep } from "./RoundRulesNotice.tsx";
import { RulesPane } from "./RulesPane.tsx";
import { focusLater, resolveView, RULES_LIST, type RulesNav } from "./rulesNav.ts";
import { SaveAsStep } from "./SaveAsStep.tsx";
import { saveView } from "./saveView.ts";
import { matchingSaved, StylePane } from "./StylePane.tsx";
import { UpgradesPane } from "./UpgradesPane.tsx";
import { rulesForUpgrades } from "./upgrades.ts";
import { usePaneWidth } from "./usePaneWidth.ts";
import type { StrategyHandle } from "./useStrategySession.ts";
import { useRuleSteps } from "../metrics/useUsageCounts.ts";

export interface PrepPanelProps {
  readonly strategy: StrategyHandle;
  readonly playerName: string;
  readonly nextRules: NextRules;
  /** True when the arena changes the rules between rounds. */
  readonly showRuleSets: boolean;
  readonly nowMs?: number | undefined;
  /** The player's look in this arena, for the drawings. Without it (the workshop), the look of "My tank". */
  readonly look?: TankLook;
  /** The chosen tab, held by the host above the part that is mounted again. */
  readonly tab: PrepTab;
  onTab(next: PrepTab): void;
}

export type PrepTab = "style" | "rules" | "upgrades" | "try";
export const PREP_TABS: readonly PrepTab[] = ["style", "rules", "upgrades", "try"];
type Step = "saveAs" | "roundRules" | null;

/**
 * Below this pane width the four tabs and the words "Saving" or "Saved" do not share one
 * row in Indonesian at 360 to 430 px, so the save line shows only its mark there. A save
 * that failed keeps its sentence and Retry, because the player must read them.
 */
const COMPACT_SAVE_BELOW_PX = 560;

function SaveLine({ strategy, compact }: { readonly strategy: StrategyHandle; readonly compact: boolean }) {
  const m = useMessages();
  const view = saveView(strategy, m.prep, m.errors);
  // ponytail: a copy of ui/SaveIndicator.tsx's marks; give SaveIndicator a `compact` option (S0 owns ui/) and use it here.
  if (compact && view.kind !== "notSaved")
    return (
      <p role="status" className="flex size-6 items-center justify-center">
        {view.kind === "saving" ? (
          <span aria-hidden="true" className="size-3 animate-pulse-soft rounded-full bg-water" />
        ) : (
          <CircleCheck aria-hidden size={20} strokeWidth={2.5} className="text-ok" />
        )}
        <span className="sr-only">{view.kind === "saving" ? m.common.saving : m.common.saved}</span>
      </p>
    );
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-x-3">
      <SaveIndicator state={view.kind === "notSaved" ? { kind: "notSaved", reason: view.reason } : view} />
      {view.kind === "notSaved" && view.canRetry ? (
        <Button variant="quiet" icon={<RotateCcw aria-hidden size={18} />} onClick={() => void strategy.saveDraft()}>
          {m.prep.save.retry}
        </Button>
      ) : null}
    </div>
  );
}

function PrepBody(props: PrepPanelProps & { readonly draft: StrategyInput; readonly wide: boolean; readonly compactSave: boolean }) {
  const m = useMessages();
  const library = useLibrary();
  const myTank = useMyTank().tank;
  const look = props.look ?? myTank.look;
  const { tab, onTab: setTab } = props;
  const [nav, setNav] = useState<RulesNav>(RULES_LIST);
  const [step, setStep] = useState<Step>(null);
  const { draft, strategy, nextRules, wide } = props;
  useRuleSteps(tab, draft.modes);
  const parsed = useMemo(() => parseStrategy(draft), [draft]);
  const issues = parsed.ok ? [] : parsed.issues;
  const rules = rulesForUpgrades(nextRules);
  const saveAs = (
    <IconButton label={m.prep.saveAs.open} icon={<BookmarkPlus aria-hidden size={20} />} data-focus-key="save-as" data-save-as="" onClick={() => setStep("saveAs")} />
  );
  const rulesProps = { strategy: draft, issues, rules, nav, onNav: setNav, onChange: strategy.setDraft, actions: saveAs };

  function closeStep(focusKey: string): void {
    setStep(null);
    focusLater(focusKey);
  }

  if (step === "roundRules") return <RoundRulesStep onBack={() => closeStep("round-rules")} />;
  if (step === "saveAs") {
    const preset = currentPlayStyle(draft);
    const suggested = preset !== null ? m.vocabulary.playStyles[preset].name : (matchingSaved(draft, library.styles)?.name ?? "");
    return <SaveAsStep strategy={draft} suggestedName={suggested} onBack={() => closeStep("save-as")} />;
  }
  // An open rules step takes the whole pane: alone on a phone, beside the rules list on a wide pane.
  if (tab === "rules" && resolveView(draft, nav).kind !== "list") return <RulesPane {...rulesProps} wide={wide} />;

  const upgradeProblems = issues.filter((issue) => issuePlace(issue).kind === "upgrades").map((issue) => issueSentence(m.prep, issue));
  return (
    <>
      {props.showRuleSets ? <RoundRulesNotice nextRules={nextRules} onOpen={() => setStep("roundRules")} /> : null}
      <PaneTabs
        label={m.prep.tabsLabel}
        value={tab}
        onChange={setTab}
        tabs={PREP_TABS.map((value) => ({ value, label: m.prep.tabs[value] }))}
        end={<SaveLine strategy={strategy} compact={props.compactSave} />}
      >
        {tab === "style" ? (
          <StylePane strategy={draft} look={look} wide={wide} nowMs={props.nowMs} onChange={strategy.setDraft} onSaveNow={() => void strategy.saveDraft()} />
        ) : tab === "rules" ? (
          <RulesPane {...rulesProps} wide={wide} />
        ) : tab === "upgrades" ? (
          <UpgradesPane strategy={draft} rules={rules} problems={upgradeProblems} look={look} onChange={strategy.setDraft} actions={saveAs} />
        ) : parsed.ok ? (
          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            <Practice strategy={draft} name={props.playerName} defaultRuleSetId={defaultRuleSetId(nextRules)} look={look} inArena />
          </div>
        ) : (
          <StatusBanner tone="warning" title={m.prep.tryIt.invalid} />
        )}
      </PaneTabs>
    </>
  );
}

export function PrepPanel(props: PrepPanelProps) {
  const pane = usePaneWidth<HTMLDivElement>();
  return (
    <div ref={pane.ref} data-prep-pane="" className="flex min-h-0 min-w-0 flex-1 flex-col gap-2">
      <WhenStrategyReady strategy={props.strategy}>{(ready) => <PrepBody {...props} draft={ready.draft} wide={pane.wide} compactSave={pane.width !== null && pane.width < COMPACT_SAVE_BELOW_PX} />}</WhenStrategyReady>
    </div>
  );
}
