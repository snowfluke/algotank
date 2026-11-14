// React access to the current language and its catalog. Without a provider the
// hooks read the app's language store, so a page or test rendered bare works
// (Indonesian in the app when nothing chose another language; English in tests, see test-setup.ts).

import { createContext, useContext, useMemo, useSyncExternalStore, type ReactNode } from "react";
import { CATALOGS, type Catalog } from "./catalog.ts";
import { formatDate, formatDuration, formatList, formatMonth, formatNumber } from "./format.ts";
import { languageStore, type Language, type LanguageStore } from "./language.ts";

const StoreContext = createContext<LanguageStore>(languageStore);

/** Wrap the app once (main.tsx). Tests pass their own `store` to render in a chosen language. */
export function I18nProvider({ store = languageStore, children }: { store?: LanguageStore; children: ReactNode }) {
  return <StoreContext.Provider value={store}>{children}</StoreContext.Provider>;
}

/** The current language and a setter that stores the choice and updates `<html lang>`. */
export function useLanguage(): readonly [Language, (language: Language) => void] {
  const store = useContext(StoreContext);
  // The server snapshot is the store's own value, so a static render shows the chosen language.
  const language = useSyncExternalStore(store.subscribe, store.get, store.get);
  return [language, store.set] as const;
}

/** The catalog of the current language: `const m = useMessages(); m.home.playNow.title`. */
export function useMessages(): Catalog {
  const [language] = useLanguage();
  return CATALOGS[language];
}

export interface Formatters {
  number(value: number, options?: Intl.NumberFormatOptions): string;
  list(items: readonly string[]): string;
  duration(seconds: number): string;
  /** "2026-11" as "November 2026". */
  month(monthId: string): string;
  /** An ISO time as "12 November 2026". */
  date(iso: string): string;
}

/** Number, list and duration formatting in the current language. */
export function useFormat(): Formatters {
  const [language] = useLanguage();
  return useMemo(
    () => ({
      number: (value, options) => formatNumber(value, language, options),
      list: (items) => formatList(items, language),
      duration: (seconds) => formatDuration(seconds, language),
      month: (monthId) => formatMonth(monthId, language),
      date: (iso) => formatDate(iso, language),
    }),
    [language],
  );
}
