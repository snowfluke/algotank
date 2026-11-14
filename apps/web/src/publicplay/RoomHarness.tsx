// "/kit?show=room&kind=…": the arena room of a public arena (player/PlayerPage.tsx's
// JoinedRoom) without a server, in the phases that last only seconds on a real server:
// the lobby (30 to 60 s), the tournament's break (20 s) and the result (20 to 30 s). The
// no-scroll audit opens these addresses, because a real lobby starts its game before every
// size and both languages are measured. Every choice is a URL parameter. The time-budget
// test (publicplay/phaseText.test.tsx) renders the same rooms through HarnessRoom.
//
// | Parameter | Values | Default |
// |-----------|--------|---------|
// | kind      | practice, tournament | practice |
// | phase     | lobby, break (tournament), finished | lobby |
// | humans    | people in the room, the viewer "Ayu" first | 5 (tournament: 20) |
// | ready     | 1: the viewer tapped "I'm ready" (lobby or result) | off |
// | status    | break: playing, out | playing |
// | winner    | finished: me, person, bot | person |
// | first     | 1: this result is the device's first (practice) | off |
// | stats     | break or finished: 1, the viewer's statistics card from a round of the default play style; quiet, with one more rule that never ran | off |
//
// The Ready button and the tank's save answer from a pretend server: Ready refuses (there
// is no arena), the save succeeds.

import { useMemo, useState } from "react";
import { botFillSizeOf, PUBLIC_KINDS, type ArenaPhase, type PlayerStatus, type PublicArena, type PublicKind, type PublicPlayer, type RoundSummary } from "@game/arena";
import { DEFAULT_PRESET_ID, PRESETS, STANDARD_RULE_SET_ID, type Standing, type Strategy, type StrategyInput } from "@game/engine";
import type { OwnStats } from "@game/arena";
import { playedStats, quietRuleStrategy } from "../stats/statsFixtures.ts";
import { useMessages } from "../i18n/I18nProvider.tsx";
import { useSecondsUntil } from "../live/countdown.ts";
import { useChatFeed } from "../chat/chatFeed.ts";
import { JoinedRoom } from "../player/PlayerPage.tsx";
import { playerView, type JoinedView } from "../player/playerView.ts";
import type { StrategySource } from "../prep/strategySession.ts";
import { useStrategySession } from "../prep/useStrategySession.ts";
import { INITIAL_STREAM_STATE, type ArenaStreamState } from "../stream/streamState.ts";
import { tankColourByOrder } from "../tank/colours.ts";
import { plainTankLook, randomLook, type TankLook } from "../tank/look.ts";
import { arenaDisplayName } from "./arenaName.ts";

export type HarnessPhase = "lobby" | "break" | "finished";
type Winner = "me" | "person" | "bot";

const ME = "p1";
const START = PRESETS.find((preset) => preset.id === DEFAULT_PRESET_ID)?.strategy as StrategyInput;
// Player names are data, as on a real server. The second one is as long as the name rule allows.
const NAMES = ["Ayu", "Bartholomew Kusu", "Citra", "Dimas", "Eka", "Fajar", "Gita", "Hana", "Irfan", "Joko", "Kirana", "Lestari"];
const BOT_NAMES = ["Splashy", "Drizzle", "Puddle", "Soaker", "Nozzle", "Bubbles", "Squirt", "Ripple"];

function param(name: string): string | null {
  return new URLSearchParams(window.location.search).get(name);
}

function oneOf<T extends string>(value: string | null, options: readonly T[], fallback: T): T {
  return options.find((option) => option === value) ?? fallback;
}

/** People get a made-up look each (the same on every load); bots stay plain, as the server makes them. */
function lookOf(i: number, isBot: boolean): TankLook {
  if (isBot) return plainTankLook(tankColourByOrder(i));
  let seed = (i + 1) * 2654435761;
  return randomLook(() => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  });
}

export interface HarnessOptions {
  readonly kind: PublicKind;
  readonly phase: HarnessPhase;
  readonly humans: number;
  readonly ready: boolean;
  readonly out: boolean;
  readonly winner: Winner;
}

