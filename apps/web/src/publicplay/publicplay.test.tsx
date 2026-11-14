/// <reference types="bun" />
import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { DEFAULT_PRESET_ID, parseStrategy, PRESETS } from "@game/engine";
import { plainTankLook, readyIsOpen, type Arena, type ArenaKind, type ArenaPhase, type PublicArena, type PublicStatusResponse } from "@game/arena";
import { playerView, type JoinedView } from "../player/playerView.ts";
import type { KeyValueStore } from "../session/storage.ts";
import { TEST_SETTINGS } from "../stream/fixtures.ts";
import { arenaDisplayName } from "./arenaName.ts";
import { hasFinishedGame, markFinishedGame, playedToTheEnd } from "./firstGame.ts";
import { liveLines, type PublicStatusLoad } from "./liveLines.ts";
import { en, id } from "./messages.ts";
import { kindFromSearch } from "./PlayPage.tsx";
import { ReadyBar, showsReadyBar } from "./ReadyBar.tsx";
import { rejoinsNow, seatIsGone } from "./rejoin.ts";
import { linksToChampions, otherArenasFrom, publicResultNotes, showsReadyTags, statusSentenceShown } from "./roomParts.ts";

const look = plainTankLook(1);
const lobby: ArenaPhase = { kind: "lobby", nextRuleSetId: "standard", start: { kind: "waiting" } };

function memoryStore(): KeyValueStore {
  const values = new Map<string, string>();
  return { getItem: (k) => values.get(k) ?? null, setItem: (k, v) => void values.set(k, v), removeItem: (k) => void values.delete(k) };
}

function arena(kind: ArenaKind, phase: ArenaPhase, meStatus: PublicArena["players"][number]["status"] = { kind: "playing" }, winnerIsBot = false): PublicArena {
  return {
    id: "MONTH1",
    settings: { ...TEST_SETTINGS, kind, name: "" },
    players: [
      { id: "p1", name: "Ana", status: meStatus, isBot: false, ready: true, look },
      { id: "b1", name: "Splashy", status: { kind: "playing" }, isBot: winnerIsBot, ready: false, look },
    ],
    phase,
    rounds: [],
    game: 3,
    auto: null,
    nextGameInMs: null,
    chat: null,
  };
}

function joined(a: PublicArena): JoinedView {
  const view = playerView("open", a, { playerId: "p1", playerToken: "t" }, true);
  if (!("me" in view)) throw new Error(view.kind);
  return view;
}

describe("first game", () => {
  test("the flag starts unset, is set once, and a blocked store means every visit is a first one", () => {
    const store = memoryStore();
    expect(hasFinishedGame(store)).toBe(false);
    markFinishedGame(store);
    expect(hasFinishedGame(store)).toBe(true);
    expect(hasFinishedGame(null)).toBe(false);
  });

  test("only a player whose tank played the game counts, not one who joined during it", () => {
    const done: ArenaPhase = { kind: "finished", winnerId: "b1", resultId: null };
    expect(playedToTheEnd(joined(arena("practice", done, { kind: "eliminated", inRound: 1, finalRank: 2 })))).toBe(true);
    expect(playedToTheEnd(joined(arena("practice", done, { kind: "waiting" })))).toBe(false);
    expect(playedToTheEnd(joined(arena("practice", lobby)))).toBe(false);
  });

  test("/play?arena= picks an arena only for a known kind", () => {
    expect(kindFromSearch("?arena=monthly")).toBe("monthly");
    expect(kindFromSearch("?arena=public")).toBe(null);
    expect(kindFromSearch("")).toBe(null);
  });
});

describe("names", () => {
  test("a public arena shows the name of its kind, any other arena its own name", () => {
    expect(arenaDisplayName({ kind: "tournament", name: "" }, en.names)).toBe("Tournament arena");
    expect(arenaDisplayName({ kind: "practice", name: "" }, id.names)).toBe("Arena latihan");
    expect(arenaDisplayName({ kind: "private", name: "Friday fight" }, en.names)).toBe("Friday fight");
  });
});

