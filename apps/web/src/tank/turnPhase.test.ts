import { describe, expect, test } from "bun:test";
import { TURN_MS, turnPhase } from "./turnPhase.ts";

describe("the turning tank's clock", () => {
  test("parts that appear at different moments get delays that put them at the same phase", () => {
    // An animation that starts at t0 with delay -(t0 % TURN_MS) is at phase t % TURN_MS at any later t.
    const phaseAt = (start: number, now: number) => (now - start - Number.parseInt(String(turnPhase(start).animationDelay), 10)) % TURN_MS;
    expect(phaseAt(1_000, 40_000)).toBe(phaseAt(23_456, 40_000));
    expect(phaseAt(0, 40_000)).toBe(40_000 % TURN_MS);
    expect(turnPhase(15_000).animationDuration).toBe(`${TURN_MS}ms`);
  });
});
