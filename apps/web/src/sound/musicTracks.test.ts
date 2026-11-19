/// <reference types="bun" />
import { describe, expect, test } from "bun:test";
import { RULE_SET_IDS, STANDARD_RULE_SET_ID } from "@game/engine";
import measurements from "../../../../tools/music/measurements.json";
import { DEFAULT_TRACK, MUSIC_TRACKS } from "./musicTracks.ts";

describe("the arena condition tracks", () => {
  test("every rule set has its own measured track, with Standard as the default", () => {
    expect(Object.keys(MUSIC_TRACKS).sort()).toEqual([...RULE_SET_IDS].sort());
    expect(DEFAULT_TRACK).toBe(MUSIC_TRACKS[STANDARD_RULE_SET_ID]);
    const paths = RULE_SET_IDS.map((id) => `apps/web/public${MUSIC_TRACKS[id].url}`);
    expect(paths.sort()).toEqual(Object.values(measurements).map(({ file }) => file).sort());
    for (const track of Object.values(MUSIC_TRACKS)) {
      const measured = Object.values(measurements).find(({ file }) => file === `apps/web/public${track.url}`);
      if (measured === undefined) throw new Error(`Missing loop measurements for ${track.url}`);
      expect([track.loopStart, track.loopEnd]).toEqual([measured.loop_start, measured.loop_end]);
    }
  });
});
