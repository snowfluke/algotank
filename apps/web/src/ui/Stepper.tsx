// Minus, value, plus: for a small whole number with a minimum and a maximum,
// such as upgrade points or the number of bots. The buttons stop at the limits.
// The value is a spinbutton, so a screen reader announces it and arrow keys change it.

import { Minus, Plus } from "lucide-react";
import { useId, type KeyboardEvent } from "react";
import { useMessages } from "../i18n/I18nProvider.tsx";
import { IconButton } from "./IconButton.tsx";

/** `value + delta`, kept inside min and max. */
export function stepValue(value: number, delta: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value + delta));
}

export interface StepperProps {
  readonly label: string;
  readonly value: number;
  readonly min: number;
  readonly max: number;
  onChange(next: number): void;
  readonly disabled?: boolean;
}

export function Stepper({ label, value, min, max, onChange, disabled = false }: StepperProps) {
  const m = useMessages();
  const labelId = useId();
  function onKeyDown(event: KeyboardEvent<HTMLOutputElement>): void {
    const delta = event.key === "ArrowUp" || event.key === "ArrowRight" ? 1 : event.key === "ArrowDown" || event.key === "ArrowLeft" ? -1 : 0;
    if (delta === 0 || disabled) return;
    event.preventDefault();
    onChange(stepValue(value, delta, min, max));
  }
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2">
      <span id={labelId} className="min-w-0 flex-1 font-semibold">
        {label}
      </span>
      <div className="flex items-center gap-2">
        <IconButton
          label={m.common.decrease(label)}
          icon={<Minus aria-hidden size={20} strokeWidth={3} />}
          disabled={disabled || value <= min}
          onClick={() => onChange(stepValue(value, -1, min, max))}
        />
        <output
          role="spinbutton"
          aria-labelledby={labelId}
          aria-valuenow={value}
          aria-valuemin={min}
          aria-valuemax={max}
          tabIndex={disabled ? -1 : 0}
          onKeyDown={onKeyDown}
          className="tabular min-w-10 text-center font-display text-title font-bold"
        >
          {value}
        </output>
        <IconButton
          label={m.common.increase(label)}
          icon={<Plus aria-hidden size={20} strokeWidth={3} />}
          disabled={disabled || value >= max}
          onClick={() => onChange(stepValue(value, 1, min, max))}
        />
      </div>
    </div>
  );
}
