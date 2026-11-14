/// <reference types="bun" />
// The workshop editor's draft and the library: every edit reaches the library at once,
// a quick revert too (the session forgets a draft that equals its saved copy again).

import { describe, expect, test } from "bun:test";
import { DEFAULT_PRESET_ID, PRESETS } from "@game/engine";
import type { StrategyInput } from "@game/engine";
import { AUTO_SAVE_MS, StrategySession } from "../prep/strategySession.ts";
import type { Clock } from "../ui/timer.ts";
import { editorSource, editDraft } from "./editorSession.ts";
import { PlayStyleLibrary } from "./library.ts";

const evader = PRESETS.find((p) => p.id === DEFAULT_PRESET_ID)!.strategy as StrategyInput;
const edited: StrategyInput = { ...evader, build: { reach: 1, aim: 2, dodge: 3 } };

const clock: Clock = { now: () => 1_000_000, setTimeout: () => 0, clearTimeout: () => undefined };
const settle = async () => {
  for (let i = 0; i < 20; i++) await Promise.resolve();
};

describe("the workshop editor's draft", () => {
  test("an edit reverted before the automatic save leaves the library as it was", async () => {
    const offline = { ok: false as const, status: 0, error: { error: "network_error" }, code: "network_error" };
    const library = new PlayStyleLibrary(null, { list: async () => offline, put: async () => offline, remove: async () => offline }, clock, () => "style-id-0001");
    const made = library.create("Sneaky", evader);
    if (!made.ok) throw new Error("not created");
    const session = new StrategySession(editorSource(library, made.style.id, "gone"), clock, () => undefined);
    session.start();
    await settle();
    editDraft(library, made.style.id, session.setDraft)(edited);
    expect(library.get(made.style.id)?.strategy).toEqual(edited);
    editDraft(library, made.style.id, session.setDraft)(evader);
    // Well inside AUTO_SAVE_MS: the session has not saved, and the library already holds the revert.
    expect(AUTO_SAVE_MS).toBeGreaterThan(0);
    expect(library.get(made.style.id)?.strategy).toEqual(evader);
  });
});
