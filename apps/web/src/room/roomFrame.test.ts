/// <reference types="bun" />
import { plainTankLook } from "@game/arena";
import { describe, expect, test } from "bun:test";
import type { ArenaKind, ArenaPhase, PlayerStatus, PublicArena } from "@game/arena";
import { playerView, type JoinedView } from "../player/playerView.ts";
import { TEST_SETTINGS } from "../stream/fixtures.ts";
import { columnPaneOf, frameKey, laptopGroupOf, roomLayout, shownTab } from "./roomFrame.ts";

const session = { playerId: "p1", playerToken: "t" };
const running = (round: number, playerIds: string[] = ["p2"]): ArenaPhase => ({ kind: "running", round, isFinal: false, seed: 1, ruleSetId: "standard", playerIds, survivorsAfterRound: null });

function joined(phase: ArenaPhase, status: PlayerStatus = { kind: "playing" }, kind: ArenaKind = TEST_SETTINGS.kind): JoinedView {
  const arena: PublicArena = {
    id: "a",
    settings: { ...TEST_SETTINGS, kind },
    players: [
      { id: "p1", name: "Ana", status, isBot: false, ready: false, look: plainTankLook(1) },
      { id: "p2", name: "Budi", status: { kind: "playing" }, isBot: false, ready: false, look: plainTankLook(2) },
    ],
    phase,
    rounds: [],
    game: 1,
    auto: null,
    nextGameInMs: null,
    chat: "on",
  };
  const view = playerView("open", arena, session, null);
  if (!("me" in view)) throw new Error(`not a joined view: ${view.kind}`);
  return view;
}

const lobby: ArenaPhase = { kind: "lobby", nextRuleSetId: "standard", start: { kind: "waiting" } };
const pause: ArenaPhase = { kind: "break", nextRound: 2, nextRuleSetId: "standard", start: { kind: "waiting" } };

describe("roomLayout", () => {
  test("each view opens on the pane its moment is about", () => {
    expect(roomLayout(joined(lobby)).tabs).toEqual(["tank", "players", "invite", "chat"]);
    expect(roomLayout(joined(running(1, ["p1", "p2"]))).tabs).toEqual(["arena", "ranking", "mytank"]);
    expect(roomLayout(joined(pause)).tabs).toEqual(["result", "ranking", "tank", "chat"]);
    // An owner's tournament shows its round history in place of the ranking's tab; a public arena keeps the ranking.
    expect(roomLayout(joined({ kind: "finished", winnerId: "p2", resultId: null })).tabs).toEqual(["result", "history", "tank", "chat"]);
    expect(roomLayout(joined({ kind: "finished", winnerId: "p2", resultId: null }, { kind: "playing" }, "practice")).tabs.slice(0, 3)).toEqual(["result", "ranking", "tank"]);
  });

  test("after a round the player's statistics card is a pane once their own statistics arrived (K2)", () => {
    expect(roomLayout(joined(pause), false, true).tabs).toEqual(["result", "ranking", "mytank", "tank", "chat"]);
    expect(roomLayout(joined({ kind: "finished", winnerId: "p2", resultId: null }), false, true).tabs).toEqual(["result", "history", "mytank", "tank", "chat"]);
    expect(roomLayout(joined(pause, { kind: "eliminated", inRound: 1, finalRank: 9 }), false, true).tabs).toEqual(["result", "ranking", "mytank", "chat"]);
    // On a laptop the card shares the ranking's column, so the result keeps the main column.
    expect(roomLayout(joined(pause), false, true).laptop[0]?.columns.map((column) => column.panes)).toEqual([["result"], ["ranking", "mytank"]]);
    // A player who waited out the round has no card; during a round "mytank" is the turn feed, with or without statistics.
    expect(roomLayout(joined(pause, { kind: "waiting" }), false, true).tabs).not.toContain("mytank");
    expect(roomLayout(joined(running(1, ["p1", "p2"])), false, true).tabs).toEqual(["arena", "ranking", "mytank"]);
  });

  test("a player who joined during a game prepares while watching; a player who is out only watches", () => {
    expect(roomLayout(joined(running(1), { kind: "waiting" })).tabs).toEqual(["arena", "ranking", "tank"]);
    expect(roomLayout(joined(running(2), { kind: "eliminated", inRound: 1, finalRank: 9 })).tabs).toEqual(["arena", "ranking"]);
    expect(roomLayout(joined(pause, { kind: "eliminated", inRound: 1, finalRank: 9 })).tabs).toEqual(["result", "ranking", "chat"]);
    expect(roomLayout(joined(pause, { kind: "waiting" })).tabs).toEqual(["tank", "ranking", "chat"]);
  });

  test("every phone tab is on some laptop group, so a tab chosen on a phone survives a wider window", () => {
    const views = [
      joined(lobby),
      joined(running(1, ["p1", "p2"])),
      joined(running(1), { kind: "waiting" }),
      joined(running(2), { kind: "eliminated", inRound: 1, finalRank: 9 }),
      joined(pause),
      joined(pause, { kind: "eliminated", inRound: 1, finalRank: 9 }),
      joined(pause, { kind: "waiting" }),
      joined({ kind: "finished", winnerId: "p2", resultId: null }),
      joined({ kind: "finished", winnerId: "p2", resultId: null }, { kind: "playing" }, "tournament"),
    ];
    for (const view of views) {
      const layout = roomLayout(view);
      for (const tab of layout.tabs) {
        const group = laptopGroupOf(layout, tab);
        const shown = group?.columns.map((column) => columnPaneOf(column, tab));
        expect({ view: view.kind, tab, shown: shown?.includes(tab) }).toEqual({ view: view.kind, tab, shown: true });
      }
    }
  });
});

describe("tab choice", () => {
  test("a new phase or round changes the frame key, so the tab goes back to where the view opens", () => {
    expect(frameKey(joined(running(1), { kind: "waiting" }))).not.toBe(frameKey(joined(running(2), { kind: "waiting" })));
    expect(frameKey(joined(lobby))).not.toBe(frameKey(joined(pause)));
    expect(frameKey(joined(pause))).toBe(frameKey(joined(pause)));
  });

  test("a tab the view does not have falls back to the view's first tab", () => {
    const layout = roomLayout(joined(pause));
    expect(shownTab(layout, "ranking")).toBe("ranking");
    expect(shownTab(layout, "players")).toBe("result");
    expect(shownTab(layout, null)).toBe("result");
  });
});

describe("the owner's break (spec 75)", () => {
  test("the owner of a private arena gets the Players pane in a break, to remove a player; other players do not", () => {
    expect(roomLayout(joined(pause), true).tabs).toEqual(["result", "ranking", "players", "tank", "chat"]);
    expect(roomLayout(joined(pause), false).tabs).not.toContain("players");
    expect(roomLayout(joined(pause, { kind: "eliminated", inRound: 1, finalRank: 9 }), true).tabs).toContain("players");
  });
});
