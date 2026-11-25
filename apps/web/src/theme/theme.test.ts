/// <reference types="bun" />
import { describe, expect, test } from "bun:test";
import type { KeyValueStore } from "../session/storage.ts";
import { createThemeStore, parseTheme, type DarkQuery, type Theme } from "./theme.ts";

function memoryStore(initial: Record<string, string> = {}): KeyValueStore & { readonly data: Record<string, string> } {
  const data = { ...initial };
  return { data, getItem: (key) => data[key] ?? null, setItem: (key, value) => void (data[key] = value), removeItem: (key) => void delete data[key] };
}

function device(dark: boolean): DarkQuery & { flip(): void } {
  const listeners: (() => void)[] = [];
  const query = {
    matches: dark,
    addEventListener: (_type: "change", listener: () => void) => void listeners.push(listener),
    flip() {
      query.matches = !query.matches;
      for (const listener of listeners) listener();
    },
  };
  return query;
}

function shownOn(): { readonly shown: Theme[]; show(theme: Theme): void } {
  const shown: Theme[] = [];
  return { shown, show: (theme) => void shown.push(theme) };
}

describe("the theme", () => {
  test("reads only the two values it writes", () => {
    expect(parseTheme("dark")).toBe("dark");
    expect(parseTheme("light")).toBe("light");
    expect(parseTheme("blue")).toBeNull();
    expect(parseTheme(null)).toBeNull();
  });

  test("follows the device until the person chooses, also when the device changes", () => {
    const query = device(true);
    const target = shownOn();
    const store = createThemeStore(memoryStore(), query, target);
    expect(store.get()).toBe("dark");
    query.flip();
    expect(store.get()).toBe("light");
    expect(target.shown).toEqual(["dark", "light"]);
  });

  test("keeps the person's choice over the device, and remembers it", () => {
    const query = device(false);
    const saved = memoryStore();
    const store = createThemeStore(saved, query, shownOn());
    let changes = 0;
    store.subscribe(() => (changes += 1));
    store.choose("dark");
    query.flip();
    query.flip();
    expect(store.get()).toBe("dark");
    expect(changes).toBe(1);
    expect(createThemeStore(saved, device(false), shownOn()).get()).toBe("dark");
  });

  test("works without storage and without matchMedia", () => {
    const store = createThemeStore(null, null, shownOn());
    expect(store.get()).toBe("light");
    store.choose("dark");
    expect(store.get()).toBe("dark");
  });
});
