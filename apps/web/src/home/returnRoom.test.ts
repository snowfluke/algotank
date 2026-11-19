/// <reference types="bun" />
import { plainTankLook, type PublicArena } from "@game/arena";
import { describe, expect, test } from "bun:test";
import { clearLastRoom, readLastRoom, saveLastRoom, type KeyValueStore } from "../session/storage.ts";
import { TEST_SETTINGS } from "../stream/fixtures.ts";
import { returnRoomOf } from "./returnRoom.ts";

const arena: PublicArena = {
  id: "4MBTMC",
  settings: { ...TEST_SETTINGS, kind: "tournament", name: "" },
  players: [{ id: "p1", name: "Ana", status: { kind: "playing" }, isBot: false, ready: false, look: plainTankLook(1) }],
  phase: { kind: "lobby", nextRuleSetId: "standard", start: { kind: "waiting" } },
  rounds: [],
  game: 1,
  auto: null,
  nextGameInMs: null,
  chat: null,
};

function memoryStore(): KeyValueStore {
  const values = new Map<string, string>();
  return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => void values.set(key, value), removeItem: (key) => void values.delete(key) };
}

describe("the way back to a room from Home", () => {
  test("is offered while this browser's tank still sits in the room", () => {
    expect(returnRoomOf(arena, "p1")).toEqual({ id: "4MBTMC", settings: arena.settings });
  });

  test("is not offered once the tank has left or been removed", () => {
    expect(returnRoomOf(arena, "p2")).toBeNull();
  });

  test("remembers the last room the browser sat in, until it is cleared", () => {
    const store = memoryStore();
    expect(readLastRoom(store)).toBeNull();
    saveLastRoom(store, "A1");
    saveLastRoom(store, "B2");
    expect(readLastRoom(store)).toBe("B2");
    clearLastRoom(store);
    expect(readLastRoom(store)).toBeNull();
  });
});
