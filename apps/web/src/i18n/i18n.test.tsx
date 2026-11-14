/// <reference types="bun" />
import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { PREFERENCE_KEYS } from "../app/preferences.ts";
import type { KeyValueStore } from "../session/storage.ts";
import { en as commonEn } from "../ui/messages.ts";
import { CATALOGS } from "./catalog.ts";
import { formatDate, formatDuration, formatList, formatMonth, formatNumber } from "./format.ts";
import { I18nProvider, useMessages } from "./I18nProvider.tsx";
import { createLanguageStore, pickLanguage } from "./language.ts";

function memoryStore(initial: Record<string, string> = {}): KeyValueStore & { data: Record<string, string> } {
  const data = { ...initial };
  return {
    data,
    getItem: (key) => data[key] ?? null,
    setItem: (key, value) => {
      data[key] = value;
    },
    removeItem: (key) => {
      delete data[key];
    },
  };
}

const throwingStore: KeyValueStore = {
  getItem: () => {
    throw new Error("blocked");
  },
  setItem: () => {
    throw new Error("blocked");
  },
  removeItem: () => {
    throw new Error("blocked");
  },
};

describe("pickLanguage", () => {
  test("the stored choice wins", () => {
    expect(pickLanguage("en")).toBe("en");
    expect(pickLanguage("id", "en")).toBe("id");
  });

  test("without a stored choice a visitor starts in Indonesian, and a stored value that is not a language is ignored", () => {
    expect(pickLanguage(null)).toBe("id");
    expect(pickLanguage("xx")).toBe("id");
    expect(createLanguageStore({ store: null }).get()).toBe("id");
  });
});

describe("language store", () => {
  test("stores a new choice and tells listeners", () => {
    const store = memoryStore();
    const languages = createLanguageStore({ store, initial: "en" });
    let calls = 0;
    languages.subscribe(() => calls++);
    languages.set("id");
    expect(languages.get()).toBe("id");
    expect(store.data[PREFERENCE_KEYS.language]).toBe("id");
    expect(calls).toBe(1);
  });

  test("reads the stored choice back on the next visit", () => {
    const store = memoryStore({ [PREFERENCE_KEYS.language]: "id" });
    expect(createLanguageStore({ store, initial: "en" }).get()).toBe("id");
  });

  test("works when storage is blocked", () => {
    const languages = createLanguageStore({ store: throwingStore, initial: "id" });
    expect(languages.get()).toBe("id");
    languages.set("en");
    expect(languages.get()).toBe("en");
  });
});

function Probe() {
  const m = useMessages();
  return <p>{m.common.copy}</p>;
}

describe("useMessages", () => {
  // test-setup.ts sets the app's store to English, so the bare renders of every test read one language.
  test("is English without a provider in tests", () => {
    expect(renderToStaticMarkup(<Probe />)).toBe("<p>Copy</p>");
  });

  test("switching the language re-renders the text in the new language", () => {
    const languages = createLanguageStore({ store: memoryStore(), initial: "en" });
    const render = () => renderToStaticMarkup(<I18nProvider store={languages}><Probe /></I18nProvider>);
    expect(render()).toBe("<p>Copy</p>");
    languages.set("id");
    expect(render()).toBe("<p>Salin</p>");
  });
});

describe("messages", () => {
  test("a function message gives the singular and the plural in English", () => {
    expect(commonEn.startsIn(1)).toBe("Starts in 1 second");
    expect(commonEn.startsIn(3)).toBe("Starts in 3 seconds");
    expect(CATALOGS.id.common.startsIn(3)).toBe("Mulai dalam 3 detik");
  });

  test("every slot exists in both languages", () => {
    // The type check proves the shapes match; this guards the runtime wiring.
    expect(Object.keys(CATALOGS.id).sort()).toEqual(Object.keys(CATALOGS.en).sort());
  });
});

describe("format", () => {
  test("numbers and lists follow the language", () => {
    expect(formatNumber(1500, "en")).toBe("1,500");
    expect(formatNumber(1500, "id")).toBe("1.500");
    expect(formatList(["Ana", "Budi", "Citra"], "en")).toBe("Ana, Budi, and Citra");
    expect(formatList(["Ana", "Budi", "Citra"], "id")).toBe("Ana, Budi, dan Citra");
  });

  test("durations are minutes and seconds, leaving out a zero part", () => {
    expect(formatDuration(90, "en")).toBe("1 min 30 sec");
    expect(formatDuration(120, "en")).toBe("2 min");
    expect(formatDuration(45, "en")).toBe("45 sec");
    expect(formatDuration(0, "en")).toBe("0 sec");
    expect(formatDuration(-5, "en")).toBe("0 sec");
    expect(formatDuration(90, "id")).toBe("1 mnt 30 dtk");
  });

  test("a month id and a date read day first in both languages", () => {
    expect(formatMonth("2026-11", "en")).toBe("November 2026");
    expect(formatMonth("2026-11", "id")).toBe("November 2026");
    expect(formatMonth("2026-08", "id")).toBe("Agustus 2026");
    expect(formatMonth("not a month", "en")).toBe("not a month");
    expect(formatDate("2026-11-12T10:00:00Z", "en")).toBe("12 November 2026");
    expect(formatDate("2026-08-12T10:00:00Z", "id")).toBe("12 Agustus 2026");
  });
});
