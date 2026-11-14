/// <reference types="bun" />
import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { ARENA_LIMITS } from "@game/arena";
import { I18nProvider } from "../i18n/I18nProvider.tsx";
import { createLanguageStore } from "../i18n/language.ts";
import { CreateArenaPage } from "./CreateArenaPage.tsx";
import { createRequest, defaultValues, GAME_SPEED_IDS, GAME_SPEEDS, ROUND_LENGTH_IDS, ROUND_LENGTHS, ticksPerRound } from "./createRequest.ts";

describe("createRequest", () => {
  test("the defaults are normal speed, normal length and the same rules; bots on only for a private arena", () => {
    expect(createRequest(defaultValues("private", " Our fight "))).toEqual({
      kind: "private",
      settings: { name: "Our fight", ticksPerRound: 100, tickMs: 900, ruleSetMode: "standard", botFill: true, joinPolicy: "anyone", tankCount: 16 },
    });
    expect(defaultValues("presenter", "x")).toMatchObject({ botFill: false, tankCount: 512 });
  });

  test("the speeds are 1200, 900 and 600 ms per turn and the lengths 1, 1.5, 2, 3 and 5 minutes", () => {
    expect(GAME_SPEEDS).toEqual({ relaxed: 1200, normal: 900, fast: 600 });
    expect(ROUND_LENGTHS).toEqual({ one: 60, oneHalf: 90, two: 120, three: 180, five: 300 });
    expect(ticksPerRound("one", "relaxed")).toBe(50);
    expect(ticksPerRound("five", "fast")).toBe(500);
  });

  test("every speed and length gives a round the server accepts", () => {
    for (const speed of GAME_SPEED_IDS) {
      expect(GAME_SPEEDS[speed]).toBeGreaterThanOrEqual(ARENA_LIMITS.tickMsMin);
      for (const length of ROUND_LENGTH_IDS) {
        const ticks = ticksPerRound(length, speed);
        expect(ticks).toBeGreaterThanOrEqual(ARENA_LIMITS.ticksPerRoundMin);
        expect(ticks).toBeLessThanOrEqual(ARENA_LIMITS.ticksPerRoundMax);
      }
    }
  });
});

describe("CreateArenaPage", () => {
  test("asks the server who is signed in before it shows a form", () => {
    const html = renderToStaticMarkup(<CreateArenaPage kind="private" />);
    expect(html).toContain("Create a private arena");
    expect(html).toContain("Checking whether you are signed in.");
    expect(html).not.toContain("<form");
  });

  test("speaks Indonesian", () => {
    const store = createLanguageStore({ store: null, initial: "id" });
    const html = renderToStaticMarkup(<I18nProvider store={store}><CreateArenaPage kind="presenter" /></I18nProvider>);
    expect(html).toContain("Buat arena presenter");
  });
});
