/// <reference types="bun" />
import { describe, expect, test } from "bun:test";
import { ULTIMATES_FROM } from "@game/arena";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import { DEFAULT_PRESET_ID, PRESETS, ULTIMATE_IDS } from "@game/engine";
import type { StrategyInput } from "@game/engine";
import { CATALOGS } from "../i18n/catalog.ts";
import { I18nProvider } from "../i18n/I18nProvider.tsx";
import { createLanguageStore } from "../i18n/language.ts";
import { matchingSaved } from "../prep/StylePane.tsx";
import { ToastProvider } from "../ui/Toast.tsx";
import { ChooseUltimateStep } from "./ChooseUltimateStep.tsx";
import { en, id } from "./messages.ts";
import { StyleCard } from "./StyleCard.tsx";
import { WorkshopEditor } from "./WorkshopEditor.tsx";
import { WorkshopPage } from "./WorkshopPage.tsx";
import { freeName, workshopSaveView } from "./workshopState.ts";

const evader = PRESETS.find((p) => p.id === DEFAULT_PRESET_ID)!.strategy as StrategyInput;
const noop = () => undefined;

function render(language: "en" | "id", child: ReactNode) {
  return renderToStaticMarkup(
    <I18nProvider store={createLanguageStore({ store: null, initial: language })}>
      <ToastProvider>{child}</ToastProvider>
    </I18nProvider>,
  );
}

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
  // The test runner has no localStorage, so the page says the styles last for this visit.
  test("with no play styles: the empty state, where they are kept, and one primary action", () => {
    const html = render("en", <WorkshopPage />);
    expect(html).toContain("data-workshop-empty");
    expect(html).toContain(en.emptyTitle);
    expect(html).toContain(en.notPersistent);
    expect(html).toContain("data-workshop-new");
    expect(html.split(en.newStyle).length - 1).toBe(1);
  });

  test("speaks Indonesian", () => {
    expect(render("id", <WorkshopPage />)).toContain(id.emptyTitle);
  });
});

describe("workshop ultimates", () => {
  for (const language of ["en", "id"] as const) {
    const m = CATALOGS[language];
    const style = { id: "style-0001", name: "Sneaky", strategy: { ...evader, ultimate: "fullTank" as const }, updatedAt: 1 };
    const card = (nowMs: number) => render(language, <StyleCard style={style} full={false} nowMs={nowMs} onOpen={noop} onCopy={noop} onRename={noop} onDelete={noop} />);

    test(`the ${language} card links to its saved ultimate and the tag ends at release`, () => {
      const link = 'data-ultimate-link="fullTank" href="/catalogue?section=ultimates&amp;card=fullTank"';
      const before = card(ULTIMATES_FROM - 1);
      const after = card(ULTIMATES_FROM);
      expect(before).toContain(link);
      expect(before).toContain(`>${m.catalogue.ultimates.fullTank.name}<`);
      expect(before).toContain(m.catalogue.soon);
      expect(after).toContain(link);
      expect(after).not.toContain(m.catalogue.soon);
    });

    test(`the ${language} saved editor shows the fixed ultimate without a choice control`, () => {
      const library = { styles: [style], account: { kind: "deviceOnly" as const }, persistent: true, keptOnDevice: 0 };
      const html = render(language, <WorkshopEditor style={style} library={library} nowMs={ULTIMATES_FROM} onBack={noop} />);
      expect(html).toMatch(/data-workshop-ultimate[^>]*>.*?data-ultimate-link="fullTank"/);
      expect(html).toContain(m.workshop.ultimateFixed);
      expect(html).not.toContain("data-ultimate-picker");
      expect(html).not.toContain(m.workshop.chooseUltimate);
    });

    test(`the ${language} chooser has eight described radios and shows the current choice`, () => {
      const pick = (ultimate: StrategyInput["ultimate"] | null, problem: string | null) =>
        render(language, <ChooseUltimateStep ultimate={ultimate} problem={problem} nowMs={ULTIMATES_FROM - 1} onChoose={noop} onSave={noop} onBack={noop} />);
      const empty = pick(null, m.workshop.needUltimate);
      const radios = empty.match(/<input\b[^>]*type="radio"[^>]*>/g) ?? [];
      expect(radios).toHaveLength(8);
      expect(empty).not.toContain('checked=""');
      expect(empty).toContain(m.workshop.needUltimate);
      for (const ultimate of ULTIMATE_IDS) {
        const { name, body } = m.catalogue.ultimates[ultimate];
        expect(empty).toContain(`>${name}<`);
        expect(empty).toContain(`>${body}<`);
        const radio = radios.find((input) => input.includes(`value="${ultimate}"`)) ?? "";
        expect(radio).toMatch(/aria-labelledby="[^"]+"/);
        expect(radio).toMatch(/aria-describedby="[^"]+"/);
      }
      const chosen = pick(evader.ultimate, null);
      const selected = chosen.match(/<input\b[^>]*checked=""[^>]*>/g) ?? [];
      expect(selected).toHaveLength(1);
      expect(selected[0]).toContain(`value="${evader.ultimate}"`);
    });
  }
});
