// The card under a practice game's result: one sentence that names the next step (change one rule)
// with a way to the rules, and, for a rule list that only shoots, the water tip (ruleTip.ts) with a
// button that adds the rule and saves it. The funnel of 2026-11-14 showed that 4 of 20 devices
// watched a whole game and none played a second; nothing on the result said what to do next.

import { useEffect, useState } from "react";
import type { OwnStats } from "@game/arena";
import { useMessages } from "../i18n/I18nProvider.tsx";
import { sendMetricEvent } from "../metrics/track.ts";
import { saveView } from "../prep/saveView.ts";
import type { StrategyHandle } from "../prep/useStrategySession.ts";
import { Button } from "../ui/Button.tsx";
import { waterTipOf, withWaterRule } from "./ruleTip.ts";

/** What this page already counted, so a pane that mounts again (a tab switch) does not count twice. */
const counted = new Set<string>();

function countOnce(key: string, label: "encouraged" | "waterShown" | "waterApplied"): void {
  const id = `${key}|${label}`;
  if (counted.has(id)) return;
  counted.add(id);
  sendMetricEvent({ name: "ruleTip", label });
}

export interface RuleTipProps {
  /** The arena and game, so each game counts once. */
  readonly gameKey: string;
  readonly strategy: StrategyHandle;
  /** The statistics of the game just played, or null until they arrive. */
  readonly stats: OwnStats | null;
  onOpenRules(): void;
}

export function RuleTip({ gameKey, strategy, stats, onOpenRules }: RuleTipProps) {
  const m = useMessages();
  const t = m.ruleTip;
  const [asked, setAsked] = useState(false);
  const saved = strategy.load.kind === "ready" ? strategy.load.saved : null;
  // Unsaved edits in the rules hide the tip: the add starts from the saved rules and would replace them.
  const tip = saved !== null && stats !== null && !strategy.dirty ? waterTipOf(saved, stats.last) : null;
  const save = saveView(strategy, m.prep, m.errors);

  useEffect(() => countOnce(gameKey, "encouraged"), [gameKey]);
  const tipShown = tip !== null;
  useEffect(() => {
    if (tipShown) countOnce(gameKey, "waterShown");
  }, [gameKey, tipShown]);

  async function addWaterRule(): Promise<void> {
    if (saved === null || tip === null) return;
    const next = withWaterRule(saved, tip);
    if (next === null) return;
    setAsked(true);
    countOnce(gameKey, "waterApplied");
    await strategy.saveStrategy(next);
  }

  return (
    <div data-rule-tip="" className="flex min-w-0 flex-col gap-2">
      {tip !== null ? (
        <>
          <p className="[overflow-wrap:anywhere]">{t.waterShort}</p>
          {asked && save.kind === "notSaved" ? (
            <p role="alert" className="text-hit [overflow-wrap:anywhere]">
              {save.reason}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button data-rule-tip-add="" disabled={save.kind === "saving"} onClick={() => void addWaterRule()}>
              {t.addWater}
            </Button>
            <Button variant="secondary" data-rule-tip-open="" onClick={onOpenRules}>
              {t.openRules}
            </Button>
          </div>
        </>
      ) : (
        <>
          {/* After the water rule was saved, the tip is gone and this line says so in its place. */}
          <p className="[overflow-wrap:anywhere]" role={asked ? "status" : undefined}>
            {asked && save.kind === "saved" ? t.added : t.encourage}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" data-rule-tip-open="" onClick={onOpenRules}>
              {t.openRules}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