describe("room parts of a public arena", () => {
  const finished: ArenaPhase = { kind: "finished", winnerId: "b1", resultId: null };
  test("the tournament's result says who goes on the list, or that a bot won", () => {
    expect(publicResultNotes(joined(arena("tournament", finished, { kind: "eliminated", inRound: 2, finalRank: 2 }, true)), en)).toEqual([en.tournament.botWon]);
    expect(publicResultNotes(joined(arena("tournament", finished, { kind: "eliminated", inRound: 2, finalRank: 2 })), en)).toEqual([
      "Splashy is the champion and goes on the champions page.",
    ]);
    expect(publicResultNotes(joined(arena("tournament", { kind: "finished", winnerId: "p1", resultId: null }, { kind: "winner" })), en)).toEqual([en.tournament.youOnList]);
    expect(publicResultNotes(joined(arena("practice", finished, { kind: "eliminated", inRound: 1, finalRank: 2 })), en)).toEqual([]);
  });

  test("a public break or result shows only the clock in the status line, because the result pane says the outcome", () => {
    const done: ArenaPhase = { kind: "finished", winnerId: "b1", resultId: null };
    expect(statusSentenceShown(joined(arena("practice", done, { kind: "eliminated", inRound: 1, finalRank: 2 })))).toBe(false);
    expect(statusSentenceShown(joined(arena("tournament", { kind: "break", nextRound: 2, nextRuleSetId: "standard", start: { kind: "waiting" } })))).toBe(false);
    expect(statusSentenceShown(joined(arena("practice", lobby)))).toBe(true);
    expect(statusSentenceShown(joined(arena("private", done, { kind: "eliminated", inRound: 1, finalRank: 2 })))).toBe(true);
  });

  test("Ready and the champions link belong to the public arenas that need them", () => {
    expect(showsReadyTags(arena("practice", lobby))).toBe(true);
    // Spec 75: an owner's arena shows ready in the lobby too, where it informs the owner.
    expect(showsReadyTags(arena("private", lobby))).toBe(true);
    expect(showsReadyTags(arena("private", { kind: "finished", winnerId: "p1", resultId: null }))).toBe(false);
    expect(showsReadyTags(arena("practice", { kind: "finished", winnerId: "p1", resultId: null }))).toBe(false);
    expect(linksToChampions(arena("practice", lobby))).toBe(false);
    expect(linksToChampions(arena("tournament", lobby))).toBe(true);
  });

  test("every public result, and nothing else, links to the chooser with its own arena chosen", () => {
    const phases: readonly ArenaPhase[] = [lobby, { kind: "running", round: 1, isFinal: true, seed: 1, ruleSetId: "standard", playerIds: ["p1"], survivorsAfterRound: null }, { kind: "break", nextRound: 2, nextRuleSetId: "standard", start: { kind: "waiting" } }, { kind: "finished", winnerId: "p1", resultId: null }];
    for (const kind of ["private", "presenter", "practice", "tournament"] as const) {
      for (const phase of phases) {
        const expected = phase.kind === "finished" && kind !== "private" && kind !== "presenter" ? kind : null;
        expect({ kind, phase: phase.kind, link: otherArenasFrom(arena(kind, phase)) }).toEqual({ kind, phase: phase.kind, link: expected });
      }
    }
  });

  test("the Ready bar shows exactly where the server accepts Ready (readyIsOpen): a public lobby and a public result", () => {
    const parsed = parseStrategy(PRESETS.find((p) => p.id === DEFAULT_PRESET_ID)!.strategy);
    if (!parsed.ok) throw new Error("the default play style does not parse");
    const phases: readonly ArenaPhase[] = [lobby, { kind: "running", round: 1, isFinal: true, seed: 1, ruleSetId: "standard", playerIds: ["p1"], survivorsAfterRound: null }, { kind: "break", nextRound: 2, nextRuleSetId: "standard", start: { kind: "waiting" } }, { kind: "finished", winnerId: "p1", resultId: null }];
    for (const kind of ["private", "presenter", "practice", "tournament"] as const) {
      for (const phase of phases) {
        const shown = arena(kind, phase);
        const server: Arena = { ...shown, banned: [], players: shown.players.map((p) => ({ ...p, strategy: parsed.strategy })) };
        expect({ kind, phase: phase.kind, bar: showsReadyBar(shown, shown.players[0]!) }).toEqual({ kind, phase: phase.kind, bar: readyIsOpen(server) });
      }
    }
  });

  test("on a result the Ready bar says the next game starts right after it, without promising a shorter result", () => {
    const a = arena("practice", { kind: "finished", winnerId: "b1", resultId: null });
    const notReady = renderToStaticMarkup(<ReadyBar arena={a} me={{ ...a.players[0]!, ready: false }} playerToken="t" />);
    expect(notReady).toContain(en.ready.detailOnResult);
    expect(renderToStaticMarkup(<ReadyBar arena={a} me={a.players[0]!} playerToken="t" />)).toContain(en.ready.doneOnResult);
  });

  test("the Ready bar offers the button, then says the player is ready", () => {
    const a = arena("practice", lobby);
    const notReady = renderToStaticMarkup(<ReadyBar arena={a} me={{ ...a.players[0]!, ready: false }} playerToken="t" />);
    expect(notReady).toContain("I&#x27;m ready");
    expect(notReady).toContain(en.ready.detail);
    const ready = renderToStaticMarkup(<ReadyBar arena={a} me={a.players[0]!} playerToken="t" />);
    expect(ready).toContain(en.ready.done);
    expect(ready).not.toContain("<button");
  });
});

