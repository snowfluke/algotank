// Light or dark interface (index.css holds both palettes). Until the person presses the header's
// button the page follows the device's setting, also when it changes while the page is open; after
// that the browser remembers the choice under PREFERENCE_KEYS.theme. index.html reads the same key
// before the first paint, so a dark page never flashes light; change both together.

import { useSyncExternalStore } from "react";
import { PREFERENCE_KEYS, readPreference, writePreference } from "../app/preferences.ts";
import { browserStore, type KeyValueStore } from "../session/storage.ts";

export type Theme = "light" | "dark";

/** The page background of each theme, for the browser's bar (<meta name="theme-color">); the same as --color-ground. */
export const GROUND: Record<Theme, string> = { light: "#f6f3ec", dark: "#121820" };

/** A stored choice, or null for none: anything else was not written by this app. */
export function parseTheme(stored: string | null): Theme | null {
  return stored === "light" || stored === "dark" ? stored : null;
}

/** The device's setting, as matchMedia gives it; null where the browser has no matchMedia. */
export interface DarkQuery {
  readonly matches: boolean;
  addEventListener(type: "change", listener: () => void): void;
}

/** Where the theme shows: the <html> element and the theme-color tag. */
export interface ThemeTarget {
  show(theme: Theme, ground: string): void;
}

export interface ThemeStore {
  get(): Theme;
  /** The person's choice, remembered on this device. */
  choose(theme: Theme): void;
  subscribe(onChange: () => void): () => void;
}

export function createThemeStore(store: KeyValueStore | null, query: DarkQuery | null, target: ThemeTarget): ThemeStore {
  let chosen = parseTheme(readPreference(store, PREFERENCE_KEYS.theme));
  const current = (): Theme => chosen ?? (query?.matches === true ? "dark" : "light");
  let theme = current();
  const listeners = new Set<() => void>();
  const update = () => {
    const next = current();
    if (next === theme) return;
    theme = next;
    target.show(theme, GROUND[theme]);
    for (const listener of listeners) listener();
  };
  target.show(theme, GROUND[theme]);
  query?.addEventListener("change", update);
  return {
    get: () => theme,
    choose(next) {
      chosen = next;
      writePreference(store, PREFERENCE_KEYS.theme, next);
      update();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

function documentTarget(): ThemeTarget {
  return {
    show(theme, ground) {
      document.documentElement.dataset.theme = theme;
      document.querySelector('meta[name="theme-color"]')?.setAttribute("content", ground);
    },
  };
}

export const themeStore: ThemeStore | null =
  typeof window === "undefined" ? null : createThemeStore(browserStore(), typeof window.matchMedia === "function" ? window.matchMedia("(prefers-color-scheme: dark)") : null, documentTarget());

const LIGHT = (): Theme => "light";
const NEVER = () => () => {};

/** `[theme, choose]` for the header's button. */
export function useTheme(): readonly [Theme, (theme: Theme) => void] {
  const theme = useSyncExternalStore(themeStore?.subscribe ?? NEVER, themeStore?.get ?? LIGHT, LIGHT);
  return [theme, (next: Theme) => themeStore?.choose(next)] as const;
}
