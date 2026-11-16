// The countries of the flag part, named in the page's language and in that language's order.
// The names come from the browser (Intl.DisplayNames), so the 255 names need no catalog of
// their own. Pure, so the order and the search are tested without a page.

import { FLAG_COUNTRIES, type FlagCountry } from "@game/arena";
import type { Language } from "../i18n/language.ts";

export interface Country {
  readonly code: FlagCountry;
  readonly name: string;
}

const MARKS = /\p{Mark}/gu;

/** Lower case without accents, so "cote" finds "Côte d’Ivoire" and "turki" finds "Turki". */
function folded(text: string): string {
  return text.normalize("NFD").replace(MARKS, "").toLowerCase();
}

/** Every country with its name in `language`, sorted by that name. */
export function countriesIn(language: Language): readonly Country[] {
  const names = new Intl.DisplayNames([language], { type: "region" });
  const order = new Intl.Collator(language);
  return FLAG_COUNTRIES.map((code) => ({ code, name: names.of(code.toUpperCase()) ?? code.toUpperCase() })).sort((a, b) => order.compare(a.name, b.name));
}

/** The countries whose name holds the typed letters anywhere; all of them for an empty search. */
export function searchCountries(countries: readonly Country[], query: string): readonly Country[] {
  const wanted = folded(query.trim());
  return wanted === "" ? countries : countries.filter((country) => folded(country.name).includes(wanted));
}
