import { ultimatesOn } from "@game/arena";
import { ULTIMATE_IDS, type UltimateId } from "@game/engine";
import { Check } from "lucide-react";
import { useId } from "react";
import { UltimateEmblem } from "../catalogue/UltimateEmblem.tsx";
import { useMessages } from "../i18n/I18nProvider.tsx";
import { Button } from "../ui/Button.tsx";
import { StepSheet } from "../ui/StepSheet.tsx";

interface ChooseUltimateStepProps {
  readonly ultimate: UltimateId | null;
  readonly problem: string | null;
  readonly nowMs?: number;
  onChoose(ultimate: UltimateId): void;
  onSave(): void;
  onBack(): void;
}

export function ChooseUltimateStep({ ultimate, problem, nowMs = Date.now(), onChoose, onSave, onBack }: ChooseUltimateStepProps) {
  const m = useMessages();
  const w = m.workshop;
  const group = useId();
  return (
    <StepSheet
      title={w.chooseUltimate}
      onBack={onBack}
      action={
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-4 gap-y-1">
          <Button data-ultimate-save="" onClick={onSave}>{w.saveStyle}</Button>
          {problem === null ? null : <p role="alert" className="min-w-0 font-semibold text-hit [overflow-wrap:anywhere]">{problem}</p>}
        </div>
      }
    >
      {ultimatesOn(nowMs) ? null : <span className="shrink-0 self-start rounded-full bg-guide-soft px-2 py-0.5 text-caption font-semibold text-guide-ink">{m.catalogue.soon}</span>}
      {/* The eight descriptions can exceed a short pane. Keep the save action outside the list (85-ultimates.md, D3). */}
      <div data-ultimate-picker="" className="min-h-0 min-w-0 overscroll-contain p-1 fit:overflow-y-auto">
        <fieldset className="grid min-w-0 gap-2 sm:grid-cols-2">
          <legend className="sr-only">{w.chooseUltimate}</legend>
          {ULTIMATE_IDS.map((id) => {
            const text = m.catalogue.ultimates[id];
            const nameId = `${group}-${id}`;
            const bodyId = `${nameId}-body`;
            return (
              <label key={id} className={`ultimate-choice press relative flex min-h-11 min-w-0 cursor-pointer items-center gap-3 rounded-[var(--radius-card)] border-2 border-b-4 px-2 py-2 focus-within:outline-2 focus-within:outline-offset-1 focus-within:outline-water ${ultimate === id ? "border-guide-deep bg-guide-soft" : "border-line bg-panel"}`}>
                <input
                  type="radio"
                  name={group}
                  value={id}
                  aria-labelledby={nameId}
                  aria-describedby={bodyId}
                  checked={ultimate === id}
                  onChange={() => onChoose(id)}
                  className="sr-only"
                />
                <UltimateEmblem ultimate={id} size={56} />
                <span className="flex min-w-0 flex-1 flex-col [overflow-wrap:anywhere]">
                  <span id={nameId} className="font-display text-lead font-semibold">{text.name}</span>
                  <span id={bodyId} className="text-caption text-muted">{text.body}</span>
                </span>
                {ultimate === id ? <Check aria-hidden size={22} strokeWidth={3} className="shrink-0 self-start text-guide-ink" /> : null}
              </label>
            );
          })}
        </fieldset>
      </div>
    </StepSheet>
  );
}
