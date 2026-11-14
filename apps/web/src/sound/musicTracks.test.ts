/// <reference types="bun" />
// The loop points are copied by hand from the renderer's measurements, so a re-render
// that changes one file and not the other would make the music jump at its seam.
import { describe, expect, test } from "bun:test";
import measurements from "../../../../tools/music/measurements.json";
import { CHOSEN_TRACK } from "./musicTracks.ts";

const MEASURED: { readonly file: string; readonly loop_start: number; readonly loop_end: number } = measurements.a;

describe("the music track", () => {
  test("matches the measured file and loop points", () => {
    expect(Object.keys(measurements)).toEqual(["a"]);
    expect(`apps/web/public${CHOSEN_TRACK.url}`).toBe(MEASURED.file);
    expect(CHOSEN_TRACK.loopStart).toBeCloseTo(MEASURED.loop_start, 3);
    expect(CHOSEN_TRACK.loopEnd).toBeCloseTo(MEASURED.loop_end, 3);
  });
});
