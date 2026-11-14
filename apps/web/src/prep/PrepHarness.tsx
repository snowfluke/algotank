// "/kit?show=prep": the tank preparation pane without a server, in a box the size the
// room gives it (a header, a status line above the pane and a bottom bar under it).
// The strategy lives in this page, and the options set what the pretend server
// answers, so every save state can be seen: a first visit, a failing save, a round in
// progress, announced round rules, and secret ones. "&column=narrow" puts the pane in
// a 22rem column, the middle column of the room on a laptop; "&strategy=stress" starts
// from the largest strategy the editor allows, "&strategy=steps3" and "&strategy=steps4"
// from the default play style with a first rule of 3 or 4 steps in order (S3), and
// "&strategy=<play style id>" from that play style, for the audit.

import { useMemo, useRef, useState } from "react";
import { DEFAULT_PRESET_ID, LIMITS, PRESETS, ruleSet } from "@game/engine";
import type { StrategyInput } from "@game/engine";
import { useMessages } from "../i18n/I18nProvider.tsx";
import type { NextRules } from "../rules/nextRules.ts";
import { AppHeader } from "../ui/AppHeader.tsx";
import { AppShell } from "../ui/AppShell.tsx";
import { Button } from "../ui/Button.tsx";
import { SegmentedControl } from "../ui/SegmentedControl.tsx";
import { StepSheet } from "../ui/StepSheet.tsx";
import { PrepPanel, type PrepTab } from "./PrepPanel.tsx";
import type { SaveFailure, StrategySource } from "./strategySession.ts";
import { useStrategySession } from "./useStrategySession.ts";
import { stepRefOf } from "../vocabulary/steps.ts";

type ServerAnswer = "ok" | "offline" | "round";
type RulesShown = "standard" | "known" | "hidden";
type Column = "full" | "narrow";

/** Long enough to see "Saving" on the screen. */
const PRETEND_LATENCY_MS = 500;
const START = PRESETS.find((preset) => preset.id === DEFAULT_PRESET_ID)?.strategy as StrategyInput;

const FAILURES: Readonly<Record<Exclude<ServerAnswer, "ok">, SaveFailure>> = {
  // The save line words these two reasons itself, so the sentence is never shown.
  offline: { reason: "offline", describe: () => ({ sentence: "", details: [] }) },
  round: { reason: "roundRunning", describe: () => ({ sentence: "", details: [] }) },
};

const NEXT_RULES: Readonly<Record<RulesShown, NextRules>> = {
  standard: { kind: "none" },
  known: { kind: "known", ruleSetId: "dry-spell", rules: ruleSet("dry-spell") },
  hidden: { kind: "hidden" },
};

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** 6 modes with 30-character names, 20 rules in the first mode, and a first rule with 4 conditions: the most the editor allows. */
function stressStrategy(): StrategyInput {
  const mode = START.modes[0];
  const rule = mode?.rules[0];
  const condition = rule?.conditions[0];
  if (mode === undefined || rule === undefined || condition === undefined) return START;
  const rules = Array.from({ length: LIMITS.maxRulesPerMode }, (_, i) => ({
    ...rule,
    id: `stress-rule-${i + 1}`,
    conditions: i === 0 ? Array.from({ length: LIMITS.maxConditionsPerRule }, () => condition) : rule.conditions,
  }));
  const modes = Array.from({ length: LIMITS.maxModes }, (_, i) => ({
    ...mode,
    id: `stress-mode-${i + 1}`,
    name: `Refill first, then chase ${i + 1}`.padEnd(LIMITS.maxNameLength, "!"),
    rules: i === 0 ? rules : mode.rules.map((r) => ({ ...r, id: `stress-${i + 1}-${r.id}` })),
  }));
  return { ...START, modes };
}

/** The owner's example as the first rule: "if I get shot, I move forward, turn left, move forward", and a shot as step 4. */
function stepsStrategy(count: 3 | 4): StrategyInput {
  const mode = START.modes[0];
  if (mode === undefined) return START;
  const kinds = (["forward", "left", "forward", "shoot"] as const).slice(0, count);
  const first = {
    id: "steps-rule",
    match: "all" as const,
    conditions: [{ condition: "hitWithin", params: { n: 3 }, negate: false }],
    action: { steps: kinds.map(stepRefOf) },
    chance: 100,
    switchToMode: null,
  };
  return { ...START, modes: [{ ...mode, rules: [first, ...mode.rules] }, ...START.modes.slice(1)] };
}

/** `&rules=known` or `&rules=hidden` and `&server=offline` or `&server=round` start the page in that state, for the audit. */
function optionFromUrl<T extends string>(name: string, values: readonly T[], fallback: T): T {
  if (typeof window === "undefined") return fallback;
  const value = new URLSearchParams(window.location.search).get(name);
  return values.find((v) => v === value) ?? fallback;
}

