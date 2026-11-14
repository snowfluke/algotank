// A row of 2 to 5 mutually exclusive options, such as the language switch or a
// speed choice. Built on native radio buttons, so arrow keys move the choice and
// a screen reader reads "1 of 2". For options that need a sentence each, use ChoiceGroup.

import { useId } from "react";
import { UnreadDot } from "./BottomTabs.tsx";

export interface SegmentOption<T extends string> {
  readonly value: T;
  readonly label: string;
  /** The language of the label when it differs from the page, for example "id" for "Bahasa Indonesia". */
  readonly lang?: string;
  /** Shown instead of the label below 480px, for example "ID" for "Bahasa Indonesia". The label stays the accessible name. */
  readonly shortLabel?: string;
  /** Puts a dot after the label (the chat's unread mark); the text is read after the label, for example "new messages". */
  readonly dot?: string;
}

export interface SegmentedControlProps<T extends string> {
  /** Names the group for a screen reader. */
  readonly legend: string;
  /** Hides the legend visually when the options explain themselves (the language switch). */
  readonly hideLegend?: boolean;
  readonly options: readonly SegmentOption<T>[];
  // NoInfer: the type comes from the options, so a useState setter of a narrower union fits.
  readonly value: NoInfer<T>;
  onChange(next: NoInfer<T>): void;
  readonly size?: "sm" | "md";
}

export function SegmentedControl<T extends string>({ legend, hideLegend = false, options, value, onChange, size = "md" }: SegmentedControlProps<T>) {
  const name = useId();
  const height = size === "sm" ? "min-h-11" : "min-h-12";
  const text = size === "sm" ? "text-caption" : "text-body";
  // "sm" fits the 56px header: 44px targets, 2px padding and a 2px border make it 52px.
  const padding = size === "sm" ? "p-0.5" : "p-1";
  return (
    <fieldset className="m-0 min-w-0 border-0 p-0">
      <legend className={hideLegend ? "sr-only" : "mb-1.5 p-0 font-semibold"}>{legend}</legend>
      <div className={`inline-flex max-w-full flex-wrap gap-1 rounded-[var(--radius-control)] border-2 border-line bg-ground ${padding}`}>
        {options.map((option) => (
          <label
            key={option.value}
            lang={option.lang}
            className={`press relative flex ${height} min-w-11 cursor-pointer items-center justify-center rounded-[calc(var(--radius-control)-4px)] px-3 font-display font-semibold ${text} text-muted has-[:checked]:bg-panel has-[:checked]:text-ink has-[:checked]:shadow-[var(--shadow-raised)] has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-water`}
          >
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={value === option.value}
              onChange={() => onChange(option.value)}
              className="sr-only"
            />
            {option.dot === undefined ? null : (
              <span className="order-last ml-1.5 flex shrink-0 items-center">
                <UnreadDot />
                <span className="sr-only">{`, ${option.dot}`}</span>
              </span>
            )}
            {option.shortLabel === undefined ? (
              <span className="min-w-0 text-center [overflow-wrap:anywhere]">{option.label}</span>
            ) : (
              <>
                <span aria-hidden="true" className="min-[480px]:hidden">
                  {option.shortLabel}
                </span>
                <span className="min-w-0 text-center [overflow-wrap:anywhere] max-[479px]:sr-only">{option.label}</span>
              </>
            )}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
