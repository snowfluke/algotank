/// <reference types="bun" />
import { describe, expect, test } from "bun:test";
import type { ThrowEvent } from "@game/engine";
import { countdownSound, playsTurnSounds, turnSounds } from "./turnSounds.ts";

const hit: ThrowEvent = { throwerId: "a", outcome: "hit", targetId: "b", distance: 1, hitChance: 90 };
const miss: ThrowEvent = { throwerId: "c", outcome: "miss", targetId: "d", distance: 2, hitChance: 60 };
const empty: ThrowEvent = { throwerId: "e", outcome: "empty" };
const dry: ThrowEvent = { throwerId: "f", outcome: "dry", targetId: "g", distance: 1 };

describe("turnSounds for a viewer without a tank in the round (big screen, presenter, spectator)", () => {
  test("a quiet turn makes no sound", () => {
    expect(turnSounds([], null)).toEqual([]);
  });

  test("a hit is a shot and a splash, and the splash covers misses in the same turn", () => {
    expect(turnSounds([hit], null)).toEqual(["shot", "splash"]);
    expect(turnSounds([miss, hit, empty], null)).toEqual(["shot", "splash"]);
  });

  test("a miss or a shot into nothing is a shot and the miss sound", () => {
    expect(turnSounds([miss], null)).toEqual(["shot", "miss"]);
    expect(turnSounds([empty], null)).toEqual(["shot", "miss"]);
  });

  test("a throw an umbrella blocked is a shot and the miss sound, and a tank saved by its umbrella hears no splash", () => {
    const blocked: ThrowEvent = { throwerId: "a", outcome: "blocked", targetId: "b", distance: 1, hitChance: 90 };
    expect(turnSounds([blocked], null)).toEqual(["shot", "miss"]);
    expect(turnSounds([blocked], "a")).toEqual(["shot", "miss"]);
    expect(turnSounds([blocked], "b")).toEqual([]);
  });

  test("a dry shot alone makes only the dry sound, because no water left the nozzle", () => {
    expect(turnSounds([dry], null)).toEqual(["dry"]);
  });

  test("64 tanks shooting in one turn still make at most three sounds", () => {
    const many = Array.from({ length: 64 }, (_, i) => [hit, miss, empty, dry][i % 4] as ThrowEvent);
    expect(turnSounds(many, null)).toEqual(["shot", "splash", "dry"]);
  });
});

describe("turnSounds for a player with a tank in the round (room page, test match)", () => {
  const all = [hit, miss, empty, dry];

  test("shots of other tanks make no sound", () => {
    expect(turnSounds(all, "z")).toEqual([]);
  });

  test("the own tank landing a hit is a shot and a splash", () => {
    expect(turnSounds(all, "a")).toEqual(["shot", "splash"]);
  });

  test("the own tank being hit is a splash without a shot, because it did not shoot", () => {
    expect(turnSounds(all, "b")).toEqual(["splash"]);
  });

  test("the own tank missing, or shooting into nothing, is a shot and the miss sound", () => {
    expect(turnSounds(all, "c")).toEqual(["shot", "miss"]);
    expect(turnSounds(all, "e")).toEqual(["shot", "miss"]);
  });

  test("a miss aimed at the own tank makes no sound, because nothing reached it", () => {
    expect(turnSounds(all, "d")).toEqual([]);
  });

  test("the own dry shot is the dry sound, and another tank's dry shot at it is silent", () => {
    expect(turnSounds(all, "f")).toEqual(["dry"]);
    expect(turnSounds(all, "g")).toEqual([]);
  });

  test("the own tank missing while it is hit is a shot and a splash", () => {
    const shotAndHit: ThrowEvent = { throwerId: "b", outcome: "miss", targetId: "x", distance: 3, hitChance: 40 };
    expect(turnSounds([hit, shotAndHit], "b")).toEqual(["shot", "splash"]);
  });
});

describe("playsTurnSounds", () => {
  test("only the turn right after the one shown plays", () => {
    expect(playsTurnSounds(4, 5)).toBe(true);
    expect(playsTurnSounds(null, 5)).toBe(false);
    expect(playsTurnSounds(4, 9)).toBe(false);
    expect(playsTurnSounds(5, 4)).toBe(false);
    expect(playsTurnSounds(5, 5)).toBe(false);
  });
});

describe("countdownSound", () => {
  test("each new number beeps and the end of the countdown starts the round", () => {
    expect(countdownSound(null, 3)).toBe("countdown");
    expect(countdownSound(3, 2)).toBe("countdown");
    expect(countdownSound(2, 2)).toBeNull();
    expect(countdownSound(1, null)).toBe("roundStart");
    expect(countdownSound(1, 0)).toBe("roundStart");
    expect(countdownSound(null, null)).toBeNull();
  });
});
