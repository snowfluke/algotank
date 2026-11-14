/// <reference types="bun" />
// The preparation pane shows the tab its host holds (73-after-first-timer-test.md, row 11):
// the room keeps it above the pane, which the room mounts again when it switches between
// its phone and laptop layouts, so a resize does not send the player back to Play style.

import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { DEFAULT_PRESET_ID, PRESETS } from "@game/engine";
import { ToastProvider } from "../ui/Toast.tsx";
import { PREP_TABS, PrepPanel, type PrepTab } from "./PrepPanel.tsx";
import type { StrategyHandle } from "./useStrategySession.ts";

const strategy = PRESETS.find((preset) => preset.id === DEFAULT_PRESET_ID)?.strategy;
if (strategy === undefined) throw new Error("the default play style is missing");

const ready: StrategyHandle = {
  load: { kind: "ready", saved: strategy, draft: strategy },
  save: { kind: "idle" },
  dirty: false,
  pending: false,
  valid: true,
  setDraft: () => undefined,
  saveDraft: async () => undefined,
  saveStrategy: async () => undefined,
  refreshSaved: async () => null,
  clearSaveError: () => undefined,
  reload: () => undefined,
};

function chosenTab(tab: PrepTab): string | undefined {
  const html = renderToStaticMarkup(
    <ToastProvider>
      <PrepPanel strategy={ready} playerName="Ayu" nextRules={{ kind: "none" }} showRuleSets={false} tab={tab} onTab={() => undefined} />
    </ToastProvider>,
  );
  return html.match(/aria-selected="true"[^>]*data-tab="([a-z]+)"|data-tab="([a-z]+)"[^>]*aria-selected="true"/)?.slice(1).find((v) => v !== undefined);
}

describe("the preparation pane's tab", () => {
  test("is the one its host holds, so a pane mounted again opens where the player was", () => {
    for (const tab of PREP_TABS) expect(chosenTab(tab)).toBe(tab);
  });
});
