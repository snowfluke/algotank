// Up to 8 choices drawn as large selectable cards, each with a title, one
// sentence and an optional leading picture (a play style, an arena kind). Built
// on native radio buttons, so arrow keys move the choice and Tab leaves the group.
// The chosen card gets a thick border and a check mark, so it does not depend on colour.
// A card narrower than its picture and 10rem of text puts the picture above the text.

import { Check } from "lucide-react";
import { useId, type ReactNode } from "react";

export interface ChoiceCardProps<T extends string> {
  readonly value: T;
  readonly title: string;
  /** One sentence that says what this choice does. */
  readonly description?: string;
  /** A small drawing, such as a TankBadge. Decorative: the title names the choice. */
  readonly visual?: ReactNode;
  /** More content under the description, such as tags. A screen reader reads it as the card's description. */
  readonly extra?: ReactNode;
  /** A choice that cannot be taken now. Its description says why (the create form's "verified" without email). */
  readonly disabled?: boolean;
}

interface ChoiceCardInternalProps<T extends string> extends ChoiceCardProps<T> {
  readonly name: string;
  readonly checked: boolean;
  onSelect(value: T): void;
}

/** One card. Use it through ChoiceGroup, which gives the cards a shared name and legend. */
function ChoiceCard<T extends string>({ value, title, description, visual, extra, disabled = false, name, checked, onSelect }: ChoiceCardInternalProps<T>) {
  const extraId = useId();
  return (
    <label
      data-disabled={disabled ? "" : undefined}
      className={`${disabled ? "cursor-not-allowed border-dashed bg-ground" : "press cursor-pointer bg-panel"} relative flex min-h-16 min-w-0 flex-wrap gap-3 rounded-[var(--radius-card)] border-2 border-b-4 border-line p-4 has-[:checked]:border-water has-[:checked]:shadow-[inset_0_0_0_1px_var(--color-water)] has-[:checked]:bg-water-soft has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-water [@media(hover:hover)]:hover:border-line-strong ${extra === undefined ? "items-center" : "items-start"}`}
    >
      <input
        type="radio"
        name={name}
        value={value}
        checked={checked}
        disabled={disabled}
        onChange={() => onSelect(value)}
        aria-describedby={extra === undefined ? undefined : extraId}
        className="sr-only"
      />
      {visual === undefined ? null : <span className="shrink-0" aria-hidden="true">{visual}</span>}
      <span className="flex min-w-0 flex-1 basis-40 flex-col gap-0.5">
        {/* The title is as tall as the check mark in the corner and keeps clear of it, so the text below can use the full width. */}
        <span className="flex min-h-7 items-center pr-9 font-display text-lead font-semibold leading-tight [overflow-wrap:anywhere]">{title}</span>
        {description === undefined ? null : <span className="text-muted">{description}</span>}
        {extra === undefined ? null : (
          <span id={extraId} className="mt-1">
            {extra}
          </span>
        )}
      </span>
      <span
        aria-hidden="true"
        className={`absolute top-4 right-4 flex size-7 shrink-0 items-center justify-center rounded-full border-2 ${checked ? "border-water bg-water text-water-ink" : "border-line bg-panel text-transparent"}`}
      >
        <Check size={18} strokeWidth={3} />
      </span>
    </label>
  );
}

export interface ChoiceGroupProps<T extends string> {
  readonly legend: string;
  readonly hideLegend?: boolean;
  readonly choices: readonly ChoiceCardProps<T>[];
  // NoInfer: the type comes from the options, so a useState setter of a narrower union fits.
  /** The chosen value, or null when no card is chosen (a strategy with its own rules has no play style). */
  readonly value: NoInfer<T> | null;
  onChange(next: NoInfer<T>): void;
  /** "list" stacks the cards; "grid" puts them in columns of at least 16rem; "pairs" is one column on a phone and two from 640px. */
  readonly layout?: "list" | "grid" | "pairs";
}

const LAYOUT_CLASSES = {
  list: "flex flex-col gap-3",
  grid: "grid grid-cols-[repeat(auto-fill,minmax(min(16rem,100%),1fr))] gap-3",
  pairs: "grid grid-cols-1 gap-3 sm:grid-cols-2",
} as const;

export function ChoiceGroup<T extends string>({ legend, hideLegend = false, choices, value, onChange, layout = "list" }: ChoiceGroupProps<T>) {
  const name = useId();
  return (
    <fieldset className="m-0 min-w-0 border-0 p-0">
      <legend className={hideLegend ? "sr-only" : "mb-2 p-0 font-display text-lead font-semibold"}>{legend}</legend>
      <div className={LAYOUT_CLASSES[layout]}>
        {choices.map((choice) => (
          <ChoiceCard key={choice.value} {...choice} name={name} checked={value === choice.value} onSelect={onChange} />
        ))}
      </div>
    </fieldset>
  );
}
