/// <reference types="bun" />
import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { DEFAULT_PRESET_ID, PRESETS } from "@game/engine";
import type { StrategyInput } from "@game/engine";
import { I18nProvider } from "../i18n/I18nProvider.tsx";
import { createLanguageStore } from "../i18n/language.ts";
import { matchingSaved } from "../prep/StylePane.tsx";
import { ToastProvider } from "../ui/Toast.tsx";
import { en, id } from "./messages.ts";
import { WorkshopPage } from "./WorkshopPage.tsx";
import { freeName, workshopSaveView } from "./workshopState.ts";

const evader = PRESETS.find((p) => p.id === DEFAULT_PRESET_ID)!.strategy as StrategyInput;

describe("freeName", () => {
  test("keeps a free name, numbers a taken one, and stays within 24 characters", () => {
    expect(freeName("Evader", [])).toBe("Evader");
    expect(freeName("Evader", [{ name: "evader" }])).toBe("Evader 2");
    expect(freeName("Evader", [{ name: "Evader" }, { name: "Evader 2" }])).toBe("Evader 3");
    const long = "Sneaky splasher of Binta"; // 24 characters
    const next = freeName(long, [{ name: long }]);
    expect(next).toBe("Sneaky splasher of Bin 2");
    expect([...next].length).toBeLessThanOrEqual(24);
  });
});

describe("the editor's save line", () => {
  test("says where the copy is, and a problem first", () => {
    expect(workshopSaveView(true, { kind: "deviceOnly" }, en)).toEqual({ kind: "saved", text: en.savedHere });
    expect(workshopSaveView(true, { kind: "synced" }, en)).toEqual({ kind: "saved", text: en.savedEverywhere });
    expect(workshopSaveView(true, { kind: "syncing" }, en).kind).toBe("saving");
    expect(workshopSaveView(true, { kind: "behind", offline: true }, id)).toEqual({ kind: "problem", text: id.accountOffline });
    expect(workshopSaveView(true, { kind: "behind", offline: false }, en).text).toBe(en.accountBehind);
    expect(workshopSaveView(false, { kind: "synced" }, en)).toEqual({ kind: "problem", text: en.problemKept });
  });
});

describe("matchingSaved", () => {
  test("names the saved style the tank still plays, until it is edited", () => {
    const saved = { id: "style-0001", name: "Mine", strategy: evader, updatedAt: 1 };
    expect(matchingSaved(evader, [saved])).toBe(saved);
    expect(matchingSaved({ ...evader, build: { reach: 0, aim: 0, dodge: 0 } }, [saved])).toBeNull();
  });
});

describe("WorkshopPage", () => {
  const render = (language: "en" | "id") =>
    renderToStaticMarkup(
      <I18nProvider store={createLanguageStore({ store: null, initial: language })}>
        <ToastProvider>
          <WorkshopPage />
        </ToastProvider>
      </I18nProvider>,
    );

  // The test runner has no localStorage, so the page says the styles last for this visit.
  test("with no play styles: the empty state, where they are kept, and one primary action", () => {
    const html = render("en");
    expect(html).toContain("data-workshop-empty");
    expect(html).toContain(en.emptyTitle);
    expect(html).toContain(en.notPersistent);
    expect(html).toContain("data-workshop-new");
    expect(html.split(en.newStyle).length - 1).toBe(1);
  });

  test("speaks Indonesian", () => {
    expect(render("id")).toContain(id.emptyTitle);
  });
});
