/// <reference types="bun" />
// The palettes of index.css: every text colour reads at 4.5:1 on panel and ground in both themes,
// and the block that gives drawings their light colours back in the dark theme matches @theme.
import { describe, expect, test } from "bun:test";
import { GROUND } from "./theme.ts";

const css = await Bun.file(new URL("../index.css", import.meta.url)).text();
const TOKEN = /--color-([a-z0-9-]+):\s*(#[0-9a-f]{6})/g;

function block(start: string): Record<string, string> {
  const from = css.indexOf(start);
  if (from < 0) throw new Error(`index.css has no ${start}`);
  const body = css.slice(from, css.indexOf("\n}", from));
  return Object.fromEntries([...body.matchAll(TOKEN)].map(([, name, value]) => [name!, value!]));
}

const light = block("@theme static {");
const dark = { ...light, ...block(':root[data-theme="dark"] {') };
const drawings = block(':root[data-theme="dark"] svg:not(.themed-svg) > * {');

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = Number.parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

function ratio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

/** Text colour and the surfaces it sits on. */
const PAIRS: readonly (readonly [string, readonly string[]])[] = [
  ["ink", ["panel", "ground", "water-soft", "self-soft", "ok-soft", "hit-soft", "warning-soft", "guide-soft"]],
  ["muted", ["panel", "ground", "water-soft"]],
  ["water", ["panel", "ground", "water-soft"]],
  ["self-ink", ["panel", "ground"]],
  ["ok", ["panel", "ground", "ok-soft"]],
  ["hit", ["panel", "ground", "hit-soft"]],
  ["warning", ["panel", "ground", "warning-soft"]],
  ["guide-ink", ["panel", "guide-soft"]],
  ["guide-on", ["guide"]],
  ["water-ink", ["water", "water-hover"]],
  ["hit-ink", ["hit"]],
  ["water-light", ["toast"]],
  ["medal-ink", ["gold", "silver", "bronze"]],
];

describe("the palettes of index.css", () => {
  for (const [name, palette] of [["light", light], ["dark", dark]] as const) {
    test(`${name}: every text colour is 4.5:1 or better on what it sits on`, () => {
      const low = PAIRS.flatMap(([text, surfaces]) =>
        surfaces.map((surface) => ({ text, surface, ratio: Math.round(ratio(palette[text]!, palette[surface]!) * 10) / 10 })).filter((pair) => pair.ratio < 4.5),
      );
      expect(low).toEqual([]);
    });
  }

  test("the browser bar takes the page background of each theme", () => {
    expect(GROUND).toEqual({ light: light["ground"]!, dark: dark["ground"]! });
  });

  test("drawings keep the light colours in the dark theme", () => {
    const changed = Object.entries(drawings).filter(([name, value]) => light[name] !== value);
    expect(changed).toEqual([]);
    // Every token the dark theme changes is given back to drawings, except the layers that never sit in one.
    const notGiven = Object.keys(block(':root[data-theme="dark"] {')).filter((name) => !(name in drawings) && !["scrim", "toast"].includes(name));
    expect(notGiven).toEqual([]);
  });
});