/** "&strategy=stress", or "&strategy=<play style id>" (such as "ambusher", a style with two modes). */
function startFromUrl(): StrategyInput {
  if (typeof window === "undefined") return START;
  const wanted = new URLSearchParams(window.location.search).get("strategy");
  if (wanted === "stress") return stressStrategy();
  if (wanted === "steps3") return stepsStrategy(3);
  if (wanted === "steps4") return stepsStrategy(4);
  return PRESETS.find((preset) => preset.id === wanted)?.strategy ?? START;
}

function columnFromUrl(): Column {
  if (typeof window === "undefined") return "full";
  return new URLSearchParams(window.location.search).get("column") === "narrow" ? "narrow" : "full";
}

export function PrepHarness() {
  const m = useMessages();
  const h = m.prep.harness;
  const [visit, setVisit] = useState(0);
  const [tab, setTab] = useState<PrepTab>("style");
  const [answer, setAnswer] = useState<ServerAnswer>(() => optionFromUrl("server", ["ok", "offline", "round"], "ok"));
  const [rules, setRules] = useState<RulesShown>(() => optionFromUrl("rules", ["standard", "known", "hidden"], "standard"));
  const [column, setColumn] = useState<Column>(columnFromUrl);
  const [options, setOptions] = useState(false);
  // Read inside the source's async calls, so a change applies to the next save without a new session.
  const answerNow = useRef(answer);
  answerNow.current = answer;

  const source = useMemo((): StrategySource => {
    let server = startFromUrl();
    let draft: StrategyInput | null = null;
    return {
      load: async () => {
        await wait(PRETEND_LATENCY_MS);
        return { ok: true, data: server };
      },
      save: async (strategy) => {
        await wait(PRETEND_LATENCY_MS);
        const now = answerNow.current;
        if (now !== "ok") return { ok: false, failure: FAILURES[now] };
        server = strategy;
        return { ok: true, data: undefined };
      },
      readDraft: () => draft,
      writeDraft: (next) => {
        draft = next;
      },
    };
  }, [visit]);
  const strategy = useStrategySession(source, String(visit), () => undefined);

  function changeAnswer(next: ServerAnswer): void {
    setAnswer(next);
    answerNow.current = next;
    // The player page clears a failed save when the arena phase changes; the end of a round here is that change.
    if (next === "ok") strategy.clearSaveError();
  }

  return (
    <AppShell
      header={<AppHeader title={h.heading} />}
      bottom={
        <div className="mx-auto flex w-full max-w-xl flex-wrap gap-2 px-4 py-2">
          <Button variant="secondary" data-harness-options="" onClick={() => setOptions((open) => !open)}>
            {h.options}
          </Button>
        </div>
      }
    >
      {options ? (
        <StepSheet title={h.options} onBack={() => setOptions(false)}>
          <p className="text-muted">{h.intro}</p>
          <div className="flex min-w-0 flex-wrap items-end gap-4">
            <SegmentedControl
              legend={h.server}
              size="sm"
              options={[
                { value: "ok", label: h.serverOk },
                { value: "offline", label: h.serverOffline },
                { value: "round", label: h.serverRound },
              ]}
              value={answer}
              onChange={changeAnswer}
            />
            <SegmentedControl
              legend={h.rules}
              size="sm"
              options={[
                { value: "standard", label: h.rulesStandard },
                { value: "known", label: h.rulesKnown },
                { value: "hidden", label: h.rulesHidden },
              ]}
              value={rules}
              onChange={setRules}
            />
            <SegmentedControl
              legend={h.column}
              size="sm"
              options={[
                { value: "full", label: h.columnFull },
                { value: "narrow", label: h.columnNarrow },
              ]}
              value={column}
              onChange={setColumn}
            />
            <Button
              variant="secondary"
              onClick={() => {
                setVisit((n) => n + 1);
                setTab("style");
              }}
            >
              {h.firstVisit}
            </Button>
          </div>
        </StepSheet>
      ) : (
        <div className={`flex min-h-0 w-full min-w-0 flex-1 flex-col gap-2 ${column === "narrow" ? "mx-auto max-w-[22rem]" : ""}`}>
          {/* Where the room shows its status line, one or two lines above the pane. */}
          <p className="shrink-0 font-semibold">{h.statusLine}</p>
          <PrepPanel key={visit} strategy={strategy} playerName={h.playerName} nextRules={NEXT_RULES[rules]} showRuleSets={rules !== "standard"} tab={tab} onTab={setTab} />
        </div>
      )}
    </AppShell>
  );
}
