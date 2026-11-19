import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { chargeOf, UltimateEmblem } from "./UltimateEmblem.tsx";

describe("the ultimate's charge rim", () => {
  test("fills with the turns that have passed, and is full when ready", () => {
    expect(chargeOf({ id: "smoke", kind: "charging", turnsLeft: 28, turnsTotal: 40 })).toBeCloseTo(0.3);
    expect(chargeOf({ id: "smoke", kind: "charging", turnsLeft: 40, turnsTotal: 40 })).toBe(0);
    expect(chargeOf({ id: "smoke", kind: "ready" })).toBe(1);
  });

  test("a live emblem draws its charge and glows only when ready", () => {
    const charging = renderToStaticMarkup(<UltimateEmblem ultimate="magnet" size={48} state={{ id: "magnet", kind: "charging", turnsLeft: 30, turnsTotal: 40 }} />);
    expect(charging).toContain('data-ultimate-charge="25"');
    expect(charging).not.toContain("ultimate-emblem-glow");
    const ready = renderToStaticMarkup(<UltimateEmblem ultimate="magnet" size={48} state={{ id: "magnet", kind: "ready" }} />);
    expect(ready).toContain("ultimate-emblem-glow");
    expect(renderToStaticMarkup(<UltimateEmblem ultimate="dash" size={48} />)).not.toContain("data-ultimate-charge");
  });
});
