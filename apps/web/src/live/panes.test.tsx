/// <reference types="bun" />
import { plainTankLook, type TankColour } from "@game/arena";
import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { ArenaPhase, PublicArena, PublicPlayer, PublicSnapshot, RoundSummary } from "@game/arena";
import { I18nProvider } from "../i18n/I18nProvider.tsx";
import { createLanguageStore } from "../i18n/language.ts";
import { arenaIn, snapshotAt } from "../stream/fixtures.ts";
import { INITIAL_STREAM_STATE, type ArenaStreamState } from "../stream/streamState.ts";
import { ArenaPane, FinalRankingPane, RankingPane, ResultPane, roundClock } from "./panes.tsx";

const running = {
  kind: "running",
  round: 2,
  isFinal: false,
  seed: 1,
  ruleSetId: "standard",
  playerIds: [],
  survivorsAfterRound: 256,
} as const satisfies ArenaPhase;

const bot = (id: string, score: number) => ({
  id,
  x: 0,
  y: 0,
  direction: "N" as const,
  score,
  wasHit: false,
  build: { reach: 0, aim: 0, dodge: 0 },
  hitsLanded: 0,
  hitsTaken: 0,
  water: 6,
  item: null,
  effect: null,
});

/** 512 players, so every list is checked at the presenter arena's limit. */
const COUNT = 512;
const players: PublicPlayer[] = Array.from({ length: COUNT }, (_, i) => ({
  id: `p${i + 1}`,
  name: `Tank ${i + 1}`,
  status: { kind: "playing" },
  isBot: false,
  ready: false, look: plainTankLook(((i % 12) + 1) as TankColour),
}));
const arena: PublicArena = { ...arenaIn(running, "standard"), players };
const snapshot: PublicSnapshot = {
  ...snapshotAt(10),
  survivorsAfterRound: 256,
  bots: players.map((p, i) => bot(p.id, COUNT - i)),
};
const stream: ArenaStreamState = { ...INITIAL_STREAM_STATE, connection: "open", arena, snapshotRound: 2, snapshot };

const html = (node: React.ReactNode, language: "en" | "id" = "en") =>
  renderToStaticMarkup(language === "id" ? <I18nProvider store={createLanguageStore({ store: null, initial: "id" })}>{node}</I18nProvider> : node);
const count = (text: string, pattern: string) => text.split(pattern).length - 1;

