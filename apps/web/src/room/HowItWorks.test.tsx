/// <reference types="bun" />
import { describe, expect, test } from "bun:test";
import { en, id } from "./messages.ts";
import { howItWorksSteps } from "./HowItWorks.tsx";

describe("howItWorksSteps", () => {
  test("five steps; the first says the tank plays its play style and the last holds the rule for the same points, in both languages", () => {
    const steps = howItWorksSteps(en.howTo);
    expect(steps).toHaveLength(5);
    expect(steps[4]).toContain("same points");
    expect(howItWorksSteps(id.howTo)[4]).toContain("diundi");
    expect(steps[0]).toContain("play style");
    expect(howItWorksSteps(id.howTo)[0]).toContain("gaya main");
  });
});