function person(i: number, ready: boolean): PublicPlayer {
  const name = i < NAMES.length ? (NAMES[i] ?? "Ayu") : `${(NAMES[i % NAMES.length] ?? "Ayu").slice(0, 11)} ${Math.floor(i / NAMES.length) + 1}`;
  return { id: `p${i + 1}`, name, status: { kind: "playing" }, isBot: false, ready, look: lookOf(i, false) };
}

function bot(i: number, at: number): PublicPlayer {
  return { id: `b${i + 1}`, name: BOT_NAMES[i % BOT_NAMES.length] ?? "Splashy", status: { kind: "playing" }, isBot: true, ready: false, look: lookOf(at, true) };
}

/** Standings of a round: the order is fixed by the options, the viewer placed where the state needs. */
function standingsOf(ids: readonly string[]): Standing[] {
  return ids.map((botId, i) => ({ botId, score: Math.max(-3, 14 - 2 * i), rank: i + 1, hitsLanded: Math.max(0, 9 - i), hitsTaken: 2 + (i % 4) }));
}

function summary(round: number, isFinal: boolean, ids: readonly string[], through: number): RoundSummary {
  return { round, isFinal, seed: 2026, ruleSetId: STANDARD_RULE_SET_ID, standings: standingsOf(ids), survivors: ids.slice(0, through) };
}

/** Moves `id` to place `index` of the order. */
function placeAt(order: readonly string[], id: string, index: number): string[] {
  const rest = order.filter((x) => x !== id);
  return [...rest.slice(0, index), id, ...rest.slice(index)];
}

function harnessArena({ kind, phase, humans, ready, out, winner }: HarnessOptions): PublicArena {
  const people = Array.from({ length: humans }, (_, i) => person(i, i === 0 ? ready : i % 2 === 1));
  const settings = { name: "", kind, ticksPerRound: kind === "practice" ? 60 : 90, tickMs: 900, ruleSetMode: "standard", botFill: true, joinPolicy: "anyone", tankCount: null } as const;
  const base = { id: "KIT001", settings, game: 3, nextGameInMs: null, chat: null } as const;
  if (phase === "lobby") {
    const auto = { action: "start", inMs: kind === "tournament" ? 42_000 : 12_000 } as const;
    return { ...base, players: people, phase: { kind: "lobby", nextRuleSetId: STANDARD_RULE_SET_ID, start: { kind: "waiting" } }, rounds: [], auto, nextGameInMs: auto.inMs };
  }
  // A game: bots fill the seats as the server does. Nobody is ready once a round started; on the result the viewer may be again.
  const fill = Math.max(0, botFillSizeOf(kind) - people.length);
  const players = [...people.map((p) => ({ ...p, ready: phase === "finished" && p.id === ME ? ready : false })), ...Array.from({ length: fill }, (_, i) => bot(i, people.length + i))];
  const ids = players.map((p) => p.id);
  if (phase === "break") {
    const through = Math.max(8, Math.ceil(ids.length / 2));
    const order = placeAt(ids, ME, out ? ids.length - 2 : 2);
    const first = summary(1, false, order, through);
    const statusOf = (id: string): PlayerStatus => (first.survivors.includes(id) ? { kind: "playing" } : { kind: "eliminated", inRound: 1, finalRank: order.indexOf(id) + 1 });
    const breakPhase: ArenaPhase = { kind: "break", nextRound: 2, nextRuleSetId: STANDARD_RULE_SET_ID, start: { kind: "waiting" } };
    return { ...base, players: players.map((p) => ({ ...p, status: statusOf(p.id) })), phase: breakPhase, rounds: [first], auto: { action: "start", inMs: 15_000 } };
  }
  const winnerId = winner === "me" ? ME : winner === "bot" ? (players.find((p) => p.isBot)?.id ?? ME) : (players.find((p) => !p.isBot && p.id !== ME)?.id ?? ME);
  const order = placeAt(placeAt(ids, ME, winner === "me" ? 0 : 3), winnerId, 0);
  // The tournament played a cut round first; the final is the top 8.
  const finalists = order.slice(0, 8);
  const rounds = order.length > 8 ? [summary(1, false, order, 8), summary(2, true, finalists, 1)] : [summary(1, true, order, 1)];
  const statusOf = (id: string): PlayerStatus => {
    if (id === winnerId) return { kind: "winner" };
    const place = order.indexOf(id) + 1;
    return { kind: "eliminated", inRound: place > 8 ? 1 : rounds.length, finalRank: place };
  };
  // Time left of the result (30 s in the tournament, 20 s elsewhere, apps/server/src/public-kinds.ts).
  const resultMs = kind === "tournament" ? 24_000 : 14_000;
  return { ...base, players: players.map((p) => ({ ...p, status: statusOf(p.id) })), phase: { kind: "finished", winnerId, resultId: null }, rounds, auto: { action: "reset", inMs: resultMs }, nextGameInMs: resultMs + 60_000 };
}

