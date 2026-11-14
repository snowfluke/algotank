/// <reference types="bun" />
import { describe, expect, test } from "bun:test";
import { DEFAULT_PRESET_ID, PRESETS } from "@game/engine";
import { PREFERENCE_KEYS } from "../app/preferences.ts";
import { clearNewSeat, isNewSeat, saveNewSeat, type KeyValueStore } from "../session/storage.ts";
import { parseLastStyle, readPlayWithRequest, requestPlayWith, settleStartStyle, startStyleDecision, type StartStyleInput } from "./lastStyle.ts";

const fallback = PRESETS.find((preset) => preset.id === DEFAULT_PRESET_ID)?.strategy;
const other = PRESETS.find((preset) => preset.id !== DEFAULT_PRESET_ID);
if (fallback === undefined || other === undefined) throw new Error("the engine needs two play styles");
const mine = { id: "s1", name: "Ayu's splasher", strategy: other.strategy, updatedAt: 1 };
const broken = { id: "s2", name: "Broken", strategy: { ...fallback, modes: [] }, updatedAt: 1 };
const newSeat: StartStyleInput = { newSeat: true, loaded: true, canSave: true, dirty: false, last: { kind: "builtIn", id: other.id }, requested: null, styles: [mine, broken] };

function memoryStore(): KeyValueStore {
  const values = new Map<string, string>();
  return { getItem: (k) => values.get(k) ?? null, setItem: (k, v) => void values.set(k, v), removeItem: (k) => void values.delete(k) };
}

describe("the play style used last", () => {
  test("is stored as a built-in style or one of mine, and anything else reads as none", () => {
    expect(parseLastStyle(JSON.stringify({ kind: "builtIn", id: other.id }))).toEqual({ kind: "builtIn", id: other.id });
    expect(parseLastStyle(JSON.stringify({ kind: "mine", id: "s1" }))).toEqual({ kind: "mine", id: "s1" });
    expect(parseLastStyle(JSON.stringify({ kind: "builtIn", id: "no-such-style" }))).toBeNull();
    expect(parseLastStyle("s1")).toBeNull();
    expect(parseLastStyle(null)).toBeNull();
  });
});

describe("a new seat starts with the play style used last", () => {
  test("a built-in style and one of mine are applied", () => {
    expect(startStyleDecision(newSeat)).toEqual({ kind: "apply", strategy: other.strategy });
    expect(startStyleDecision({ ...newSeat, last: { kind: "mine", id: "s1" } })).toEqual({ kind: "apply", strategy: mine.strategy });
  });

  test("a seat that is not new is never changed, so a reload or the next lobby keeps what the player did", () => {
    expect(startStyleDecision({ ...newSeat, newSeat: false })).toEqual({ kind: "none" });
  });

  test("it waits for the strategy to load and for a phase in which the server accepts a save", () => {
    expect(startStyleDecision({ ...newSeat, loaded: false })).toEqual({ kind: "wait" });
    expect(startStyleDecision({ ...newSeat, canSave: false })).toEqual({ kind: "wait" });
  });

  test("a tank the player already changed, no remembered style, or one that is gone or broken keeps what it has", () => {
    expect(startStyleDecision({ ...newSeat, dirty: true })).toEqual({ kind: "keep" });
    expect(startStyleDecision({ ...newSeat, last: null })).toEqual({ kind: "keep" });
    expect(startStyleDecision({ ...newSeat, last: { kind: "mine", id: "gone" } })).toEqual({ kind: "keep" });
    expect(startStyleDecision({ ...newSeat, last: { kind: "mine", id: "s2" } })).toEqual({ kind: "keep" });
  });

  test("every join marks its seat new until the room has given it the style", () => {
    const store = memoryStore();
    expect(saveNewSeat(store, "ABC123", { playerId: "p1", playerToken: "t1" })).toBe(true);
    expect(isNewSeat(store, "ABC123", "p1")).toBe(true);
    // A seat taken later in the same arena (a join again) is new; the older one is not.
    saveNewSeat(store, "ABC123", { playerId: "p2", playerToken: "t2" });
    expect(isNewSeat(store, "ABC123", "p1")).toBe(false);
    expect(isNewSeat(store, "ABC123", "p2")).toBe(true);
    clearNewSeat(store, "ABC123");
    expect(isNewSeat(store, "ABC123", "p2")).toBe(false);
  });
});

describe('"Play now with it" asks the next room for its play style, new seat or not', () => {
  // A player back from the workshop to the practice seat they still hold: the seat is not new.
  const held: StartStyleInput = { ...newSeat, newSeat: false, last: { kind: "mine", id: "s1" }, requested: { kind: "mine", id: "s1" } };

  test("a held seat gets the requested style", () => {
    expect(startStyleDecision(held)).toEqual({ kind: "apply", strategy: mine.strategy });
  });

  test("a draft the player changed before still gets the requested style", () => {
    expect(startStyleDecision({ ...held, dirty: true })).toEqual({ kind: "apply", strategy: mine.strategy });
    expect(startStyleDecision({ ...held, newSeat: true, dirty: true })).toEqual({ kind: "apply", strategy: mine.strategy });
  });

  test("while the tank plays in a running round it waits, and applies when a save is accepted again", () => {
    expect(startStyleDecision({ ...held, canSave: false })).toEqual({ kind: "wait" });
    expect(startStyleDecision({ ...held, loaded: false })).toEqual({ kind: "wait" });
    expect(startStyleDecision(held)).toEqual({ kind: "apply", strategy: mine.strategy });
  });

  test("the request is gone once a room has applied it, so the next lobby keeps what the player does", () => {
    const store = memoryStore();
    requestPlayWith({ kind: "mine", id: "s1" }, store);
    const input = (): StartStyleInput => ({ ...held, requested: readPlayWithRequest(store) });
    expect(startStyleDecision(input())).toEqual({ kind: "apply", strategy: mine.strategy });
    settleStartStyle(store, "ABC123");
    expect(readPlayWithRequest(store)).toBeNull();
    expect(startStyleDecision(input())).toEqual({ kind: "none" });
  });

  test("without a request a held seat is never changed", () => {
    expect(startStyleDecision({ ...held, requested: null })).toEqual({ kind: "none" });
    expect(startStyleDecision({ ...held, requested: null, dirty: true })).toEqual({ kind: "none" });
  });

  test("a requested style that is gone or broken is dropped: a held seat keeps its tank, a new seat follows the style used last", () => {
    expect(startStyleDecision({ ...held, requested: { kind: "mine", id: "gone" } })).toEqual({ kind: "keep" });
    expect(startStyleDecision({ ...held, requested: { kind: "mine", id: "s2" } })).toEqual({ kind: "keep" });
    expect(startStyleDecision({ ...newSeat, requested: { kind: "mine", id: "gone" } })).toEqual({ kind: "apply", strategy: other.strategy });
  });

  test("a built-in style can be requested too, and the request is also the style used last", () => {
    const store = memoryStore();
    requestPlayWith({ kind: "builtIn", id: other.id }, store);
    expect(readPlayWithRequest(store)).toEqual({ kind: "builtIn", id: other.id });
    expect(parseLastStyle(store.getItem(PREFERENCE_KEYS.lastStyle))).toEqual({ kind: "builtIn", id: other.id });
    expect(startStyleDecision({ ...held, requested: readPlayWithRequest(store) })).toEqual({ kind: "apply", strategy: other.strategy });
  });
});
