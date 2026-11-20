// A condition or an action as its sentence, with a control where each parameter
// goes: an inline picker for a choice or a tank, a number field for a number. The words
// come from the same parts as the finished sentence (vocabulary/sentence.ts).

import { TARGET_SELECTORS } from "@game/engine";
import type { ParamSpec, ParamValues } from "@game/engine";
import { useMessages } from "../i18n/I18nProvider.tsx";
import { setParam } from "../editor/edit.ts";
import { amountText, optionText, type SentencePart } from "../vocabulary/sentence.ts";
import { Picker } from "../ui/Picker.tsx";
import { NumberField } from "./NumberField.tsx";
import type { PrepText } from "./messages.ts";

export interface PhraseEditorProps {
  readonly parts: readonly SentencePart[];
  readonly values: ParamValues;
  /** Names the owner for a screen reader, for example "Condition 2". */
  readonly context: string;
  onChange(next: ParamValues): void;
}

export type ParamName = keyof PrepText["rules"]["paramNames"];

/** The plain name of a parameter, by its key, so "n" is never read out. */
/** The kind of question a parameter asks ("Which tank?"), shared with the catalogue's rules guide. */
export function paramName(spec: ParamSpec): ParamName {
  if (spec.kind === "target") return "target";
  switch (spec.key) {
    case "compare":
      return "comparison";
    case "bearing":
    case "way":
      return "direction";
    case "attribute":
      return "upgrade";
    case "level":
      return "level";
    case "percent":
      return "percent";
    case "r":
      return "distance";
    default:
      return spec.kind === "int" ? "number" : "choice";
  }
}

function optionValues(spec: ParamSpec): readonly string[] {
  if (spec.kind === "target") return Object.keys(TARGET_SELECTORS);
  if (spec.kind === "choice") return spec.options.map((option) => option.value);
  return [];
}

export function PhraseEditor({ parts, values, context, onChange }: PhraseEditorProps) {
  const m = useMessages();
  const v = m.vocabulary;
  return (
    <p className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-2 text-lead leading-snug">
      {parts.map((part, index) => {
        if (part.kind === "text") {
          const text = part.text.trim();
          return text === "" ? null : (
            <span key={index} className="min-w-0 [overflow-wrap:anywhere]">
              {text}
            </span>
          );
        }
        const { spec } = part;
        const label = `${context}, ${m.prep.rules.paramNames[paramName(spec)]}`;
        const value = values[spec.key];
        if (spec.kind === "int" && spec.options === undefined) {
          const n = typeof value === "number" ? value : spec.default;
          return (
            <span key={spec.key} className="inline-flex flex-wrap items-center gap-x-1">
              <NumberField label={label} value={n} min={spec.min} max={spec.max} onChange={(next) => onChange(setParam(values, spec.key, next))} />
              {part.unit === null ? null : <span>{part.unit.word(n)}</span>}
            </span>
          );
        }
        const numeric = spec.kind === "int";
        const selected = numeric ? typeof value === "number" ? String(value) : "" : typeof value === "string" ? value : "";
        const choices = numeric
          ? (spec.options ?? []).map((n) => ({ value: String(n), label: amountText(n, part.unit) }))
          : optionValues(spec).map((option) => ({ value: option, label: optionText(v, spec, option) }));
        // Two to six short options for most parameters and 16 tanks for a target: a picker in every case, because a
        // segmented control is a fieldset with its own legend and would break the sentence it sits in.
        return (
          <Picker
            key={spec.key}
            look="inline"
            label={label}
            title={m.prep.rules.paramQuestions[paramName(spec)]}
            value={selected}
            placeholder={v.unknown}
            data-picker={`param-${spec.key}`}
            choices={choices}
            onChange={(next) => onChange(setParam(values, spec.key, numeric ? Number(next) : next))}
          />
        );
      })}
    </p>
  );
}
