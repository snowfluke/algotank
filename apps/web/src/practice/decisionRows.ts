// What the player's tank decided on the turn shown: its mode, the rule that
// ran, and the move. The result page of the test match pages these rows.

import { rulesOf } from "@game/engine";
import { useMessages } from "../i18n/I18nProvider.tsx";
import { fallbackText, modeName, ruleText } from "../vocabulary/sentence.ts";
import { throwOf } from "../water/water.ts";
import { PLAYER_ID } from "./run.ts";
import type { PracticeRun } from "./run.ts";

export interface DecisionPanelProps {
  readonly run: PracticeRun;
  /** 0 is the start state, which has no decision. */
  readonly frame: number;
}

export interface DecisionRow {
  readonly term: string;
  readonly detail: string;
}

/** What the player's tank decided on the turn shown, as term and detail pairs. */
export function useDecisionRows({ run, frame }: DecisionPanelProps): readonly DecisionRow[] {
  const m = useMessages();
  const p = m.practice;
  const tick = frame === 0 ? undefined : run.ticks[frame - 1];
  const decision = tick?.decisions.find((d) => d.botId === PLAYER_ID);
  const dry = tick !== undefined && throwOf(tick.throws, PLAYER_ID)?.outcome === "dry";
  // The water before the move is what the shot checked, so it explains a dry shot.
  const before = (frame <= 1 ? run.spawn : run.ticks[frame - 2]?.snapshot)?.bots.find((bot) => bot.id === PLAYER_ID);
  const modes = run.strategy.modes;
  const mode = decision === undefined ? undefined : modes.find((candidate) => candidate.id === decision.modeId);
  const ruleIndex = mode === undefined || decision?.ruleId == null ? -1 : mode.rules.findIndex((rule) => rule.id === decision.ruleId);
  const rule = mode?.rules[ruleIndex];
  const nextMode = decision === undefined ? undefined : modes.find((candidate) => candidate.id === decision.nextModeId);

  let ranRule = p.none;
  if (decision !== undefined && mode !== undefined) {
    ranRule = rule !== undefined ? p.rule(ruleIndex + 1, ruleText(m.vocabulary, rule, modes)) : fallbackText(m.vocabulary, mode.fallback);
  }
  const moveText = decision === undefined ? p.none : dry ? p.dryMove(p.moves[decision.move]) : p.moves[decision.move];
  const rows: DecisionRow[] = [
    { term: p.mode, detail: mode === undefined ? p.none : modeName(m.vocabulary, mode) },
    { term: p.ruleThatRan, detail: ranRule },
    ...(decision?.step === undefined ? [] : [{ term: p.step, detail: p.stepOf(decision.step.index, decision.step.count) }]),
    { term: p.move, detail: moveText },
    { term: p.waterBefore, detail: decision === undefined || before === undefined ? p.none : p.waterOf(before.water, rulesOf(run.spawn).waterCapacity) },
  ];
  if (decision !== undefined && decision.nextModeId !== decision.modeId) {
    rows.push({ term: p.nextMode, detail: nextMode === undefined ? p.none : modeName(m.vocabulary, nextMode) });
  }
  return rows;
}
