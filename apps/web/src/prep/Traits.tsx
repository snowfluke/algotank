// Up to two traits read from the rules of one of the player's own play styles, as small
// chips: the workshop list and "Mine" in an arena show them, because such a style has no
// sentence of its own.

import { useMessages } from "../i18n/I18nProvider.tsx";
import type { TraitId } from "./playStyles.ts";

export function Traits({ traits }: { readonly traits: readonly TraitId[] }) {
  const m = useMessages();
  return (
    <span className="flex min-w-0 flex-wrap gap-1.5">
      <span className="sr-only">{m.prep.style.traitsLabel}</span>
      {traits.map((trait) => (
        <span key={trait} className="rounded-full bg-ground px-2.5 py-0.5 text-caption font-semibold text-ink [overflow-wrap:anywhere]">
          {m.prep.style.traits[trait]}
        </span>
      ))}
    </span>
  );
}
