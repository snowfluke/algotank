/// <reference types="bun" />
// The preparation pane shows the tab its host holds (73-after-first-timer-test.md, row 11):
// the room keeps it above the pane, which the room mounts again when it switches between
// its phone and laptop layouts, so a resize does not send the player back to Play style.

import { describe, expect, spyOn, test } from "bun:test";
import { ULTIMATES_FROM } from "@game/arena";
import { renderToStaticMarkup } from "react-dom/server";
import { DEFAULT_PRESET_ID, PRESETS } from "@game/engine";
import { CATALOGS } from "../i18n/catalog.ts";
import { plainTankLook } from "../tank/look.ts";
import { ToastProvider } from "../ui/Toast.tsx";
import { playStyleLibrary } from "../workshop/useLibrary.ts";
import { BuiltInStyles } from "./BuiltInStyles.tsx";
import { PLAY_STYLES } from "./playStyles.ts";
import { PREP_TABS, PrepPanel, type PrepTab } from "./PrepPanel.tsx";
import { StylePane } from "./StylePane.tsx";
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

describe("ultimates on play style cards", () => {
  const look = plainTankLook(3);
  const noop = () => undefined;

  test("each built-in style shows its own ultimate in the grid and carousel", () => {
    const render = (wide: boolean, index: number) => renderToStaticMarkup(
      <BuiltInStyles chosen={null} look={look} wide={wide} index={index} nowMs={ULTIMATES_FROM}
        onIndexChange={noop} onChoose={noop} actionLabel={CATALOGS.en.prep.style.use} />,
    );
    const grid = render(true, 0);
    for (const [index, style] of PLAY_STYLES.entries()) {
      const tile = grid.match(new RegExp(`<article data-style-tile="${style.id}"[^>]*>(.*?)</article>`, "s"))?.[1] ?? "";
      const link = `data-ultimate-link="${style.strategy.ultimate}" href="/catalogue?section=ultimates&amp;card=${style.strategy.ultimate}"`;
      // The link and choose button are separate focus stops in the tile.
      expect(tile).toContain(`</button><a ${link}`);
      expect(render(false, index)).toContain(link);
    }
  });

  test("a Mine card shows the saved ultimate even when the rules match a built-in style", () => {
    const custom = { ...strategy, ultimate: "fullTank" as const };
    const snapshot = playStyleLibrary.getSnapshot();
    const getSnapshot = spyOn(playStyleLibrary, "getSnapshot").mockReturnValue({
      ...snapshot,
      styles: [{ id: "mine-0001", name: "Mine", strategy: custom, updatedAt: 1 }],
    });
    try {
      const html = renderToStaticMarkup(
        <ToastProvider>
          <StylePane strategy={custom} look={look} wide={false} nowMs={ULTIMATES_FROM} onChange={noop} onSaveNow={noop} />
        </ToastProvider>,
      );
      expect(html).toContain('data-ultimate-link="fullTank" href="/catalogue?section=ultimates&amp;card=fullTank"');
      expect(html).not.toContain(`data-ultimate-link="${strategy.ultimate}"`);
    } finally {
      getSnapshot.mockRestore();
    }
  });
});
