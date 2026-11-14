/// <reference types="bun" />
// The loop points are copied by hand from the renderer's measurements, so a re-render
// that changes one file and not the other would make the music jump at its seam.
import { describe, expect, test } from "bun:test";
import measurements from "../../../../tools/music/measurements.json";
import { MUSIC_TRACKS } from "./musicTracks.ts";

const MEASURED: Readonly<Record<string, { readonly file: string; readonly loop_start: number; readonly loop_end: number }>> = measurements;

describe("the music tracks", () => {
  test("match the measured files and loop points, track for track", () => {
    expect(Object.keys(MUSIC_TRACKS).sort()).toEqual(Object.keys(MEASURED).sort());
    for (const [key, track] of Object.entries(MUSIC_TRACKS)) {
      const measured = MEASURED[key];
      expect(measured).toBeDefined();
      if (measured === undefined) continue;
      expect(`apps/web/public${track.url}`).toBe(measured.file);
      expect(track.loopStart).toBeCloseTo(measured.loop_start, 3);
      expect(track.loopEnd).toBeCloseTo(measured.loop_end, 3);
    }
  });
});