describe("ArenaPane", () => {
  test("a player sees the compact own row, the help button and the board, and the full sentence is read aloud", () => {
    const out = html(<ArenaPane arena={arena} stream={stream} viewerId="p300" />);
    expect(out).toContain("300th");
    expect(out).toContain("below the cut");
    expect(out).toContain('class="sr-only">You are 300th of 512 and below the cut line right now, so every hit counts.');
    expect(out).toContain("data-legend-open");
    expect(out).toContain('role="img"');
    expect(out.indexOf("300th")).toBeLessThan(out.indexOf('role="img"'));
  });

  test("a viewer without a tank sees no own row, only the help button and the board", () => {
    const out = html(<ArenaPane arena={arena} stream={stream} viewerId={null} />);
    expect(out).not.toContain("sr-only");
    expect(out).toContain("data-legend-open");
  });

  test("fills the box it is given", () => {
    expect(html(<ArenaPane arena={arena} stream={stream} viewerId={null} />)).toMatch(/^<div class="flex min-h-0 min-w-0 flex-1 flex-col/);
  });

  test("before the first snapshot it says the round is about to start", () => {
    expect(html(<ArenaPane arena={arena} stream={{ ...stream, snapshot: null, snapshotRound: null }} viewerId="p1" />)).toContain("The round is about to start.");
  });
});

describe("RankingPane", () => {
  const out = html(<RankingPane arena={arena} stream={stream} viewerId="p300" />);

  test("lists all 512 tanks with the cut line, for the Pager to page", () => {
    expect(count(out, "data-player-id=")).toBe(COUNT);
    expect(out).toContain("Top 256 go through");
  });

  test("marks the viewer's row", () => {
    expect(out).toMatch(/aria-current="true"[^>]*data-player-id="p300"/);
  });

  test("Indonesian", () => {
    expect(html(<RankingPane arena={arena} stream={stream} viewerId="p300" />, "id")).toContain("Peringkat");
  });
});

describe("roundClock", () => {
  test("the time left as m:ss, and nothing before the first snapshot", () => {
    expect(roundClock(arena, stream)).toBe("0:45");
    expect(roundClock(arena, { ...stream, snapshot: null, snapshotRound: null })).toBeNull();
  });
});

describe("ResultPane and FinalRankingPane after a round", () => {
  const standings = players.map((p, i) => ({ botId: p.id, score: COUNT - i, rank: i + 1, hitsLanded: 2, hitsTaken: 1 }));
  const summary: RoundSummary = { round: 1, isFinal: false, seed: 1, ruleSetId: "standard", standings, survivors: players.slice(0, 256).map((p) => p.id) };
  const breakPlayers: PublicPlayer[] = [
    ...players.map((p, i): PublicPlayer => (i < 256 ? p : { ...p, status: { kind: "eliminated", inRound: 1, finalRank: i + 1 } })),
    { id: "late", name: "Lina", status: { kind: "waiting" }, isBot: false, ready: false, look: plainTankLook(5) },
  ];
  const breakArena: PublicArena = { ...arenaIn({ kind: "break", nextRound: 2, nextRuleSetId: null, start: { kind: "waiting" } }, "standard"), players: breakPlayers, rounds: [summary] };
  const me = (id: string) => {
    const player = breakPlayers.find((p) => p.id === id);
    if (player === undefined) throw new Error(id);
    return player;
  };

  test("a player who goes through reads the outcome, the recap and the top three", () => {
    const out = html(<ResultPane arena={breakArena} me={me("p3")} />);
    expect(out).toContain("You finished 3rd of 512, so you go through to round 2.");
    expect(out).toContain("Your shots hit 2 times");
    expect(out).toContain("Top three");
    expect(count(out, "data-player-id=")).toBe(3);
  });

  test("a player who is out reads that, with the kind lines", () => {
    const out = html(<ResultPane arena={breakArena} me={me("p400")} />);
    expect(out).toContain("Your tank is out");
    expect(out).toContain("You finished 400th of 512, so your tank is out of this game.");
    expect(out).toContain("Every game brings new luck");
  });

  test("a player who joined during the game sees the round and its top three, without an outcome of their own", () => {
    const out = html(<ResultPane arena={breakArena} me={me("late")} />);
    expect(out).toContain("Round 1 result");
    expect(out).toContain("Top three");
    expect(out).not.toContain("You finished");
  });

  test("the ranking lists every row with the cut line and keeps the viewer's row marked", () => {
    const out = html(<FinalRankingPane arena={breakArena} me={me("p400")} />);
    expect(count(out, "data-player-id=")).toBe(COUNT);
    expect(out).toContain("Top 256 go through");
    expect(out).toMatch(/aria-current="true"[^>]*data-player-id="p400"/);
  });
});

describe("ResultPane and FinalRankingPane at the end of the game", () => {
  // Tank 1 won; every other tank went out at the place of its number.
  const finishedPlayers: PublicPlayer[] = players.map((p, i): PublicPlayer => (i === 0 ? { ...p, status: { kind: "winner" } } : { ...p, status: { kind: "eliminated", inRound: 1, finalRank: i + 1 } }));
  const finished: PublicArena = { ...arenaIn({ kind: "finished", winnerId: "p1", resultId: null }, "standard"), players: finishedPlayers };
  const me = (id: string) => finishedPlayers.find((p) => p.id === id) ?? finishedPlayers[0]!;

  test("the winner reads that they won, with the celebration and the top three", () => {
    const out = html(<ResultPane arena={finished} me={me("p1")} />);
    expect(out).toContain("You won the game!");
    expect(out).toContain("hide-when-short");
    expect(count(out, "data-player-id=")).toBe(3);
  });

  test("another player reads who won and their own place, in both languages", () => {
    const out = html(<ResultPane arena={finished} me={me("p7")} />);
    expect(out).toContain("Tank 1 won!");
    expect(out).toContain("You finished 7th of 512.");
    const id = html(<ResultPane arena={finished} me={me("p7")} />, "id");
    expect(id).toContain("Tank 1 menang!");
    expect(id).toContain("Kamu di peringkat 7 dari 512.");
  });

  test("the final ranking lists every place and marks the viewer's row", () => {
    const out = html(<FinalRankingPane arena={finished} me={me("p7")} />);
    expect(count(out, "data-player-id=")).toBe(COUNT);
    expect(out).toMatch(/aria-current="true"[^>]*data-player-id="p7"/);
  });
});
