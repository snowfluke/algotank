/// <reference types="bun" />
import { plainTankLook } from "@game/arena";
import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { PublicPlayer } from "@game/arena";
import { I18nProvider } from "../i18n/I18nProvider.tsx";
import { createLanguageStore } from "../i18n/language.ts";
import type { PlayerRemoval } from "./usePlayerRemoval.ts";
import { PlayersPane } from "./PlayerList.tsx";

const players: PublicPlayer[] = [
  { id: "b1", name: "Splashy", status: { kind: "playing" }, isBot: true, ready: false, look: plainTankLook(2) },
  { id: "p2", name: "Budi", status: { kind: "waiting" }, isBot: false, ready: false, look: plainTankLook(3) },
  { id: "p1", name: "Ana", status: { kind: "playing" }, isBot: false, ready: false, look: plainTankLook(1) },
];

describe("PlayerList", () => {
  test("the owner gets Remove for other people, never for themselves or a bot, and a row waiting for its Undo time is hidden", () => {
    const removal: PlayerRemoval = { hidden: new Set<string>(), problem: null, asking: null, canBan: false, remove: () => undefined, cancel: () => undefined, confirm: () => undefined };
    const html = renderToStaticMarkup(<PlayersPane players={players} meId="p1" removal={removal} />);
    expect(html).toContain('data-remove-player="p2"');
    expect(html).not.toContain('data-remove-player="p1"');
    expect(html).not.toContain('data-remove-player="b1"');
    expect(html).toContain('aria-label="Remove Budi from the arena"');
    const waiting = renderToStaticMarkup(<PlayersPane players={players} meId="p1" removal={{ ...removal, hidden: new Set(["p2"]) }} />);
    expect(waiting).not.toContain("Budi");
    expect(waiting).toContain("2 tanks are here.");
    expect(renderToStaticMarkup(<PlayersPane players={players} meId="p1" />)).not.toContain("data-remove-player");
  });

  test("in a signed-in-only arena the removal asks whether the player may join again, and the owner sees emails", () => {
    const budi = players.find((p) => p.name === "Budi")!;
    const removal: PlayerRemoval = { hidden: new Set<string>(), problem: null, asking: budi, canBan: true, remove: () => undefined, cancel: () => undefined, confirm: () => undefined };
    const html = renderToStaticMarkup(<PlayersPane players={players} meId="p1" removal={removal} emails={new Map([["p2", "budi@example.org"]])} />);
    expect(html).toContain("May this player join again?");
    expect(html).toContain("No, keep them out");
    expect(html).toContain("budi@example.org");
    const anyone = renderToStaticMarkup(<PlayersPane players={players} meId="p1" removal={{ ...removal, canBan: false }} />);
    expect(anyone).toContain("only an arena for signed-in players can keep a player out");
    expect(anyone).not.toContain("budi@example.org");
  });

  test("puts the player first, then people, then bots, and marks each in words", () => {
    const html = renderToStaticMarkup(<PlayersPane players={players} meId="p1" />);
    expect(html.indexOf("Ana")).toBeLessThan(html.indexOf("Budi"));
    expect(html.indexOf("Budi")).toBeLessThan(html.indexOf("Splashy"));
    expect(html).toContain(">you<");
    expect(html).toContain(">bot<");
    expect(html).toContain(">next game<");
    expect(html).toContain("3 tanks are here.");
  });

  test("speaks Indonesian", () => {
    const store = createLanguageStore({ store: null, initial: "id" });
    const html = renderToStaticMarkup(<I18nProvider store={store}><PlayersPane players={players} meId="p1" /></I18nProvider>);
    expect(html).toContain("Ada 3 tank di sini.");
    expect(html).toContain(">kamu<");
  });

  test("after the final every tank shows its final place, and during a game a removed tank is out", () => {
    const final: PublicPlayer[] = [
      { id: "p1", name: "Ana", status: { kind: "winner" }, isBot: false, ready: false, look: plainTankLook(1) },
      { id: "p2", name: "Budi", status: { kind: "eliminated", inRound: 2, finalRank: 2 }, isBot: false, ready: false, look: plainTankLook(3) },
      { id: "b1", name: "Splashy", status: { kind: "eliminated", inRound: 1, finalRank: 9 }, isBot: true, ready: false, look: plainTankLook(2) },
    ];
    const after = renderToStaticMarkup(<PlayersPane players={final} meId="p1" gameOver />);
    expect(after).toContain(">1st place<");
    expect(after).toContain(">2nd place<");
    expect(after).toContain(">9th place<");
    expect(after).not.toContain(">out<");

    const during = renderToStaticMarkup(<PlayersPane players={[final[2] as PublicPlayer]} meId={null} />);
    expect(during).toContain(">out<");

    const store = createLanguageStore({ store: null, initial: "id" });
    const id = renderToStaticMarkup(<I18nProvider store={store}><PlayersPane players={final} meId="p1" gameOver /></I18nProvider>);
    expect(id).toContain(">peringkat 2<");
    expect(id).not.toContain(">tersingkir<");
  });
});
