// Which language the interface speaks, and where that choice is kept. The order
// is: the choice the person made on this browser, else Indonesian. The browser's
// own language is not read (owner, 2026-11-12: "Default language should be
// Indonesian"), so a new visitor always starts in Indonesian and switches by hand.

import { PREFERENCE_KEYS, readPreference, writePreference } from "../app/preferences.ts";
import { browserStore, type KeyValueStore } from "../session/storage.ts";

export const LANGUAGES = ["en", "id"] as const;
export type Language = (typeof LANGUAGES)[number];

const DEFAULT_LANGUAGE: Language = "id";

function isLanguage(value: string): value is Language {
  return (LANGUAGES as readonly string[]).includes(value);
}

export function pickLanguage(stored: string | null, initial: Language = DEFAULT_LANGUAGE): Language {
  return stored !== null && isLanguage(stored) ? stored : initial;
}

/** The current language, kept outside React so every page and the document `lang` read one value. */
export interface LanguageStore {
  get(): Language;
  set(language: Language): void;
  subscribe(onChange: () => void): () => void;
}

export interface LanguageStoreOptions {
  readonly store: KeyValueStore | null;
  /** The language when nothing is stored. The app leaves it out (Indonesian); a test names the language it renders. */
  readonly initial?: Language;
  /** Runs after each change, for example to set `<html lang>`. */
  readonly onChange?: (language: Language) => void;
}

export function createLanguageStore({ store, initial, onChange }: LanguageStoreOptions): LanguageStore {
  let current = pickLanguage(readPreference(store, PREFERENCE_KEYS.language), initial);
  const listeners = new Set<() => void>();
  return {
    get: () => current,
    set(language) {
      if (language === current) return;
      current = language;
      // A refused write still switches the language for this visit.
      writePreference(store, PREFERENCE_KEYS.language, language);
      onChange?.(language);
      for (const listener of listeners) listener();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

export function applyDocumentLanguage(language: Language): void {
  if (typeof document !== "undefined") document.documentElement.lang = language;
}

/** The store the app uses. Tests make their own with createLanguageStore. */
export const languageStore: LanguageStore = createLanguageStore({
  store: browserStore(),
  onChange: applyDocumentLanguage,
});
