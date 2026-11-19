// Up to two traits read from the rules of one of the player's own play styles, as small
// chips: the workshop list and "Mine" in an arena show them, because such a style has no
// sentence of its own.

import type { UltimateId } from "@game/engine";
import { UltimateLink } from "../catalogue/UltimateLink.tsx";
import { useMessages } from "../i18n/I18nProvider.tsx";
import type { TraitId } from "./playStyles.ts";

/** With `ultimate`, the style's ultimate leads the chips as a gold one, so it takes no line of its own (owner, 2026-11-19). */
export function Traits({ traits, ultimate, nowMs }: { readonly traits: readonly TraitId[]; readonly ultimate?: UltimateId | undefined; readonly nowMs?: number | undefined }) {
  const m = useMessages();
  return (
    <span className="flex min-w-0 flex-wrap items-center gap-1.5">
      {ultimate === undefined ? null : <UltimateLink ultimate={ultimate} nowMs={nowMs} />}
      <span className="sr-only">{m.prep.style.traitsLabel}</span>
      {traits.map((trait) => (
        <span key={trait} className="rounded-full bg-ground px-2.5 py-0.5 text-caption font-semibold text-ink [overflow-wrap:anywhere]">
          {m.prep.style.traits[trait]}
        </span>
      ))}
    </span>
  );
}
