/// <reference types="bun" />
import { describe, expect, test } from "bun:test";
import { botLabels } from "./botLabels.ts";

const labelsOf = (...names: string[]) => botLabels(Object.fromEntries(names.map((n, i) => [`p${i}`, n])));
const values = (map: ReadonlyMap<string, string>) => [...map.values()];

describe("botLabels", () => {
  test("a single word takes its first two characters and two words take their initials", () => {
    expect(values(labelsOf("budi", "Mina Lee", "x"))).toEqual(["BU", "ML", "X"]);
  });

  test("names that share a start get different labels", () => {
    expect(values(labelsOf("Player 1", "Player 2", "Player 3"))).toEqual(["P1", "P2", "P3"]);
    expect(values(labelsOf("Anna", "Anita", "Ana"))).toEqual(["AN", "AI", "AA"]);
  });

  test("a name that ends in a number is labelled by that number when the initials are taken", () => {
    const labels = labelsOf("Player 4", "Player 1", "Player 46", "Player 10");
    expect(labels.get("p0")).toBe("P4");
    expect(labels.get("p1")).toBe("P1");
    expect(labels.get("p2")).toBe("46");
    expect(labels.get("p3")).toBe("10");
  });

  test("64 bots with the same prefix all get a label that no other bot has", () => {
    const names = Array.from({ length: 64 }, (_, i) => `Player ${i + 1}`);
    const labels = values(labelsOf(...names));
    expect(labels).toHaveLength(64);
    expect(new Set(labels).size).toBe(64);
    for (const label of labels) expect(Array.from(label).length).toBeLessThanOrEqual(2);
  });

  test("a bot with no candidate left gets the lowest free number", () => {
    const labels = labelsOf("AB", "AB", "AB", "1", "");
    expect(labels.get("p0")).toBe("AB");
    expect(labels.get("p1")).toBe("2");
    expect(labels.get("p2")).toBe("3");
    expect(labels.get("p3")).toBe("1");
    expect(labels.get("p4")).toBe("4");
  });

  test("does not split a character made of two UTF-16 units", () => {
    expect(labelsOf("😀😀😀").get("p0")).toBe("😀😀");
  });

  test("the result does not depend on case or spacing around the name", () => {
    expect(labelsOf("  mina lee ").get("p0")).toBe("ML");
  });
});
