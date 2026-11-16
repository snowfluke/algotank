/// <reference types="bun" />
import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { TankBadge } from "./TankBadge.tsx";
import { TANK_COLOUR_COUNT, tankColourByOrder, tankColourVar, toTankColour } from "./colours.ts";
import { TANK_ICON_GEOMETRY } from "./icons.ts";
import { LIGHT_COLOURS, TANK_ICONS, TANK_SKINS, parseTankLook, randomLook, tankLetters, withColour } from "./look.ts";
import { SKIN_GEOMETRY, panelDistance } from "./skins.ts";

describe("tank colours", () => {
  test("players get colours 1 to 12 in order, then the colours repeat", () => {
    expect([0, 1, 11, 12, 13].map(tankColourByOrder)).toEqual([1, 2, 12, 1, 2]);
    expect(tankColourByOrder(-1)).toBe(TANK_COLOUR_COUNT);
    expect(tankColourVar(3)).toBe("var(--color-tank-3)");
  });

  test("toTankColour accepts only whole numbers from 1 to 12", () => {
    expect(toTankColour(4)).toBe(4);
    expect(toTankColour(12)).toBe(12);
    expect(toTankColour(0)).toBeNull();
    expect(toTankColour(13)).toBeNull();
    expect(toTankColour(2.5)).toBeNull();
  });
});

describe("TankBadge", () => {
  test("has an accessible name, or is hidden when the name is null", () => {
    expect(renderToStaticMarkup(<TankBadge colour={2} size={40} name="Ana's tank" />)).toContain('aria-label="Ana&#x27;s tank"');
    expect(renderToStaticMarkup(<TankBadge colour={2} size={40} name={null} />)).toContain('aria-hidden="true"');
  });

  test("shows at most two label characters, and the self ring only for self", () => {
    const html = renderToStaticMarkup(<TankBadge colour={1} size={40} name="x" label="ABC" self />);
    expect(html).toContain(">AB</text>");
    expect(html).toContain("var(--color-self)");
    expect(renderToStaticMarkup(<TankBadge colour={1} size={40} name="x" />)).not.toContain("var(--color-self)");
  });
});

describe("a tank's look", () => {
  const look = { colour: 2, skin: "stars", second: 7, plate: 9, icon: "fish", country: null } as const;

  test("full detail draws the plate, the pattern in the second colour and the icon instead of the letters", () => {
    const html = renderToStaticMarkup(<TankBadge look={look} size={48} name="x" label="AB" />);
    expect(html).toContain("var(--color-tank-9)");
    expect(html).toContain("var(--color-tank-2)");
    expect(html).toContain("var(--color-tank-7)");
    expect(html).not.toContain(">AB</text>");
  });

  test("simple detail keeps the plate and shows the icon as a dot of the second colour; tiny keeps plate and hull only", () => {
    const simple = renderToStaticMarkup(<TankBadge look={look} size={24} name="x" />);
    expect(simple).toContain("var(--color-tank-9)");
    expect(simple).toContain("<circle r=\"1.25\"");
    const tiny = renderToStaticMarkup(<TankBadge look={look} size={24} name="x" detail="tiny" label="AB" />);
    expect(tiny).toContain("var(--color-tank-9)");
    expect(tiny).not.toContain("var(--color-tank-7)");
    expect(tiny).not.toContain("</text>");
  });

  test("without an icon the letters stay on the hatch, and a colour alone draws a plain tank", () => {
    expect(renderToStaticMarkup(<TankBadge look={{ ...look, icon: null }} size={48} name="x" label="AB" />)).toContain(">AB</text>");
    const plain = renderToStaticMarkup(<TankBadge colour={5} size={48} name="x" />);
    expect(plain).toContain("var(--color-tank-5)");
    expect(plain).not.toContain("var(--color-tank-6)");
  });

  test("the you ring has a white casing, so it shows on an orange plate", () => {
    const html = renderToStaticMarkup(<TankBadge look={{ ...look, plate: 9 }} size={48} name="x" self />);
    expect(html).toContain('stroke="#ffffff"');
    expect(html).toContain("var(--color-self)");
  });
});

describe("skins and icons", () => {
  test("every pattern but plain draws something, and every filled motif sits inside the hull", () => {
    for (const skin of TANK_SKINS) {
      const geometry = SKIN_GEOMETRY[skin];
      const drawn = geometry.fill !== "" || geometry.line !== null;
      expect(drawn).toBe(skin !== "plain");
      // Every point of a pattern is inside the hull, so no motif spills onto the tracks.
      const numbers = [...(geometry.fill + (geometry.line?.d ?? "")).matchAll(/M(-?[\d.]+) (-?[\d.]+)/g)];
      for (const [, x, y] of numbers) expect(panelDistance(Number(x), Number(y))).toBeLessThanOrEqual(0.01);
    }
  });

  test("the patterns differ from each other", () => {
    const shapes = TANK_SKINS.map((skin) => JSON.stringify(SKIN_GEOMETRY[skin]));
    expect(new Set(shapes).size).toBe(TANK_SKINS.length);
  });

  test("every icon has a drawing that stays on the 24 grid", () => {
    expect(TANK_ICONS.length).toBeGreaterThanOrEqual(24);
    for (const icon of TANK_ICONS) {
      const g = TANK_ICON_GEOMETRY[icon];
      expect(g.shapes.length + g.lines.length).toBeGreaterThan(0);
      for (const d of [...g.shapes, ...g.lines]) {
        for (const [, x, y] of d.matchAll(/[ML](-?[\d.]+) (-?[\d.]+)/g)) {
          expect(Number(x)).toBeGreaterThanOrEqual(0);
          expect(Number(x)).toBeLessThanOrEqual(24);
          expect(Number(y)).toBeGreaterThanOrEqual(0);
          expect(Number(y)).toBeLessThanOrEqual(24);
        }
      }
    }
  });
});

describe("look helpers", () => {
  test("tankLetters gives one letter for one word and two for two words", () => {
    expect(tankLetters("ana")).toBe("A");
    expect(tankLetters("Brave Otter")).toBe("BO");
    expect(tankLetters("")).toBe("");
  });

  test("a new hull colour equal to the pattern colour swaps them, so the look stays valid", () => {
    const look = { colour: 1, skin: "dots", second: 4, plate: null, icon: null, country: null } as const;
    expect(withColour(look, 4)).toEqual({ ...look, colour: 4, second: 1 });
    expect(parseTankLook(withColour(look, 4))).not.toBeNull();
  });

  test("Surprise me makes valid looks with a pattern, a plate and an icon in the other lightness group", () => {
    let seed = 7;
    const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 200; i += 1) {
      const look = randomLook(random);
      expect(parseTankLook(look)).toEqual(look);
      expect(look.skin).not.toBe("plain");
      expect(look.icon).not.toBeNull();
      expect(LIGHT_COLOURS.has(look.second)).not.toBe(LIGHT_COLOURS.has(look.colour));
      expect(look.plate === null ? false : LIGHT_COLOURS.has(look.plate)).not.toBe(LIGHT_COLOURS.has(look.colour));
    }
  });
});
