// The workshop's guidance for a first play style (docs/specs/revamp/65-guidance.md,
// section 4): the checklist as one collapsed line in the guide colour ("2 of 5") that
// opens as a step sheet, and the short happy moment when the tour is finished, with two
// next steps. Both follow the workshop tour's stored state, so they survive leaving.

import { CircleCheck, Circle, ListChecks, Play, Plus } from "lucide-react";
import { useEffect } from "react";
import { navigate } from "../app/navigation.ts";
import { paths } from "../app/route.ts";
import { useTourState } from "../guide/guideStore.ts";
import { isUnderway } from "../guide/tourMachine.ts";
import { useMessages } from "../i18n/I18nProvider.tsx";
import { useMyTank } from "../mytank/useMyTank.ts";
import { IS_OFFLINE } from "../offline/target.ts";
import { requestPlayWith } from "../prep/lastStyle.ts";
import { playSound } from "../sound/player.ts";
import { TankBadge } from "../tank/TankBadge.tsx";
import { Button } from "../ui/Button.tsx";
import { StepSheet } from "../ui/StepSheet.tsx";
import { CHECKLIST, checklistTicks } from "./firstStyle.ts";

/** The collapsed checklist: shown while the workshop tour is underway. `compact` keeps only the icon and the count (the editor's top row). */
export function ChecklistLine({ compact = false, onOpen }: { readonly compact?: boolean; onOpen(): void }) {
  const m = useMessages();
  const c = m.guide.checklist;
  const state = useTourState("workshop");
  if (!isUnderway(state)) return null;
  const done = checklistTicks(state).filter(Boolean).length;
  return (
    <button
      type="button"
      aria-label={c.open(done, CHECKLIST.length)}
      data-focus-key="first-style-checklist"
      onClick={() => {
        playSound("tap");
        onOpen();
      }}
      className={`press flex min-h-11 min-w-11 shrink-0 items-center gap-2 rounded-[var(--radius-control)] border-2 border-b-4 border-guide-deep bg-guide-soft px-3 text-guide-ink ${compact ? "" : "self-start"}`}
    >
      <ListChecks aria-hidden size={20} strokeWidth={2.5} className="shrink-0" />
      {compact ? null : <span className="min-w-0 font-display font-semibold [overflow-wrap:anywhere]">{c.title}</span>}
      <span aria-hidden="true" className="tabular shrink-0 rounded-full bg-guide px-2 font-display font-semibold text-guide-on">
        {c.count(done, CHECKLIST.length)}
      </span>
    </button>
  );
}

/** The opened checklist, in place of the pane. */
export function ChecklistSheet({ onBack }: { onBack(): void }) {
  const m = useMessages();
  const c = m.guide.checklist;
  const ticks = checklistTicks(useTourState("workshop"));
  return (
    <StepSheet title={c.title} onBack={onBack}>
      <ul className="m-0 flex min-w-0 list-none flex-col gap-2 rounded-[var(--radius-card)] bg-guide-soft p-3">
        {CHECKLIST.map(({ item }, i) => {
          const done = ticks[i] === true;
          return (
            <li key={item} className="flex min-h-11 min-w-0 items-center gap-3 text-guide-ink">
              {done ? <CircleCheck aria-hidden size={24} strokeWidth={2.5} className="shrink-0" /> : <Circle aria-hidden size={24} strokeWidth={2} className="shrink-0" />}
              <span className={`min-w-0 [overflow-wrap:anywhere] ${done ? "font-semibold" : ""}`}>{c.items[item]}</span>
              <span className="sr-only">{done ? c.done : c.notYet}</span>
            </li>
          );
        })}
      </ul>
    </StepSheet>
  );
}

/** The happy moment after the last step: the tank pops in, the round-start sound plays, and two next steps. */
export function FirstStyleDone({ styleId, onAnother, onBack }: { readonly styleId: string | null; onAnother(): void; onBack(): void }) {
  const m = useMessages();
  const f = m.guide.finished;
  const { tank } = useMyTank();
  useEffect(() => {
    playSound("roundStart");
  }, []);
  return (
    <StepSheet title={f.title} onBack={onBack}>
      <div data-first-style-done="" className="flex min-h-0 min-w-0 flex-1 flex-col items-start gap-4">
        <TankBadge look={tank.look} size={72} name={null} detail="full" angle={-90} className="animate-pop" />
        {/* The sentence sends the player to an arena, and offline has none. */}
        {IS_OFFLINE ? null : <p className="text-lead [overflow-wrap:anywhere]">{f.body}</p>}
        <div className="flex min-w-0 flex-wrap items-center gap-3">
          {/* Offline has no arenas to play in (offline/target.ts). */}
          {IS_OFFLINE ? null : (
            <Button
              size="lg"
              icon={<Play aria-hidden size={22} />}
              onClick={() => {
                // A request, not only the style used last: the player may come back to a seat they still hold, which is not new.
                if (styleId !== null) requestPlayWith({ kind: "mine", id: styleId });
                navigate(paths.play());
              }}
            >
              {f.playNow}
            </Button>
          )}
          <Button variant="secondary" icon={<Plus aria-hidden size={22} strokeWidth={2.5} />} onClick={onAnother}>
            {f.another}
          </Button>
        </div>
      </div>
    </StepSheet>
  );
}
