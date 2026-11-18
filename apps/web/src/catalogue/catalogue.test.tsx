import { ULTIMATES_FROM } from "@game/arena";
import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { canThrow, ITEM_KINDS, PICKER_ORDER, RULE_SET_IDS, ruleSet, throwRange, waterAfterTick } from "@game/engine";
import { I18nProvider } from "../i18n/I18nProvider.tsx";
import { createLanguageStore } from "../i18n/language.ts";
import { paths } from "../app/route.ts";
import { CATALOGUE_SECTIONS, placeFromSearch, searchWithPlace, type CatalogueSection } from "./catalogue.tsx";
import { CatalogueView } from "./CataloguePage.tsx";
import { ULTIMATE_IDS } from "@game/engine";
import { CONDITION_SCENES, ITEM_SCENES, ULTIMATE_SCENES, type Scene } from "./scenes.ts";

const render = (section: CatalogueSection, language: "en" | "id" = "en", entry?: string, nowMs = ULTIMATES_FROM - 1) =>
  renderToStaticMarkup(
    <I18nProvider store={createLanguageStore({ store: null, initial: language })}>
      <CatalogueView nowMs={nowMs} initialSection={section} {...(entry === undefined ? {} : { initialEntry: entry })} />
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

  test("the ultimate tag and note disappear at the release time in both languages", () => {
    for (const section of CATALOGUE_SECTIONS) {
      expect(render(section).includes("data-catalogue-soon")).toBe(section === "ultimates");
    }
    for (const language of ["en", "id"] as const) {
      const soon = render("ultimates", language, "dash");
      expect(soon).toContain("data-catalogue-soon");
      expect(soon).toContain(language === "en" ? "not in the game yet" : "belum ada di permainan");
      expect(soon).toContain(language === "en" ? "Coming soon" : "Segera hadir");
      const released = render("ultimates", language, "dash", ULTIMATES_FROM);
      expect(released).not.toContain("data-catalogue-soon");
      expect(released).not.toContain(language === "en" ? "not in the game yet" : "belum ada di permainan");
      expect(released).toContain(language === "en" ? "starts with this ultimate" : "memulai dengan jurus ini");
    }
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

describe("catalogue scenes follow the arena's rules", () => {
  // Ultimate turns carry fires and can spend different amounts of water (85-ultimates.md).
  const ruled: [string, Scene][] = [...Object.entries(ITEM_SCENES), ...Object.entries(CONDITION_SCENES)];

  test("every shot is in range, and the water after each turn is what the engine leaves", () => {
    for (const [name, scene] of ruled) {
      scene.steps.forEach(({ snapshot, throws }, index) => {
        const rules = ruleSet(snapshot.ruleSetId);
        const before = index === 0 ? null : scene.steps[index - 1]!.snapshot;
        for (const shot of throws) {
          if (shot.outcome === "empty") continue;
          expect(shot.distance, `${name} step ${index}`).toBeLessThanOrEqual(throwRange({ reach: 0, aim: 0, dodge: 0 }, rules));
        }
        if (before === null) return;
        for (const tank of snapshot.bots) {
          const was = before.bots.find((b) => b.id === tank.id);
          if (was === undefined) continue;
          const shot = throws.find((t) => t.throwerId === tank.id);
          if (shot?.outcome === "dry") expect(canThrow(was.water, rules), `${name} step ${index}: a dry shot with water`).toBe(false);
          const spent = shot !== undefined && (shot.outcome === "hit" || shot.outcome === "miss" || shot.outcome === "blocked");
          expect(tank.water, `${name} step ${index}, tank ${tank.id}`).toBe(waterAfterTick(was.water, spent, rules));
        }
      });
    }
  });

  test("Splash ring empties the source and transfers two points for each of its eight hits", () => {
    const { steps, keyStep } = ULTIMATE_SCENES.splash;
    const [source, ...targets] = steps[keyStep]!.snapshot.bots;
    expect(source).toMatchObject({ id: "you", score: 16, water: 0 });
    expect(targets.map(({ score }) => score)).toEqual(Array(8).fill(-2));
    expect(steps[keyStep + 1]!.snapshot.bots[0]?.water).toBe(ruleSet("standard").waterRefillPerTick);
  });

  test("the Whirlwind scene shows four right turns and clears the effect on the last", () => {
    const { steps, keyStep } = ULTIMATE_SCENES.whirlwind;
    const caught = steps.slice(keyStep).map(({ snapshot }) => snapshot.bots.find(({ id }) => id === "c")!);
    expect(caught.map(({ direction }) => direction)).toEqual(["N", "E", "S", "W", "N"]);
    expect(caught.map(({ effect }) => effect?.kind === "dizzy" ? effect.spinTurnsLeft : null)).toEqual([4, 3, 2, 1, null]);
  });
});

describe("the catalogue's address", () => {
  test("a place survives the trip through the address, and other values stay", () => {
    const search = searchWithPlace("?lang=id", { section: "items", card: "umbrella" });
    expect(new URLSearchParams(search).get("lang")).toBe("id");
    expect(placeFromSearch(search)).toEqual({ section: "items", card: "umbrella" });
  });

  test("an unknown collection or a card of another collection falls back", () => {
    expect(placeFromSearch("?section=weapons&card=umbrella")).toEqual({ section: "playStyles", card: null });
    expect(placeFromSearch("?section=items&card=dash")).toEqual({ section: "items", card: null });
  });

  test("the app's link to a collection opens that collection", () => {
    expect(placeFromSearch(new URL(paths.catalogue("items"), "https://x").search)).toEqual({ section: "items", card: null });
  });
});
