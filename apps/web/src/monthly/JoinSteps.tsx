// The two steps of "Ikut arena bulanan" for a signed-in account without a seat (flow.ts):
// the name (fixed for the month once used, so a fixed name shows as a sentence and is not
// sent), then the tank with the preparation tabs and "Masukkan tank". The tank is prepared on
// this device (monthlySource) until the player takes a seat or submits a change to the seated tank.

import { Paintbrush } from "lucide-react";
import { useMemo, useState } from "react";
import { FIRST_PUBLISHED_RULES_MONTH, PLAYER_NAME_MAX } from "@game/arena";
import { DEFAULT_PRESET_ID, PRESETS, type StrategyInput } from "@game/engine";
import { UltimateLink } from "../catalogue/UltimateLink.tsx";
import { useFormat, useMessages } from "../i18n/I18nProvider.tsx";
import type { NameDraft } from "../mytank/useNameDraft.ts";
import { readLastStyle } from "../prep/lastStyle.ts";
import { PrepPanel, type PrepTab } from "../prep/PrepPanel.tsx";
import type { StrategySource } from "../prep/strategySession.ts";
import { useStrategySession, type StrategyHandle } from "../prep/useStrategySession.ts";
import { browserStore, readStrategyDraft, saveStrategyDraft } from "../session/storage.ts";
import { tankLetters, type TankLook } from "../tank/look.ts";
import { TankBadge } from "../tank/TankBadge.tsx";
import { Button } from "../ui/Button.tsx";
import { TextInput } from "../ui/Field.tsx";
import { StepSheet } from "../ui/StepSheet.tsx";

/** The storage slot of the tank prepared for the monthly arena (session/storage.ts keys it like an arena). */
const MONTHLY_DRAFT_SLOT = "monthly";

/** The strategy a new monthly tank starts from: the one prepared here before, the play style used last, or the default one. */
function startingStrategy(): StrategyInput {
  const kept = readStrategyDraft(browserStore(), MONTHLY_DRAFT_SLOT);
  if (kept !== null) return kept;
  const last = readLastStyle();
  const preset = last?.kind === "builtIn" ? PRESETS.find((p) => p.id === last.id) : undefined;
  const fallback = PRESETS.find((p) => p.id === DEFAULT_PRESET_ID) ?? PRESETS[0];
  if (fallback === undefined) throw new Error("The engine has no play style to start a tank from.");
  return (preset ?? fallback).strategy;
}

/** A source that keeps the tank on this device; the seat request sends it. */
export function useMonthlyStrategy(): StrategyHandle {
  const source = useMemo((): StrategySource => {
    let draft: StrategyInput | null = null;
    return {
      load: async () => ({ ok: true, data: startingStrategy() }),
      save: async (strategy) => {
        saveStrategyDraft(browserStore(), MONTHLY_DRAFT_SLOT, strategy);
        return { ok: true, data: undefined };
      },
      readDraft: () => draft,
      writeDraft: (next) => {
        draft = next;
      },
    };
  }, []);
  return useStrategySession(source, "monthly", () => undefined);
}

export interface NameStepProps {
  readonly look: TankLook;
  readonly name: NameDraft;
  /** This month's name when it is fixed; the field then does not show. */
  readonly fixedName: string | null;
  onChangeTank(): void;
  onBack(): void;
  onNext(): void;
}

export function NameStep({ look, name, fixedName, onChangeTank, onBack, onNext }: NameStepProps) {
  const m = useMessages();
  const t = m.monthly.joinSteps;
  return (
    <StepSheet
      title={t.nameTitle}
      onBack={onBack}
      action={
        <Button type="submit" form="monthly-name" size="lg" data-monthly-next="">
          {t.next}
        </Button>
      }
    >
      <form
        id="monthly-name"
        data-monthly-name=""
        noValidate
        className="flex min-w-0 flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          onNext();
        }}
      >
        <div className="flex min-w-0 flex-wrap items-center gap-4">
          <TankBadge look={look} label={tankLetters(fixedName ?? name.field.value)} size={80} name={null} detail="full" angle={-90} />
          <Button type="button" variant="secondary" icon={<Paintbrush aria-hidden size={20} />} onClick={onChangeTank} data-opens="mytank">
            {m.mytank.change}
          </Button>
        </div>
        {fixedName === null ? (
          <TextInput
            label={m.mytank.nameLabel}
            hint={t.nameHint}
            value={name.field.value}
            maxLength={PLAYER_NAME_MAX}
            autoComplete="nickname"
            enterKeyHint="next"
            onChange={(event) => name.field.onChange(event.currentTarget.value)}
            error={name.field.error}
          />
        ) : (
          <p data-name-fixed="" className="text-lead [overflow-wrap:anywhere]">
            {t.nameFixed(fixedName)}
          </p>
        )}
      </form>
    </StepSheet>
  );
}

export interface TankStepProps {
  readonly strategy: StrategyHandle;
  readonly look: TankLook;
  readonly playerName: string;
  readonly submitting: boolean;
  /** The server's answer to the last submit, or null. */
  readonly problem: string | null;
  /** "join" puts the tank in; "changeRules" gives the seated tank new rules (flow.ts, changingRules). */
  readonly purpose: { readonly kind: "join" } | { readonly kind: "changeRules" };
  readonly nowMs?: number;
  onBack(): void;
  onSubmit(): void;
}

export function TankStep({ strategy, look, playerName, submitting, problem, purpose, nowMs, onBack, onSubmit }: TankStepProps) {
  const m = useMessages();
  const f = useFormat();
  const t = purpose.kind === "join" ? { title: m.monthly.joinSteps.tankTitle, submit: m.monthly.joinSteps.submit } : { title: m.monthly.changeRules.title, submit: m.monthly.changeRules.submit };
  const ultimate = strategy.load.kind === "ready" ? strategy.load.draft.ultimate : null;
  const [tab, setTab] = useState<PrepTab>("style");
  return (
    <StepSheet
      title={t.title}
      onBack={onBack}
      action={
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-4 gap-y-2">
          {/* Where a player agrees to the terms: what everyone may read (monthly-protocol.ts). The problem takes its place. */}
          {problem === null ? (
            <p data-rules-open-notice="" className="min-w-0 flex-1 basis-60 text-muted [overflow-wrap:anywhere]">
              {m.monthly.joinSteps.rulesOpen(f.month(FIRST_PUBLISHED_RULES_MONTH))}
            </p>
          ) : (
            <p role="alert" className="min-w-0 flex-1 basis-60 font-semibold text-hit [overflow-wrap:anywhere]">
              {problem}
            </p>
          )}
          <div data-monthly-tank-action="" className="flex min-w-0 max-w-full flex-wrap items-center gap-x-3 gap-y-1 fit:flex-nowrap">
            {ultimate === null ? null : <UltimateLink ultimate={ultimate} nowMs={nowMs} />}
            <Button size="lg" className="shrink-0" data-monthly-submit="" loading={submitting} disabled={!strategy.valid || strategy.load.kind !== "ready"} onClick={onSubmit}>
              {t.submit}
            </Button>
          </div>
        </div>
      }
    >
      <PrepPanel strategy={strategy} playerName={playerName} nextRules={{ kind: "none" }} showRuleSets={false} look={look} nowMs={nowMs} tab={tab} onTab={setTab} />
    </StepSheet>
  );
}
