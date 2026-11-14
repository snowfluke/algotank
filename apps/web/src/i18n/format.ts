// Numbers, lists and durations in the reader's language, through Intl. In
// components use useFormat(); these take the language for code outside React.

import type { Language } from "./language.ts";

export function formatNumber(value: number, language: Language, options?: Intl.NumberFormatOptions): string {
  return new Intl.NumberFormat(language, options).format(value);
}

/** "Ana, Budi and Citra" or "Ana, Budi, dan Citra". */
export function formatList(items: readonly string[], language: Language): string {
  return new Intl.ListFormat(language, { style: "long", type: "conjunction" }).format(items);
}

/** English dates read day first ("12 November 2026"), as Indonesian ones do. */
const DATE_LOCALE: Record<Language, string> = { en: "en-GB", id: "id-ID" };
const MONTH_ID = /^(\d{4})-(\d{2})$/;

/** A month id "2026-11" as "November 2026"; the id itself when it is not one. */
export function formatMonth(monthId: string, language: Language): string {
  const match = MONTH_ID.exec(monthId);
  if (match === null) return monthId;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, 1));
  return new Intl.DateTimeFormat(DATE_LOCALE[language], { month: "long", year: "numeric", timeZone: "UTC" }).format(date);
}

/** An ISO time as the day it falls on here, such as "12 November 2026". */
export function formatDate(iso: string, language: Language): string {
  return new Intl.DateTimeFormat(DATE_LOCALE[language], { day: "numeric", month: "long", year: "numeric" }).format(new Date(iso));
}

function unit(value: number, name: "minute" | "second", language: Language): string {
  return new Intl.NumberFormat(language, { style: "unit", unit: name, unitDisplay: "short" }).format(value);
}

/**
 * Whole seconds as "1 min 30 sec" (English) or "1 mnt 30 dtk" (Indonesian). A
 * zero part is left out, except that 0 is "0 sec". Negative input counts as 0.
 * ponytail: Intl.DurationFormat would do this, but it is not in the ES2022 typings yet.
 */
export function formatDuration(seconds: number, language: Language): string {
  const total = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(total / 60);
  const rest = total % 60;
  if (minutes === 0) return unit(rest, "second", language);
  if (rest === 0) return unit(minutes, "minute", language);
  return `${unit(minutes, "minute", language)} ${unit(rest, "second", language)}`;
}
