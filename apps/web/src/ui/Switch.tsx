// An on/off switch: a native checkbox with role "switch", so Space toggles it and
// a screen reader says on or off. The optional sentence under the label says what the
// current state does; without it, the thumb's side shows the state.

import { useId } from "react";
import { playSound } from "../sound/player.ts";

export interface SwitchProps {
  readonly label: string;
  /** One sentence for the current state, for example what "on" does. Left out where the label says enough (the chat switch, 82-fit-fixes.md). */
  readonly description?: string;
  readonly on: boolean;
  onChange(next: boolean): void;
  readonly disabled?: boolean;
}

export function Switch({ label, description, on, onChange, disabled = false }: SwitchProps) {
  const descriptionId = useId();
  return (
    <label className="group press flex min-h-12 min-w-0 cursor-pointer items-center gap-3 rounded-[var(--radius-control)] has-[:disabled]:cursor-not-allowed has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-water">
      <input
        type="checkbox"
        role="switch"
        checked={on}
        disabled={disabled}
        aria-describedby={description === undefined ? undefined : descriptionId}
        onChange={(event) => {
          playSound("tap");
          onChange(event.currentTarget.checked);
        }}
        className="peer sr-only"
      />
      <span
        aria-hidden="true"
        className="relative inline-flex h-8 w-14 shrink-0 items-center rounded-full border-2 border-line-strong bg-line p-0.5 peer-checked:border-water-deep peer-checked:bg-water peer-disabled:opacity-60"
      >
        <span className="size-6 rounded-full bg-panel shadow-[var(--shadow-raised)] transition-transform group-has-[:checked]:translate-x-6 motion-reduce:transition-none" />
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="font-semibold">{label}</span>
        {description === undefined ? null : (
          <span id={descriptionId} className="text-caption text-muted">
            {description}
          </span>
        )}
      </span>
    </label>
  );
}
