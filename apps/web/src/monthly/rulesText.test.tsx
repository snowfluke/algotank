import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { plainTankLook, type MonthTank } from "@game/arena";
import { PRESETS } from "@game/engine";
import { monthTankItems } from "../champions/MonthRules.tsx";
import { createLanguageStore } from "../i18n/language.ts";
import { I18nProvider } from "../i18n/I18nProvider.tsx";
import { RulesText } from "./RulesText.tsx";

describe("the open rules", () => {
  test("a tank's rules read as one numbered list per mode, then what runs when no rule fits, then the upgrades", () => {
    const preset = PRESETS.find((p) => p.id === "leader-chaser");
    if (preset === undefined) throw new Error("the leader-chaser preset is missing");
    const html = renderToStaticMarkup(
      <I18nProvider store={createLanguageStore({ store: null, initial: "en" })}>
        <RulesText strategy={preset.strategy} />
      </I18nProvider>,
    );
    const rules = preset.strategy.modes.reduce((n, mode) => n + mode.rules.length, 0);
    expect((html.match(/<li>/g) ?? []).length).toBe(rules);
    expect(html).toContain("Upgrades: Range");
  });

  test("a published month's list puts a line before each league after the first", () => {
    const tank = (seatId: string, league: number, rank: number | null, gm = false): MonthTank => ({ seatId, league, rank, name: seatId, look: plainTankLook(1), gm });
    const items = monthTankItems([tank("a", 1, 1), tank("g", 1, null, true), tank("b", 2, 1)], (n) => `League ${n}`, { text: "GM", title: "Game master" });
    expect(items.map((item) => (item.kind === "cut" ? item.label : item.row.tank.playerId))).toEqual(["a", "g", "League 2", "b"]);
    const gm = items[1];
    expect(gm?.kind === "row" ? gm.row.badge?.text : null).toBe("GM");
  });
});