describe("a public seat the server lost (row 6 of 73-after-first-timer-test.md)", () => {
  const view = (kind: ArenaKind, session: { playerId: string; playerToken: string } | null) => playerView("open", arena(kind, lobby), session, true);

  test("the page joins a public room again by itself after the server lost the seat, but not after Leave or in a private arena", () => {
    expect(rejoinsNow("lost", view("practice", null))).toBe(true);
    expect(rejoinsNow("lost", view("tournament", null))).toBe(true);
    expect(rejoinsNow("left", view("practice", null))).toBe(false);
    expect(rejoinsNow(null, view("practice", null))).toBe(false);
    expect(rejoinsNow("lost", view("private", null))).toBe(false);
  });

  test("a public arena that does not list the stored player drops the seat, once the arena was seen with that seat's token", () => {
    const lost = view("practice", { playerId: "gone", playerToken: "t" });
    expect(lost.kind).toBe("lostSlot");
    expect(seatIsGone(lost, "t", "t")).toBe(true);
    // Right after a join the page holds the new seat before the stream reopens with it.
    expect(seatIsGone(lost, "older", "t")).toBe(false);
    expect(seatIsGone(view("private", { playerId: "gone", playerToken: "t" }), "t", "t")).toBe(false);
  });
});

describe("live lines of the chooser", () => {
  const status: PublicStatusResponse = {
    practice: { humans: 3 },
    tournament: { phase: "lobby", humans: 2, startsInMs: 42000, round: null, recentWinners: [] },
    monthly: { month: "2026-11", tanks: 40, leagues: 3, lastChampion: null },
  };
  const ready = (s: PublicStatusResponse): PublicStatusLoad => ({ kind: "ready", status: s, startsAt: null });
  const context = { tournamentSeconds: 42 };

  test("each arena gets its own line", () => {
    expect(liveLines(ready(status), context, en.live)).toEqual({
      practice: "3 players are here now.",
      tournament: "The next tournament starts in 0:42.",
      monthly: "40 tanks play in the monthly arena now.",
    });
  });

  test("the tournament says what runs, the monthly line says how many tanks play", () => {
    const running = { ...status, tournament: { ...status.tournament, phase: "running" as const, round: 2, startsInMs: null } };
    expect(liveLines(ready(running), context, en.live).tournament).toBe("Round 2 is running, and the next tournament starts after it.");
    const waiting = { ...status, tournament: { ...status.tournament, startsInMs: null } };
    expect(liveLines(ready(waiting), context, en.live).tournament).toBe(en.live.tournamentWaits);
    const nobody = { ...status, monthly: { ...status.monthly, tanks: 0 }, practice: { humans: 0 } };
    expect(liveLines(ready(nobody), context, en.live)).toMatchObject({ practice: en.live.practice(0), monthly: en.live.monthly(0) });
    expect(liveLines(ready(nobody), context, id.live).monthly).toBe("Belum ada tank yang main di arena bulanan.");
  });

  test("before an answer, and after a failure without one, every tile says so", () => {
    expect(liveLines({ kind: "loading" }, context, en.live).monthly).toBe(en.live.loading);
    expect(liveLines({ kind: "failed" }, context, id.live).practice).toBe(id.live.failed);
  });
});
