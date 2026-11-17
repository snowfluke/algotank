import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { ITEM_KINDS, PICKER_ORDER, RULE_SET_IDS } from "@game/engine";
import { I18nProvider } from "../i18n/I18nProvider.tsx";
import { createLanguageStore } from "../i18n/language.ts";
import { CATALOGUE_SECTIONS, type CatalogueSection } from "./catalogue.tsx";
import { CatalogueView } from "./CataloguePage.tsx";
import { ULTIMATE_IDS } from "./messages.ts";
import { CONDITION_SCENES, ITEM_SCENES, ULTIMATE_SCENES, type Scene } from "./scenes.ts";

const render = (section: CatalogueSection, language: "en" | "id" = "en", entry?: string) =>
  renderToStaticMarkup(
    <I18nProvider store={createLanguageStore({ store: null, initial: language })}>
      <CatalogueView initialSection={section} {...(entry === undefined ? {} : { initialEntry: entry })} />
    </I18nProvider>,
  );

const cards = (html: string) => [...html.matchAll(/data-catalogue-card="([^"]+)"/g)].map((match) => match[1]);

describe("CatalogueView", () => {
  test("each section lists every play style, item, arena condition and ultimate the game names", () => {
    expect(cards(render("playStyles"))).toEqual([...PICKER_ORDER]);
    expect(cards(render("items"))).toEqual([...ITEM_KINDS]);
    expect(cards(render("conditions"))).toEqual([...RULE_SET_IDS]);
    expect(cards(render("ultimates"))).toEqual([...ULTIMATE_IDS]);
  });

  test("only the ultimates carry the coming-soon tag, in both languages", () => {
    for (const section of CATALOGUE_SECTIONS) {
      expect(render(section).includes("data-catalogue-soon")).toBe(section === "ultimates");
    }
    expect(render("ultimates", "id")).toContain("Segera hadir");
  });

  test("the chosen card's name and the game's own sentence head the stage", () => {
    const html = render("items", "en", "umbrella");
    expect(html).toContain('data-catalogue-entry="umbrella"');
    expect(html).toContain("The umbrella opens and stops the next 2 hits on its tank");
  });
});

describe("catalogue scenes", () => {
  const all: [string, Scene][] = [...Object.entries(ITEM_SCENES), ...Object.entries(CONDITION_SCENES), ...Object.entries(ULTIMATE_SCENES)];

  test("every item, condition and ultimate has a scene", () => {
    expect(Object.keys(ITEM_SCENES).sort()).toEqual([...ITEM_KINDS].sort());
    expect(Object.keys(CONDITION_SCENES).sort()).toEqual([...RULE_SET_IDS].sort());
    expect(Object.keys(ULTIMATE_SCENES).sort()).toEqual([...ULTIMATE_IDS].sort());
  });

  test("each scene keeps its tanks and items on the board, and its key step exists", () => {
    for (const [name, scene] of all) {
      expect(scene.keyStep, name).toBeLessThan(scene.steps.length);
      for (const { snapshot } of scene.steps) {
        for (const thing of [...snapshot.bots, ...snapshot.items]) {
          expect(thing.x >= 0 && thing.x < snapshot.width && thing.y >= 0 && thing.y < snapshot.height, `${name} at ${thing.x},${thing.y}`).toBe(true);
        }
        const squares = snapshot.bots.map((bot) => `${bot.x},${bot.y}`);
        expect(new Set(squares).size, `${name}: two tanks on one square`).toBe(squares.length);
      }
    }
  });
});
