// The hooks other features call, one line each, to feed the usage numbers (track.ts).

import { useEffect, useRef } from "react";
import type { MetricPage } from "@game/arena";
import type { Route } from "../app/route.ts";
import { useLanguage } from "../i18n/I18nProvider.tsx";
import type { PlayerView } from "../player/playerView.ts";
import { reachStep, sendMetricEvent } from "./track.ts";

/** The pages whose opens count; the other pages count nothing. */
const COUNTED_PAGES: Partial<Readonly<Record<Route["page"], MetricPage>>> = {
  home: "home",
  play: "play",
  workshop: "workshop",
  player: "arena",
  host: "arena",
  screen: "arena",
  monthly: "monthly",
  champions: "champions",
  result: "result",
};

/** App.tsx: a page open, the first-visit step on the home page, and the language at load and at each switch. */
export function useUsageCounts(page: Route["page"]): void {
  const [language] = useLanguage();
  useEffect(() => {
    const counted = COUNTED_PAGES[page];
    if (counted === undefined) return;
    sendMetricEvent({ name: "pageOpened", label: counted });
    if (counted === "home") reachStep("openedHome");
  }, [page]);
  useEffect(() => {
    sendMetricEvent({ name: "languageUsed", label: language });
  }, [language]);
}

const ROUND_OVER: ReadonlySet<PlayerView["kind"]> = new Set(["break", "out", "finished"]);

/**
 * PlayerPage.tsx: entering the practice arena, and the end of a round the player's tank played.
 * A round's end is the first-visit step "watched a round end", or, once the rules were changed,
 * "played a second round"; track.ts lets only the next step of the path through.
 */
export function useRoundSteps(view: PlayerView): void {
  const previous = useRef<PlayerView["kind"]>(view.kind);
  const inPractice = "me" in view && view.arena.settings.kind === "practice";
  useEffect(() => {
    if (inPractice) reachStep("enteredPractice");
  }, [inPractice]);
  useEffect(() => {
    const ended = previous.current === "live" && ROUND_OVER.has(view.kind);
    previous.current = view.kind;
    if (ended && !reachStep("watchedFirstRound")) reachStep("playedSecondRound");
  }, [view.kind]);
}

/** prep/PrepPanel.tsx: opening the Rules tab, and the first change of a rule there. */
export function useRuleSteps(tab: string, modes: unknown): void {
  const seen = useRef<string | null>(null);
  useEffect(() => {
    if (tab !== "rules") {
      seen.current = null;
      return;
    }
    reachStep("openedRules");
    const now = JSON.stringify(modes);
    if (seen.current !== null && seen.current !== now) reachStep("changedRule");
    seen.current = now;
  }, [tab, modes]);
}
