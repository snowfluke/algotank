import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { plainTankLook, type MonthTank } from "@game/arena";
import { PRESETS } from "@game/engine";
import { monthTankItems } from "../champions/MonthRules.tsx";
import { createLanguageStore } from "../i18n/language.ts";
import { I18nProvider } from "../i18n/I18nProvider.tsx";
import { RulesText } from "./RulesText.tsx";

describe("the open rules", () => {
  test("a tank's rules read one mode at a time: its name between Previous and Next, its numbered list, then the upgrades", () => {
    const preset = PRESETS.find((p) => p.strategy.modes.length > 1);
    if (preset === undefined) throw new Error("no preset has two modes");
    const html = renderToStaticMarkup(
      <I18nProvider store={createLanguageStore({ store: null, initial: "en" })}>
        <RulesText strategy={preset.strategy} />
      </I18nProvider>,
    );
    const first = preset.strategy.modes[0]!;
    expect((html.match(/<li>/g) ?? []).length).toBe(first.rules.length);
    expect(html).toContain(`data-rules-mode="${first.id}"`);
    expect(html).toContain("data-rules-mode-previous");
    expect(html).toContain("data-rules-mode-next");
    expect(html).toContain(`1 of ${preset.strategy.modes.length}`);
    expect(html).toContain("Upgrades: Range");
  });

  test("one mode needs no arrows and no name", () => {
    const one = { ...PRESETS[0]!.strategy, modes: [PRESETS[0]!.strategy.modes[0]!] };
    const html = renderToStaticMarkup(
      <I18nProvider store={createLanguageStore({ store: null, initial: "en" })}>
        <RulesText strategy={one} />
      </I18nProvider>,
    );
    expect(html).not.toContain("data-rules-mode-next");
    expect((html.match(/<li>/g) ?? []).length).toBe(one.modes[0]!.rules.length);
  });

  test("a published month's list puts a line before each league after the first", () => {
    const tank = (seatId: string, league: number, rank: number | null, gm = false): MonthTank => ({ seatId, league, rank, name: seatId, look: plainTankLook(1), gm });
    const items = monthTankItems([tank("a", 1, 1), tank("g", 1, null, true), tank("b", 2, 1)], (n) => `League ${n}`, { text: "GM", title: "Game master" });
    expect(items.map((item) => (item.kind === "cut" ? item.label : item.row.tank.playerId))).toEqual(["a", "g", "League 2", "b"]);
    const gm = items[1];
    expect(gm?.kind === "row" ? gm.row.badge?.text : null).toBe("GM");
  });
});
