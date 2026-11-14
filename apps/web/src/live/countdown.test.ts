/// <reference types="bun" />
import { describe, expect, test } from "bun:test";
import { en, id } from "../results/messages.ts";
import { en as liveEn } from "./messages.ts";
import { ownStatusSentence } from "./OwnStatus.tsx";
import { secondsUntil } from "./countdown.ts";

describe("secondsUntil", () => {
  test("rounds up whole seconds and gives null once the time has passed or is unknown", () => {
    expect(secondsUntil(13_000, 10_000)).toBe(3);
    expect(secondsUntil(13_000, 10_001)).toBe(3);
    expect(secondsUntil(13_000, 12_999)).toBe(1);
    expect(secondsUntil(13_000, 13_000)).toBeNull();
    expect(secondsUntil(null, 0)).toBeNull();
  });
});

describe("ordinal", () => {
  test("English endings, and the plain number in Indonesian", () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 101].map(en.ordinal)).toEqual(["1st", "2nd", "3rd", "4th", "11th", "12th", "13th", "21st", "22nd", "23rd", "101st"]);
    expect(id.ordinal(3)).toBe("3");
  });
});

describe("ownStatusSentence", () => {
  const own = { place: 3, tied: false, of: 9, score: 2, water: 6, waterCapacity: 9, canShoot: true, hitsLanded: 2, hitsTaken: 0 };
  const say = (outlook: Parameters<typeof ownStatusSentence>[0]["outlook"], tied = false) =>
    ownStatusSentence({ ...own, tied, outlook }, liveEn.status, en.ordinal);

  test("one sentence per outlook", () => {
    expect(say({ kind: "through" })).toBe("You are 3rd of 9, so right now you go through.");
    expect(say({ kind: "out" }, true)).toBe("You share 3rd place of 9 and below the cut line right now, so every hit counts.");
    expect(say({ kind: "onLine" })).toContain("More hits decide who goes through");
    expect(say({ kind: "allThrough" })).toBe("You are 3rd of 9, and every tank goes through this round.");
    expect(say({ kind: "leading", shared: false })).toBe("You lead the final, so hold on until the last turn.");
    expect(say({ kind: "chasing", behind: 1 })).toBe("You are 3rd of 9 in the final and 1 point behind the leader.");
  });
});
