import { describe, expect, test } from "bun:test";
import { closeMonth } from "./month-close.ts";

/** League `league`'s tanks, best first: "1-1", "1-2", ... */
const league = (league: number, size: number): string[] => Array.from({ length: size }, (_, i) => `${league}-${i + 1}`);

describe("closeMonth", () => {
  test("with one league nothing moves", () => {
    const result = closeMonth([league(1, 16)], 16);
    expect(result.leagues).toEqual([league(1, 16)]);
    expect([...result.moves.values()].every((m) => m.kind === "stayed" && m.from === 1 && m.to === 1)).toBe(true);
  });

  test("two full leagues: the lower 8 of League 1 and the upper 8 of League 2 change places", () => {
    const result = closeMonth([league(1, 16), league(2, 16)], 16);
    expect(result.leagues[0]).toEqual([...league(1, 8), ...league(2, 8)]);
    expect(result.leagues[1]).toEqual([...league(1, 16).slice(8), ...league(2, 16).slice(8)]);
    expect(result.moves.get("1-9")).toEqual({ from: 1, to: 2, kind: "down" });
    expect(result.moves.get("2-1")).toEqual({ from: 2, to: 1, kind: "up" });
    expect(result.moves.get("1-8")?.kind).toBe("stayed");
    expect(result.moves.get("2-16")?.kind).toBe("stayed");
  });

  test("16 and 5 seats: 2 move each way, and the last league keeps the free seats", () => {
    const result = closeMonth([league(1, 16), league(2, 5)], 16);
    expect(result.leagues[0]).toEqual([...league(1, 14), "2-1", "2-2"]);
    expect(result.leagues[1]).toEqual(["1-15", "1-16", "2-3", "2-4", "2-5"]);
  });

  test("three leagues: a middle league sends its top up and its bottom down, sized per pair", () => {
    const result = closeMonth([league(1, 16), league(2, 16), league(3, 3)], 16);
    // League 1 and 2: 8 each way. League 2 and 3: the smaller half is 1.
    expect(result.leagues[0]).toEqual([...league(1, 8), ...league(2, 8)]);
    expect(result.leagues[1]).toEqual([...league(1, 16).slice(8), ...league(2, 15).slice(8), "3-1"]);
    expect(result.leagues[2]).toEqual(["2-16", "3-2", "3-3"]);
    expect(result.moves.get("2-16")).toEqual({ from: 2, to: 3, kind: "down" });
    expect(result.moves.get("3-1")).toEqual({ from: 3, to: 2, kind: "up" });
  });

  test("free seats in an upper league are filled from the league below, its own tanks first", () => {
    // League 1 lost 6 tanks by quits: 10 and 16 give 5 each way, then 6 more come up from League 2.
    const result = closeMonth([league(1, 10), league(2, 16)], 16);
    expect(result.leagues[0]).toEqual([...league(1, 5), ...league(2, 11)]);
    expect(result.leagues[1]).toEqual([...league(1, 10).slice(5), ...league(2, 16).slice(11)]);
    expect(result.moves.get("1-6")?.kind).toBe("down");
    expect(result.moves.get("2-11")?.kind).toBe("up");
  });

  test("an empty league closes and the one below moves up to fill", () => {
    const result = closeMonth([league(1, 4), [], league(3, 2)], 16);
    // 4 and 0: nobody to exchange. 0 and 2: the smaller half is 0. Then League 1 fills from League 3.
    expect(result.leagues).toEqual([[...league(1, 4), ...league(3, 2)]]);
    expect(result.moves.get("3-1")).toEqual({ from: 3, to: 1, kind: "up" });
  });

  test("an uneven pair of small leagues: 3 and 3 move 1 each way and fill into one", () => {
    const result = closeMonth([league(1, 3), league(2, 3)], 16);
    expect(result.leagues).toEqual([["1-1", "1-2", "1-3", "2-1", "2-2", "2-3"]]);
    // "1-3" went down in the exchange and came back up with the fill: it ends where it began.
    expect(result.moves.get("1-3")?.kind).toBe("stayed");
  });

  test("refuses a league with more seats than allowed and a seat in two leagues", () => {
    expect(() => closeMonth([league(1, 17)], 16)).toThrow();
    expect(() => closeMonth([["a"], ["a"]], 16)).toThrow();
  });
});
