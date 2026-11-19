// The test match pane: the player's tank against built-in bots, run in the browser
// with the engine. It fills the box it is given (the pane contract). Before a run:
// one sentence, the run button, and the test options as a step. After a run: the
// match on the board with the controls under it, and its result as a second page.
// The options step replaces the pane while it is open; the match stays mounted
// behind it, so Back returns to the same turn.
//
// Inside an arena (`inArena`, the room's Try it tab) the run button is secondary, because the
// real game's actions keep the primary one, and the room says in one sentence when the real
// round closed a test match (testMatchShown.ts). The workshop keeps the primary button.

import { SlidersHorizontal } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { parseStrategy } from "@game/engine";
import type { PracticeProps } from "../editor/props.ts";
import { useMessages } from "../i18n/I18nProvider.tsx";
import { useMusicCondition } from "../sound/music.ts";
import { plainTankLook, type TankLook } from "../tank/look.ts";
import { Button } from "../ui/Button.tsx";
import { StatusBanner } from "../ui/StatusBanner.tsx";
import { MATCH_LENGTHS, OPPONENTS_DEFAULT, drawSeed, matchTanks, runPractice } from "./run.ts";
import type { PracticeRun } from "./run.ts";
import { TestMatch } from "./TestMatch.tsx";
import { TestOptions, type TestChoices } from "./TestOptions.tsx";
import { markTestMatchShown } from "./testMatchShown.ts";

interface FinishedRun {
  /** A new number for each run, so the replay starts over even with the same seed. */
  readonly runNumber: number;
  readonly run: PracticeRun;
}

export interface TestMatchPracticeProps extends PracticeProps {
  /** The look the player picked. Without it the player's tank is plain blue. */
  readonly look?: TankLook;
  /** The arena room's Try it tab, not the workshop. */
  readonly inArena?: boolean;
}

const DEFAULT_LOOK = plainTankLook(1);

export function Practice({ strategy, name, defaultRuleSetId, look = DEFAULT_LOOK, inArena = false }: TestMatchPracticeProps) {
  const m = useMessages();
  const p = m.practice;
  const parsed = useMemo(() => parseStrategy(strategy), [strategy]);
  const [choices, setChoices] = useState<TestChoices>({
    opponents: OPPONENTS_DEFAULT,
    mix: { kind: "eachOnce" },
    length: "normal",
    ruleSetId: null,
  });
  const [finished, setFinished] = useState<FinishedRun | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [optionsOpen, setOptionsOpen] = useState(false);
  // The control that opened the options, so focus returns to it on Back.
  const opener = useRef<HTMLElement | null>(null);
  const headingId = useId();
  const showing = inArena && finished !== null;
  // The run's condition stays with the replay when the next run's options change.
  useMusicCondition(optionsOpen ? null : (finished?.run.spawn.ruleSetId ?? null));
  useEffect(() => (showing ? markTestMatchShown() : undefined), [showing]);
  const tanks = useMemo(() => (finished === null ? null : matchTanks(finished.run.spawn.bots.map((bot) => bot.id), look)), [finished, look]);

  function start(): void {
    if (!parsed.ok) return;
    try {
      const run = runPractice({
        strategy: parsed.strategy,
        name,
        opponents: choices.opponents,
        mix: choices.mix,
        ticks: MATCH_LENGTHS[choices.length],
        ruleSetId: choices.ruleSetId ?? defaultRuleSetId,
        seed: drawSeed(),
        nowMs: Date.now(),
        styleName: (preset) => m.vocabulary.playStyles[preset.id].name,
      });
      setFinished((previous) => ({ runNumber: (previous?.runNumber ?? 0) + 1, run }));
      setFailure(null);
    } catch (error) {
      // The player reads only the catalog's sentence; the engine's own English goes to the console.
      console.error(error);
      setFailure(error instanceof Error ? error.message : String(error));
    }
  }

  function openOptions(from: HTMLElement): void {
    opener.current = from;
    setOptionsOpen(true);
  }

  function closeOptions(): void {
    setOptionsOpen(false);
    requestAnimationFrame(() => opener.current?.focus());
  }

  return (
    // The width of this pane decides the layout, so the test match works in a narrow column too.
    <div className="@container flex min-h-0 min-w-0 flex-1 flex-col gap-3" data-practice="">
      {optionsOpen ? <TestOptions choices={choices} defaultRuleSetId={defaultRuleSetId} onChoices={setChoices} onBack={closeOptions} /> : null}
      {failure === null || optionsOpen ? null : <StatusBanner tone="danger" title={p.runFailed} />}
      {finished === null || tanks === null ? (
        optionsOpen ? null : (
          <section className="flex min-w-0 flex-col gap-3" aria-labelledby={headingId}>
            <h2 id={headingId} className="text-title">
              {p.heading}
            </h2>
            <p className="text-lead">{p.intro}</p>
            {parsed.ok ? null : <StatusBanner tone="warning" title={p.cannotRun} {...(parsed.errors[0] === undefined ? {} : { body: parsed.errors[0] })} />}
            <div className="flex min-w-0 flex-wrap items-center gap-3">
              <Button size="lg" variant={inArena ? "secondary" : "primary"} disabled={!parsed.ok} data-test-run="" onClick={start}>
                {p.run}
              </Button>
              <Button variant="secondary" icon={<SlidersHorizontal aria-hidden size={20} />} data-test-options="" onClick={(event) => openOptions(event.currentTarget)}>
                {p.options}
              </Button>
            </div>
          </section>
        )
      ) : (
        // Hidden, not unmounted, while the options are open, so the replay keeps its turn.
        <div className="flex min-h-0 min-w-0 flex-1 flex-col" hidden={optionsOpen}>
          <TestMatch key={finished.runNumber} run={finished.run} tanks={tanks} onRunAgain={start} onOptions={openOptions} />
        </div>
      )}
    </div>
  );
}
