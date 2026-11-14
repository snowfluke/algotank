/// <reference types="bun" />
import { describe, expect, test } from "bun:test";
import { BUILD_BUDGET } from "@game/engine";
import { en, id } from "./messages.ts";
import { PHASE_MARGIN_SECONDS, PROGRESS_ON_SCREEN, PUBLIC_PHASE_SECONDS, readingSeconds, timedParts, TOUR_LENGTHS, tourSteps, wordCount, type TourId } from "./tours.ts";

const LANGUAGES = { en, id };
const TOURS: readonly TourId[] = ["workshop", "lobby", "round", "result", "home"];

describe("the steps' words", () => {
  test("every step of every tour and variant is one sentence of at most 15 words, in both languages", () => {
    for (const text of [en, id]) {
      for (const [key, step] of Object.entries(text.steps)) {
        if (key === "homeCue") continue; // The home page's cue is the spec's own two-sentence line, not a tour step.
        expect({ key, words: wordCount(step.text) <= 15 }).toEqual({ key, words: true });
        expect({ key, sentences: step.text.split(/[.?!](\s|$)/).filter((s) => s.trim().length > 1).length }).toEqual({ key, sentences: 1 });
      }
    }
  });

  test("the word algorithm is used once, where the rules list is introduced", () => {
    const uses = Object.entries(en.steps).filter(([, step]) => /algorithm/i.test(step.text)).map(([key]) => key);
    expect(uses).toEqual(["workshopAlgorithm"]);
    expect(Object.entries(id.steps).filter(([, step]) => /algoritma/i.test(step.text)).map(([key]) => key)).toEqual(["workshopAlgorithm"]);
  });

  test("every tour has the length its stored steps are checked against, in every variant", () => {
    for (const tour of TOURS) {
      for (const lobbyStart of ["public", "owner", "guest"] as const) expect(tourSteps(tour, { lobbyStart }).length).toBe(TOUR_LENGTHS[tour]);
    }
  });
});

describe("a tour never fights the clock (section 2b)", () => {
  test("reading time is 4 s plus 0.5 s per word", () => {
    expect(readingSeconds("one two three four")).toBe(6);
  });

  // The shortest occurrence of each phase a timed tour runs in, from apps/server/src/public-kinds.ts.
  const shortestLobby = Math.min(PUBLIC_PHASE_SECONDS.practice.lobby, PUBLIC_PHASE_SECONDS.tournament.lobby);
  const shortestRound = Math.min(PUBLIC_PHASE_SECONDS.practice.round, PUBLIC_PHASE_SECONDS.tournament.round);

  test("the real lengths are the server's: lobby 30 s, round 54 s, practice result 20 s", () => {
    expect([shortestLobby, shortestRound, PUBLIC_PHASE_SECONDS.practice.result]).toEqual([30, 54, 20]);
  });

  for (const [language, text] of Object.entries(LANGUAGES)) {
    test(`${language}: each part of the public lobby tour fits a 30 s lobby minus 5 s`, () => {
      const parts = timedParts(tourSteps("lobby", { lobbyStart: "public" }));
      expect(parts.map((part) => part.map((step) => step.key))).toEqual([
        ["lobbyTank", "lobbyPlays"],
        ["lobbyStyleBetter", "lobbyStartPublic"],
      ]);
      for (const part of parts) {
        const seconds = part.reduce((sum, step) => sum + readingSeconds(text.steps[step.key].text), 0);
        expect(seconds).toBeLessThanOrEqual(shortestLobby - PHASE_MARGIN_SECONDS);
      }
    });

    test(`${language}: the round tour fits a 54 s round minus 5 s in one part`, () => {
      const parts = timedParts(tourSteps("round"));
      expect(parts.length).toBe(1);
      const seconds = (parts[0] ?? []).reduce((sum, step) => sum + readingSeconds(text.steps[step.key].text), 0);
      expect(seconds).toBeLessThanOrEqual(shortestRound - PHASE_MARGIN_SECONDS);
    });

    test(`${language}: a 20 s practice result cannot hold the whole result tour, so it is for arenas without a result clock`, () => {
      const room = PUBLIC_PHASE_SECONDS.practice.result - PHASE_MARGIN_SECONDS;
      const seconds = tourSteps("result").reduce((sum, step) => sum + readingSeconds(text.steps[step.key].text), 0);
      expect(seconds).toBeGreaterThan(room);
    });
  }
});

describe("the workshop tour after W2", () => {
  test("its callout has no step counter, because the checklist on the same screen counts the progress", () => {
    expect([...PROGRESS_ON_SCREEN]).toEqual(["workshop"]);
  });

  test("it has at most 10 steps, starts on Rules, and its upgrades step points at the tray with the real budget", () => {
    const steps = tourSteps("workshop");
    expect(steps.length).toBeLessThanOrEqual(10);
    expect(steps[2]?.key).toBe("workshopAlgorithm");
    const upgrades = steps.find((step) => step.key === "workshopUpgrades");
    expect(upgrades?.targets).toEqual(["[data-upgrade-tray]"]);
    for (const text of [en, id]) expect(text.steps.workshopUpgrades.text).toContain(String(BUILD_BUDGET));
  });

  test("inside a condition, the step that asks for a change points at the whole editor, so its callout never covers the controls", () => {
    expect(tourSteps("workshop").find((step) => step.key === "workshopChange")?.targets).toContain('[data-coach="condition-edit"]');
  });
});
