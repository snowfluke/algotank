// Two or three views of one pane as segmented radio buttons: Built-in or Mine on the
// Play style tab, the parts of an open rule. It looks like
// ui/SegmentedControl.tsx and adds a data attribute per option, which the no-scroll
// audit clicks in both languages (`data-rule-section="do"`).
//
// ponytail: the classes copy ui/SegmentedControl.tsx; if S0 adds an option attribute
// there, use it and delete this file.

import { useId } from "react";

export interface PaneSwitchOption<T extends string> {
  readonly value: T;
  readonly label: string;
}

export interface PaneSwitchProps<T extends string> {
  /** Names the group for a screen reader. The options explain themselves, so it is not shown. */
  readonly legend: string;
  /** The data attribute each option carries, without "data-": "rule-section" gives data-rule-section="<value>". */
  readonly hook: "style-source" | "rule-section" | "rule-match" | "rule-do-kind";
  readonly options: readonly PaneSwitchOption<T>[];
  readonly value: NoInfer<T>;
  onChange(next: NoInfer<T>): void;
}

export function PaneSwitch<T extends string>({ legend, hook, options, value, onChange }: PaneSwitchProps<T>) {
  const name = useId();
  return (
    <fieldset className="m-0 min-w-0 shrink-0 border-0 p-0">
      <legend className="sr-only">{legend}</legend>
      <div className="grid w-full auto-cols-fr grid-flow-col gap-1 rounded-[var(--radius-control)] border-2 border-line bg-ground p-0.5">
        {options.map((option) => (
          <label
            key={option.value}
            {...{ [`data-${hook}`]: option.value }}
            className="press relative flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-[calc(var(--radius-control)-4px)] px-3 font-display font-semibold text-muted has-[:checked]:bg-panel has-[:checked]:text-ink has-[:checked]:shadow-[var(--shadow-raised)] has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-water"
          >
            <input type="radio" name={name} value={option.value} checked={value === option.value} onChange={() => onChange(option.value)} className="sr-only" />
            <span className="min-w-0 text-center [overflow-wrap:anywhere]">{option.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
