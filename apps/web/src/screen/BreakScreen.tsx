// The break on the big screen: who went through and who is out, side by side and
// told apart by heading, colour and order, then what comes next.

import { FINAL_SIZE, isPublicKind, type PublicArena } from "@game/arena";
import { useMessages } from "../i18n/I18nProvider.tsx";
import { roundRows } from "../standings/standings.ts";
import type { NextStep } from "../stream/streamState.ts";
import type { FitSize } from "../ui/fitList.ts";
import { NextStepLine } from "./NextStepLine.tsx";
import { RulesLine } from "./RulesLine.tsx";
import { TankList } from "./TankList.tsx";

// Both sides keep 26px or more for 24 tanks; the side of the tanks that are out may be smaller when both are short of room.
const THROUGH_FIT: FitSize = { maxPx: 36, columnEm: 12.5 };
const OUT_FIT: FitSize = { maxPx: 32, columnEm: 12.5 };

export function BreakScreen({ arena, nextRound: _nextRound, nextStep = null }: { arena: PublicArena; nextRound: number; nextStep?: NextStep | null }) {
  const m = useMessages();
  const t = m.screen.break;
  const summary = arena.rounds.at(-1);
  if (summary === undefined) return null;
  const rows = roundRows(arena, summary);
  const through = rows.filter((r) => r.advanced);
  const out = rows.filter((r) => !r.advanced);
  const nextIsFinal = summary.survivors.length <= FINAL_SIZE;
  const heading = arena.settings.ruleSetMode === "standard" ? t.heading(summary.round) : m.live.headingWithRules(t.heading(summary.round), m.vocabulary.roundRules[summary.ruleSetId].name);
  const item = (r: (typeof rows)[number]) => ({ tank: r, trailing: String(r.score) });
  return (
    <div className="flex h-full min-h-0 flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-heading [overflow-wrap:anywhere]">{heading}</h1>
        <p className="text-lead font-semibold">{t.summary(through.length, out.length, nextIsFinal)}</p>
        <NextStepLine step={nextStep} counting={t.nextIn} waiting={isPublicKind(arena.settings.kind) ? t.soon : t.waiting} className="text-lead text-water" />
        <RulesLine arena={arena} className="text-muted" />
      </header>
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-12 laptop:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <section className="flex min-h-0 min-w-0 flex-col gap-3" aria-labelledby="through-heading">
          <h2 id="through-heading" className="text-title text-ok">
            {`${t.through} (${through.length})`}
          </h2>
          <div className="min-h-0 flex-1">
            <TankList label={t.through} items={through.map(item)} fit={THROUGH_FIT} focus={null} more={t.moreThrough} />
          </div>
        </section>
        <section className="flex min-h-0 min-w-0 flex-col gap-3" aria-labelledby="out-heading">
          <h2 id="out-heading" className="text-title text-muted">
            {`${t.out} (${out.length})`}
          </h2>
          <div className="min-h-0 flex-1">
            <TankList label={t.out} items={out.map(item)} fit={OUT_FIT} focus={null} more={t.moreOut} muted />
          </div>
        </section>
      </div>
    </div>
  );
}
