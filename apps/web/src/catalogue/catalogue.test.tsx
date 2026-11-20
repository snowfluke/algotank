import { ULTIMATES_FROM } from "@game/arena";
import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { canThrow, ITEM_KINDS, PICKER_ORDER, RULE_SET_IDS, ruleSet, throwRange, waterAfterTick } from "@game/engine";
import { I18nProvider } from "../i18n/I18nProvider.tsx";
import { createLanguageStore } from "../i18n/language.ts";
import { paths } from "../app/route.ts";
import { ArenaBoard } from "../board/ArenaBoard.tsx";
import { CATALOGUE_SECTIONS, musicConditionOf, placeFromSearch, searchWithPlace, type CatalogueSection } from "./catalogue.tsx";
import { CatalogueView } from "./CataloguePage.tsx";
import { guideItems, type GuidePart } from "./RulesGuide.tsx";
import { partFromSearch } from "./RulesPage.tsx";
import { CATALOGS } from "../i18n/catalog.ts";
import { ACTION_IDS, CONDITION_IDS, TARGET_IDS } from "@game/engine";
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

  test("the ultimate tag disappears at the release time, and an ultimate card has one description", () => {
    for (const section of CATALOGUE_SECTIONS) {
      expect(render(section).includes("data-catalogue-soon")).toBe(section === "ultimates");
    }
    for (const language of ["en", "id"] as const) {
      const soon = render("ultimates", language, "dash");
      expect(soon).toContain("data-catalogue-soon");
      expect(soon).toContain(language === "en" ? "Coming soon" : "Segera hadir");
      const released = render("ultimates", language, "dash", ULTIMATES_FROM);
      expect(released).not.toContain("data-catalogue-soon");
      // Owner, 2026-11-19: "so much description". The card keeps its body and drops the second paragraph.
      expect(released).not.toContain(language === "en" ? "starts with this ultimate" : "memulai dengan jurus ini");
    }
  });

  test("the chosen card's name and its short sentence head the stage", () => {
    const html = render("items", "en", "umbrella");
    expect(html).toContain('data-catalogue-entry="umbrella"');
    expect(html).toContain("Stops the next 2 shots at your tank.");
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

  test("Smoke draws a bent jet, splashes the neighbour and gives the smoked tank the point", () => {
    const { steps, keyStep } = ULTIMATE_SCENES.smoke;
    const { snapshot, throws, fires } = steps[keyStep]!;
    expect(snapshot.bots.map(({ id, score, wasHit }) => [id, score, wasHit])).toEqual([
      ["you", 1, false], ["a", 0, false], ["b", -1, true],
    ]);
    const afterMove = { ...snapshot, bots: snapshot.bots.map((bot) => bot.id === "b" ? { ...bot, x: 4 } : bot) };
    const html = renderToStaticMarkup(<ArenaBoard snapshot={afterMove} throws={throws} fires={fires} names={{}} highlightId="you" tickMs={900} />);
    expect(html).toContain('data-ultimate-smoke="you"');
    expect(html).toMatch(/data-throw="deflected".*?<path d="M[^"]+Q[^"]+ 35 14\.2Q[^"]+"/);
    expect(html).toContain('data-mark="hit" transform="translate(35 24.2)"');
    expect(html).toMatch(/transform="translate\(38 [^"]+"[^>]*><text[^>]*>\+1<\/text>/);
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

describe("the catalogue's music", () => {
  test("follows an open arena condition card, and plays the standard track for any other card", () => {
    expect(musicConditionOf("conditions", "downpour")).toBe("downpour");
    expect(musicConditionOf("conditions", "sharp-eyes")).toBe("sharp-eyes");
    expect(musicConditionOf("ultimates", "dash")).toBeNull();
    expect(musicConditionOf("items", "umbrella")).toBeNull();
    expect(musicConditionOf("conditions", undefined)).toBeNull();
  });
});

describe("the rules guide (RulesGuide.tsx)", () => {
  test("names every condition, action and tank a rule can aim at, each once, with every answer of each dropdown", () => {
    for (const language of ["en", "id"] as const) {
      const m = CATALOGS[language];
      const keys = (part: GuidePart) => guideItems(m, part, true).map((item) => item.key);
      expect(keys("when").sort()).toEqual([...CONDITION_IDS].sort());
      // "Wait" is a step of a sequence only, as in the editor's one-action picker; "Steps in order" is under More options.
      expect(keys("do").sort()).toEqual(ACTION_IDS.filter((id) => id !== "wait").sort());
      expect(keys("targets")).toEqual([...TARGET_IDS]);
      const place = guideItems(m, "do", true).find((item) => item.key === "goToPlace");
      expect(place?.choices[0]?.answers).toContain(m.vocabulary.options.place.cornerAwayFromLeader);
      // A group's heading rides on its first row, so no page ends on a heading alone.
      expect(guideItems(m, "when", true)[0]?.heading?.name).toBe(m.vocabulary.conditionGroups.otherTanks);
      expect(keys("more")).toEqual(["match", "negate", "steps", "chance", "switch", "modes", "fallback"]);
    }
  });

  test("opens on the part the address names, and the first part for anything else", () => {
    expect(partFromSearch("?part=targets")).toBe("targets");
    expect(partFromSearch("?part=nonsense")).toBe("when");
    expect(partFromSearch("")).toBe("when");
  });
});
