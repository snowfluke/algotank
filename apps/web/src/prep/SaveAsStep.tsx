// "Save as my play style" from the arena's Rules or Upgrades tab: a name, then the tank's
// strategy is copied into the player's play styles (workshop/library.ts), so what was
// built inside an arena is kept for the next one.

import { useState, type FormEvent } from "react";
import { ACCOUNT_STRATEGY_LIMITS } from "@game/arena";
import type { StrategyInput } from "@game/engine";
import { useMessages } from "../i18n/I18nProvider.tsx";
import { Button } from "../ui/Button.tsx";
import { TextInput } from "../ui/Field.tsx";
import { StepSheet } from "../ui/StepSheet.tsx";
import { useToast } from "../ui/Toast.tsx";
import { isLoadable, MAX_PLAY_STYLES } from "../workshop/library.ts";
import { playStyleLibrary } from "../workshop/useLibrary.ts";

export function SaveAsStep({ strategy, suggestedName, onBack }: { readonly strategy: StrategyInput; readonly suggestedName: string; onBack(): void }) {
  const m = useMessages();
  const t = m.prep.saveAs;
  const toast = useToast();
  const [name, setName] = useState(suggestedName);
  const [error, setError] = useState<string | null>(null);
  const valid = isLoadable({ strategy });

  function save(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (!valid) return;
    const result = playStyleLibrary.create(name, strategy);
    if (!result.ok) {
      setError(result.problem === "full" ? t.full(MAX_PLAY_STYLES) : result.problem === "nameTaken" ? t.nameTaken : t.nameProblem);
      return;
    }
    toast.show({ message: t.saved(result.style.name) });
    onBack();
  }

  return (
    <StepSheet title={t.open} onBack={onBack}>
      <form onSubmit={save} noValidate className="flex min-w-0 flex-col gap-4">
        <p>{valid ? t.intro : t.invalid}</p>
        <TextInput
          label={t.name}
          hint={t.nameHint(ACCOUNT_STRATEGY_LIMITS.nameMax)}
          value={name}
          maxLength={ACCOUNT_STRATEGY_LIMITS.nameMax + 8}
          error={error}
          disabled={!valid}
          onChange={(event) => {
            setName(event.target.value);
            setError(null);
          }}
        />
        <div>
          <Button type="submit" disabled={!valid}>
            {t.save}
          </Button>
        </div>
      </form>
    </StepSheet>
  );
}
