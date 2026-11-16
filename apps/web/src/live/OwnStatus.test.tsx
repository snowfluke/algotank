/// <reference types="bun" />
import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { OwnLive } from "../standings/standings.ts";
import { OwnStatusRow } from "./OwnStatus.tsx";

const own = (outlook: OwnLive["outlook"]): OwnLive => ({ place: 3, tied: false, of: 8, score: 0, water: 9, waterCapacity: 9, canShoot: true, hitsLanded: 0, hitsTaken: 0, outlook });

/** The parts of the row that decide its height: the numbers' grid is always laid out, and every note keeps two lines. */
const shape = (html: string) => ({
  grid: html.includes("<dl"),
  notes: html.match(/min-h-\[2lh\]/g)?.length ?? 0,
});

describe("the own row above the board keeps one height, so the board never jumps", () => {
  test("a short note and a long one lay out the same, each in two kept lines under its number", () => {
    const leading = renderToStaticMarkup(<OwnStatusRow own={own({ kind: "leading", shared: false })} beforeFirstTurn={false} />);
    const chasing = renderToStaticMarkup(<OwnStatusRow own={own({ kind: "chasing", behind: 12 })} beforeFirstTurn={false} />);
    expect(shape(leading)).toEqual({ grid: true, notes: 3 });
    expect(shape(chasing)).toEqual(shape(leading));
    expect(chasing).toContain("12 points behind");
  });

  test("before the first turn the sentence shows over the numbers, which keep their room unseen", () => {
    const html = renderToStaticMarkup(<OwnStatusRow own={own({ kind: "leading", shared: true })} beforeFirstTurn />);
    expect(shape(html)).toEqual({ grid: true, notes: 3 });
    expect(html).toMatch(/<dl[^>]*invisible/);
    expect(html).toMatch(/<dl[^>]*aria-hidden="true"/);
  });
});
