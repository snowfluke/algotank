/// <reference types="bun" />
import { describe, expect, test } from "bun:test";
import { en, id } from "./messages.ts";
import { howItWorksSteps } from "./HowItWorks.tsx";

describe("howItWorksSteps", () => {
  test("six steps; the first says the tank plays its play style, the fifth names the items and the last holds the rule for the same points, in both languages", () => {
    const steps = howItWorksSteps(en.howTo);
    expect(steps).toHaveLength(6);
    expect(steps[4]).toContain("Items");
    expect(steps[5]).toContain("same points");
    expect(howItWorksSteps(id.howTo)[5]).toContain("diundi");
    expect(steps[0]).toContain("play style");
    expect(howItWorksSteps(id.howTo)[0]).toContain("gaya main");
  });
});
