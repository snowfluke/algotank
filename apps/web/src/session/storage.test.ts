/// <reference types="bun" />
import { describe, expect, test } from "bun:test";
import {
  clearPlayerSession,
  clearStrategyDraft,
  parseStrategyDraft,
  readStrategyDraft,
  saveStrategyDraft,
  parsePlayerSession,
  playerSessionKey,
  readPlayerSession,
  savePlayerSession,
  type KeyValueStore,
} from "./storage.ts";

function memoryStore(): KeyValueStore & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
}

const throwingStore: KeyValueStore = {
  getItem: () => {
    throw new Error("blocked");
  },
  setItem: () => {
    throw new Error("blocked");
  },
  removeItem: () => {
    throw new Error("blocked");
  },
};

describe("keys", () => {
  test("player keys differ per arena", () => {
    expect(playerSessionKey("a1")).not.toBe(playerSessionKey("a2"));
  });
});

describe("player session", () => {
  test("round-trips", () => {
    const store = memoryStore();
    savePlayerSession(store, "a1", { playerId: "p1", playerToken: "t1" });
    expect(readPlayerSession(store, "a1")).toEqual({ playerId: "p1", playerToken: "t1" });
    clearPlayerSession(store, "a1");
    expect(readPlayerSession(store, "a1")).toBeNull();
  });

  test("a corrupt or incomplete value counts as no session", () => {
    expect(parsePlayerSession("not json")).toBeNull();
    expect(parsePlayerSession('{"playerId":"p1"}')).toBeNull();
    expect(parsePlayerSession("null")).toBeNull();
    expect(parsePlayerSession(null)).toBeNull();
  });
});

describe("blocked storage", () => {
  test("reads give null and writes report failure", () => {
    expect(readPlayerSession(throwingStore, "a1")).toBeNull();
    expect(savePlayerSession(throwingStore, "a1", { playerId: "p", playerToken: "t" })).toBe(false);
    expect(savePlayerSession(null, "a1", { playerId: "p", playerToken: "t" })).toBe(false);
  });
});

describe("strategy draft", () => {
  const draft = { modes: [{ id: "m1" }], build: { reach: 1 } } as never;

  test("a saved draft is read back and clearing removes it", () => {
    const store = memoryStore();
    expect(saveStrategyDraft(store, "a1", draft)).toBe(true);
    expect(readStrategyDraft(store, "a1")).toEqual(draft);
    expect(readStrategyDraft(store, "a2")).toBeNull();
    clearStrategyDraft(store, "a1");
    expect(readStrategyDraft(store, "a1")).toBeNull();
  });

  test("a corrupt or foreign value counts as no draft", () => {
    expect(parseStrategyDraft("not json")).toBeNull();
    expect(parseStrategyDraft("[]")).toBeNull();
    expect(parseStrategyDraft('{"modes":"x","build":{}}')).toBeNull();
    expect(parseStrategyDraft('{"modes":[],"build":null}')).toBeNull();
    expect(parseStrategyDraft(null)).toBeNull();
  });

  test("blocked storage reports failure", () => {
    expect(saveStrategyDraft(throwingStore, "a1", draft)).toBe(false);
    expect(readStrategyDraft(throwingStore, "a1")).toBeNull();
  });
});