/** The viewer's statistics as the server sends them after the arena's last round, counted from a real round by the engine. */
function harnessStats(arena: PublicArena, kind: "played" | "quiet"): OwnStats {
  const strategy = kind === "quiet" ? quietRuleStrategy() : (START as Strategy);
  const last = playedStats(strategy, arena.settings.ticksPerRound);
  const { modes: _modes, ...numbers } = last;
  return { game: arena.game, round: arena.rounds.at(-1)?.round ?? 1, last, gameTotal: numbers };
}

export function RoomHarness() {
  const kind = oneOf(param("kind"), PUBLIC_KINDS, "practice");
  const options: HarnessOptions = {
    kind,
    phase: oneOf(param("phase"), ["lobby", "break", "finished"] as const, "lobby"),
    humans: Math.max(1, Math.min(64, Number(param("humans") ?? (kind === "tournament" ? 20 : 5)) || 5)),
    ready: param("ready") === "1",
    out: param("status") === "out",
    winner: oneOf(param("winner"), ["me", "person", "bot"] as const, "person"),
  };
  const stats = param("stats");
  return <HarnessRoom options={options} firstResult={param("first") === "1"} stats={stats === "1" ? "played" : stats === "quiet" ? "quiet" : null} />;
}

/** The room of the options, without the address: the kit page and the time-budget test draw it. */
export function HarnessRoom({ options, firstResult, stats = null }: { readonly options: HarnessOptions; readonly firstResult: boolean; readonly stats?: "played" | "quiet" | null }) {
  const m = useMessages();
  const [now] = useState(() => Date.now());
  // The options come from the address, which does not change while the page is open.
  const [arena] = useState(() => harnessArena(options));
  const [ownStats] = useState(() => (stats === null || arena.phase.kind === "lobby" ? null : harnessStats(arena, stats)));
  const stream: ArenaStreamState = {
    ...INITIAL_STREAM_STATE,
    ownStats,
    connection: "open",
    arena,
    nextStep: arena.auto === null ? null : { action: arena.auto.action, at: now + arena.auto.inMs },
    nextGameAt: arena.nextGameInMs === null ? null : now + arena.nextGameInMs,
  };
  const source = useMemo((): StrategySource => {
    let saved = START;
    let draft: StrategyInput | null = null;
    return {
      load: async () => ({ ok: true, data: saved }),
      save: async (next) => {
        saved = next;
        return { ok: true, data: undefined };
      },
      readDraft: () => draft,
      writeDraft: (next) => {
        draft = next;
      },
    };
  }, []);
  const strategy = useStrategySession(source, "room-harness", () => undefined);
  // A public arena has no chat, so nothing is ever published on this feed.
  const chatFeed = useChatFeed();
  const autoSeconds = useSecondsUntil(stream.nextStep?.at ?? null);
  const nextGameSeconds = useSecondsUntil(stream.nextGameAt);
  const view = playerView("open", arena, { playerId: ME, playerToken: "kit" }, true);
  // The harness arena always seats the viewer, so another view is a bug in this file.
  if (!("me" in view)) throw new Error(`The room harness has no seat for its viewer (${view.kind}).`);
  return (
    <JoinedRoom
      view={view satisfies JoinedView}
      session={{ playerId: ME, playerToken: "kit" }}
      stream={stream}
      chatFeed={chatFeed}
      strategy={strategy}
      isOwner={false}
      arenaName={arenaDisplayName(arena.settings, m.publicplay.names)}
      autoSeconds={autoSeconds}
      nextGameSeconds={nextGameSeconds}
      firstResult={firstResult}
      notices={null}
      onLeft={() => undefined}
    />
  );
}
