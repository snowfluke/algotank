// A whole number inside a rule sentence: minus, the number, plus. The number can
// be typed too, because some ranges (points, turns) are long. Only a whole number
// inside the range reaches the strategy, so the editor cannot make it invalid.

import { Minus, Plus } from "lucide-react";
import { useState } from "react";
import { useMessages } from "../i18n/I18nProvider.tsx";
import { stepValue } from "../ui/Stepper.tsx";
import { IconButton } from "../ui/IconButton.tsx";

const WHOLE_NUMBER = /^-?\d+$/;

export interface NumberFieldProps {
  /** The accessible name, for example "Condition 1, distance". */
  readonly label: string;
  readonly value: number;
  readonly min: number;
  readonly max: number;
  onChange(next: number): void;
  /** Lets an edit move keyboard focus here. */
  readonly focusKey?: string;
}

/** The number to keep from what was typed, or null while the text is not a whole number in range. */
function typedNumber(text: string, min: number, max: number): number | null {
  if (!WHOLE_NUMBER.test(text)) return null;
  const n = Number(text);
  return n >= min && n <= max ? n : null;
}

export function NumberField({ label, value, min, max, onChange, focusKey }: NumberFieldProps) {
  const m = useMessages();
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? String(value);
  const invalid = draft !== null && typedNumber(draft, min, max) === null;
  return (
    <span className="inline-flex items-center gap-1">
      <IconButton
        label={m.common.decrease(label)}
        icon={<Minus aria-hidden size={18} strokeWidth={3} />}
        disabled={value <= min}
        onClick={() => onChange(stepValue(value, -1, min, max))}
      />
      <input
        type="text"
        inputMode="numeric"
        aria-label={label}
        aria-invalid={invalid || undefined}
        data-focus-key={focusKey}
        className="tabular min-h-11 w-16 min-w-0 rounded-[var(--radius-control)] border-2 border-line bg-panel px-1 text-center font-display font-semibold text-ink hover:border-line-strong aria-[invalid=true]:border-hit"
        value={shown}
        onChange={(event) => {
          setDraft(event.target.value);
          const typed = typedNumber(event.target.value, min, max);
          if (typed !== null) onChange(typed);
        }}
        onBlur={() => setDraft(null)}
      />
      <IconButton
        label={m.common.increase(label)}
        icon={<Plus aria-hidden size={18} strokeWidth={3} />}
        disabled={value >= max}
        onClick={() => onChange(stepValue(value, 1, min, max))}
      />
    </span>
  );
}
