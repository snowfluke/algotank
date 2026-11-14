// "/kit?show=board&pane=…": the watch panes of live/panes.tsx and the test match in a
// frame like the room's (a header, a one-line status, BottomTabs), without a server,
// so their fit can be checked at every size before the room frame is rebuilt. The
// no-scroll audit opens these addresses; every choice is a URL parameter, so a step
// works in both languages.
//
// | Parameter | Values | Default |
// |-----------|--------|---------|
// | pane      | running, break, finished, test | running |
// | players   | 8, 16, 64, 512 (above 64 the extra tanks are copies on the same squares, because the engine is too slow to play 512 in the browser; use `round` for a real one) | 16 |
// | viewer    | self, none (running: a viewer without a tank) | self |
// | status    | break: playing, out, waiting; finished: won, lost | playing / won |
// | tab       | running: arena, ranking, mytank; break and finished: result, ranking, tank | the first |
// | play      | 1: the turns play at `tick` ms per turn, so the effects can be watched | off |
// | tick      | milliseconds per turn when playing | 900 |
// | rules     | test: quiet, the default play style with one more rule that never runs (the statistics card's sentence) | the default play style |
// | round     | the address of a round recorded by scripts/record-round.ts (for example a real 512-tank round copied next to the build); `players` then comes from the file | none: the engine plays the round |

import { History, ListOrdered, Swords, Trophy, Wrench } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { PlayerId, PublicArena, PublicPlayer, PublicSnapshot, RoundSummary } from "@game/arena";
import { expandTick, isFinalRound, survivorCount } from "@game/arena";
import type { CompactTick } from "@game/arena";
import { DEFAULT_PRESET_ID, PRESETS, STANDARD_RULE_SET_ID, runRound } from "@game/engine";
import type { PublicBot } from "@game/arena";
import type { Decision, Standing, ThrowEvent } from "@game/engine";
import { useMessages } from "../i18n/I18nProvider.tsx";
import { ArenaPane, FinalRankingPane, MyTankPane, RankingPane, ResultPane, roundClock, useRoundTitle } from "../live/panes.tsx";
import { Practice } from "../practice/Practice.tsx";
import { quietRuleStrategy } from "../stats/statsFixtures.ts";
import { PaneTabs } from "../prep/PaneTabs.tsx";
import { PREP_TABS, type PrepTab } from "../prep/PrepPanel.tsx";
import type { ArenaStreamState, OwnDecision } from "../stream/streamState.ts";
import { tankColourByOrder } from "../tank/colours.ts";
import { plainTankLook, randomLook, type TankLook } from "../tank/look.ts";
import { AppHeader } from "../ui/AppHeader.tsx";
import { AppShell } from "../ui/AppShell.tsx";
import { BottomTabs, tabPanelProps } from "../ui/BottomTabs.tsx";
import { useLaptopLayout } from "../ui/layout.ts";

type RunningTab = "arena" | "ranking" | "mytank";
type AfterTab = "result" | "ranking" | "tank";

const ENGINE_PLAYERS_MAX = 64;
const TURNS = 90;
const SEED = 2026;
const OWN_ID = "p1";
const SHOWN_FRAME = 30;

function param(name: string): string | null {
  return new URLSearchParams(window.location.search).get(name);
}

function oneOf<T extends string>(value: string | null, options: readonly T[], fallback: T): T {
  return options.find((option) => option === value) ?? fallback;
}

/** A turn with the public snapshot, so tanks added above the engine's 64 fit in. */
interface HarnessTick {
  readonly decisions: readonly Decision[];
  readonly throws: readonly ThrowEvent[];
  readonly snapshot: PublicSnapshot;
}

interface HarnessData {
  readonly players: readonly PublicPlayer[];
  readonly spawn: PublicSnapshot;
  readonly ticks: readonly HarnessTick[];
  readonly standings: readonly Standing[];
}

/** A real engine round for up to 64 tanks; above that, copies of its tanks fill the list (the engine takes minutes for 512). */
function harnessData(count: number, tankName: (n: number) => string): HarnessData {
  const engineCount = Math.min(count, ENGINE_PLAYERS_MAX);
  const ids = Array.from({ length: engineCount }, (_, i) => `p${i + 1}`);
  const round = runRound({
    seed: SEED,
    ruleSetId: STANDARD_RULE_SET_ID,
    ticksTotal: TURNS,
    survivorsAfterRound: isFinalRound(count) ? null : survivorCount(count),
    players: ids.map((id, i) => {
      const preset = PRESETS[i % PRESETS.length];
      if (preset === undefined) throw new Error("The engine has no play styles.");
      return { id, strategy: preset.strategy };
    }),
  });
  const extra = (bots: readonly PublicBot[]): PublicBot[] =>
    Array.from({ length: count - engineCount }, (_, i) => {
      const source = bots[i % bots.length];
      if (source === undefined) throw new Error("The round has no tanks.");
      return { ...source, id: `p${engineCount + i + 1}`, score: source.score - 1 - (i % 5) };
    });
  const grow = (snapshot: PublicSnapshot): PublicSnapshot =>
    count === engineCount ? snapshot : { ...snapshot, survivorsAfterRound: survivorCount(count), bots: [...snapshot.bots, ...extra(snapshot.bots)] };
  const players: PublicPlayer[] = Array.from({ length: count }, (_, i) => ({
    id: `p${i + 1}`,
    name: i === 0 ? "Ayu" : tankName(i + 1),
    status: { kind: "playing" },
    isBot: i % 3 === 2,
    ready: false,
    look: harnessLook(i, i % 3 === 2),
  }));
  const ticks = round.ticks.map((tick): HarnessTick => ({ decisions: tick.decisions, throws: tick.throws, snapshot: grow(tick.snapshot) }));
  const last = ticks.at(-1)?.snapshot ?? grow(round.spawn);
  const standings = [...last.bots]
    .sort((a, b) => b.score - a.score || b.hitsLanded - a.hitsLanded || a.id.localeCompare(b.id))
    .map((bot, i) => ({ botId: bot.id, score: bot.score, rank: i + 1, hitsLanded: bot.hitsLanded, hitsTaken: bot.hitsTaken }));
  return { players, spawn: grow(round.spawn), ticks, standings };
}

/**
 * A look per harness tank: people get a different made-up look each (the same one on every
 * load, from a seeded sequence), bots stay plain as the server makes them, so the 8 and
 * 64 tank checks look like a real round.
 */
function harnessLook(i: number, isBot: boolean): TankLook {
  if (isBot) return plainTankLook(tankColourByOrder(i));
  let seed = (i + 1) * 2654435761;
  const next = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };
  return randomLook(next);
}

const SETTINGS = { name: "Board check", kind: "private", botFill: true, joinPolicy: "anyone", ticksPerRound: TURNS, tickMs: 900, ruleSetMode: "standard", tankCount: 8 } as const;

function summaryOf(data: HarnessData, round: number): RoundSummary {
  const final = isFinalRound(data.players.length);
  const through = final ? 1 : survivorCount(data.players.length);
  return { round, isFinal: final, seed: SEED, ruleSetId: STANDARD_RULE_SET_ID, standings: data.standings, survivors: data.standings.slice(0, through).map((s) => s.botId) };
}

function ownDecisions(ticks: readonly HarnessTick[], frame: number): OwnDecision[] {
  return ticks
    .slice(Math.max(0, frame - 5), frame)
    .flatMap((tick, i) => {
      const decision = tick.decisions.find((d) => d.botId === OWN_ID);
      return decision === undefined ? [] : [{ tick: frame - Math.min(frame, 5) + i + 1, decision, throwEvent: tick.throws.find((t) => t.throwerId === OWN_ID) ?? null }];
    });
}

/** The file scripts/record-round.ts writes. */
interface RecordedRound {
  readonly spawn: PublicSnapshot;
  readonly ticks: readonly CompactTick[];
  readonly own: readonly (Decision | null)[];
}

/** A recorded round as harness data. The file is a check tool's own output, so a wrong shape throws and the harness says so. */
function recordedData(round: RecordedRound, tankName: (n: number) => string): HarnessData {
  const { spawn } = round;
  const ticks = round.ticks.map((compact, i): HarnessTick => {
    const tick = expandTick(compact, spawn);
    const own = round.own[i] ?? null;
    return { decisions: own === null ? [] : [own], throws: tick.throws, snapshot: tick.snapshot };
  });
  const players: PublicPlayer[] = spawn.bots.map((bot, i) => ({
    id: bot.id,
    name: bot.id === OWN_ID ? "Ayu" : tankName(i + 1),
    status: { kind: "playing" },
    isBot: i % 3 === 2,
    ready: false,
    look: harnessLook(i, i % 3 === 2),
  }));
  const last = ticks.at(-1)?.snapshot ?? spawn;
  const standings = [...last.bots]
    .sort((a, b) => b.score - a.score || b.hitsLanded - a.hitsLanded || a.id.localeCompare(b.id))
    .map((bot, i) => ({ botId: bot.id, score: bot.score, rank: i + 1, hitsLanded: bot.hitsLanded, hitsTaken: bot.hitsTaken }));
  return { players, spawn, ticks, standings };
}

type Loaded = { readonly kind: "loading" } | { readonly kind: "failed"; readonly reason: string } | { readonly kind: "ready"; readonly data: HarnessData };

function useRecordedRound(url: string | null, tankName: (n: number) => string): Loaded | null {
  const [loaded, setLoaded] = useState<Loaded>({ kind: "loading" });
  useEffect(() => {
    if (url === null) return;
    let live = true;
    fetch(url)
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json() as Promise<RecordedRound>;
      })
      .then((round) => {
        if (live) setLoaded({ kind: "ready", data: recordedData(round, tankName) });
      })
      .catch((error: unknown) => {
        if (live) setLoaded({ kind: "failed", reason: error instanceof Error ? error.message : String(error) });
      });
    return () => {
      live = false;
    };
  }, [url, tankName]);
  return url === null ? null : loaded;
}

export function PaneHarness() {
  const m = useMessages();
  const h = m.board.harness;
  const scene = oneOf(param("pane"), ["running", "break", "finished", "test"] as const, "running");
  const count = Number(oneOf(param("players"), ["8", "16", "64", "512"] as const, "16"));
  const recorded = useRecordedRound(param("round"), h.tankName);
  const computed = useMemo(() => (recorded === null ? harnessData(count, h.tankName) : null), [recorded, count, h.tankName]);
  if (scene === "test") return <TestScene />;
  if (recorded !== null && recorded.kind !== "ready") {
    return (
      <Frame status={recorded.kind === "loading" ? h.roundLoading : h.roundFailed(recorded.reason)} tabs={null}>
        {null}
      </Frame>
    );
  }
  const data = recorded?.data ?? computed;
  if (data === null) throw new Error("The harness has no round.");
  if (scene === "running") return <RunningScene data={data} />;
  return <AfterScene data={data} finished={scene === "finished"} />;
}

function Frame({ status, tabs, children }: { status: string; tabs: ReactNode; children: ReactNode }) {
  const m = useMessages();
  return (
    <AppShell header={<AppHeader title={m.board.harness.heading} />} bottom={tabs}>
      <p className="shrink-0 truncate pb-2 font-display font-semibold" data-harness-status="">
        {status}
      </p>
      {children}
    </AppShell>
  );
}

function RunningScene({ data }: { data: HarnessData }) {
  const m = useMessages();
  const h = m.board.harness;
  const viewerId: PlayerId | null = param("viewer") === "none" ? null : OWN_ID;
  const tickMs = Number(param("tick") ?? "900") || 900;
  const playing = param("play") === "1";
  const [frame, setFrame] = useState(SHOWN_FRAME);
  const [tab, setTab] = useState<RunningTab>(oneOf(param("tab"), ["arena", "ranking", "mytank"] as const, "arena"));
  const laptop = useLaptopLayout();

  useEffect(() => {
    if (!playing) return;
    const timer = setInterval(() => setFrame((current) => (current >= data.ticks.length ? 1 : current + 1)), tickMs);
    return () => clearInterval(timer);
  }, [playing, tickMs, data]);

  const tick = data.ticks[frame - 1];
  const arena: PublicArena = {
    id: "KIT001",
    settings: { ...SETTINGS, tickMs },
    players: data.players,
    phase: {
      kind: "running",
      round: 2,
      isFinal: isFinalRound(data.players.length),
      seed: SEED,
      ruleSetId: STANDARD_RULE_SET_ID,
      playerIds: data.players.map((p) => p.id),
      survivorsAfterRound: isFinalRound(data.players.length) ? null : survivorCount(data.players.length),
    },
    rounds: [],
    game: 1,
    auto: null,
    nextGameInMs: null,
    chat: "on",
  };
  const stream: ArenaStreamState = {
    connection: "open",
    arena,
    snapshotRound: 2,
    snapshot: tick?.snapshot ?? data.spawn,
    roundSpawn: data.spawn,
    throws: tick?.throws ?? [],
    ownDecisions: viewerId === null ? [] : ownDecisions(data.ticks, frame),
    protocolError: null,
    firstTurnAt: null,
    nextStep: null,
    nextGameAt: null,
    opens: 1,
    playerToken: null,
    ownStats: null,
  };
  const title = useRoundTitle(arena);
  const clock = roundClock(arena, stream);
  const preset = PRESETS.find((p) => p.id === DEFAULT_PRESET_ID) ?? PRESETS[0];
  if (preset === undefined) throw new Error("The engine has no play styles.");
  const panes: Record<RunningTab, ReactNode> = {
    arena: laptop ? (
      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_minmax(0,20rem)] gap-6">
        <ArenaPane arena={arena} stream={stream} viewerId={viewerId} />
        <RankingPane arena={arena} stream={stream} viewerId={viewerId} />
      </div>
    ) : (
      <ArenaPane arena={arena} stream={stream} viewerId={viewerId} />
    ),
    ranking: <RankingPane arena={arena} stream={stream} viewerId={viewerId} />,
    mytank: <MyTankPane decisions={stream.ownDecisions} strategy={preset.strategy} />,
  };
  return (
    <Frame
      status={`${title ?? ""} · ${clock ?? ""}`}
      tabs={
        <BottomTabs
          idBase="kit-room"
          label={h.heading}
          value={tab}
          onChange={setTab}
          tabs={[
            { value: "arena", label: h.tabs.arena, icon: <Swords aria-hidden size={22} /> },
            { value: "ranking", label: h.tabs.ranking, icon: <ListOrdered aria-hidden size={22} /> },
            { value: "mytank", label: h.tabs.mytank, icon: <History aria-hidden size={22} /> },
          ]}
        />
      }
    >
      <div {...tabPanelProps("kit-room", tab)} className="flex min-h-0 flex-1 flex-col">
        {panes[tab]}
      </div>
    </Frame>
  );
}

function AfterScene({ data, finished }: { data: HarnessData; finished: boolean }) {
  const m = useMessages();
  const h = m.board.harness;
  const [tab, setTab] = useState<AfterTab>(oneOf(param("tab"), ["result", "ranking", "tank"] as const, "result"));
  const laptop = useLaptopLayout();
  const summary = summaryOf(data, finished ? 3 : 1);
  const status = param("status");
  const winnerId = summary.standings[0]?.botId ?? OWN_ID;
  const rank = (place: number) => summary.standings[Math.min(place, summary.standings.length) - 1]?.botId ?? OWN_ID;
  // The viewer: a tank that went through, the last tank (out), a player who joined during the game, the winner, or third place.
  const meId = finished ? (status === "lost" ? rank(3) : winnerId) : status === "out" ? rank(summary.standings.length) : status === "waiting" ? "late" : rank(1);
  const players: PublicPlayer[] = [
    // The viewer is a person, never a bot, whichever tank the harness picked.
    ...data.players.map((source): PublicPlayer => {
      const p = source.id === meId ? { ...source, isBot: false } : source;
      const place = summary.standings.find((s) => s.botId === p.id)?.rank ?? 1;
      const survived = summary.survivors.includes(p.id);
      if (finished) return { ...p, status: p.id === winnerId ? { kind: "winner" } : { kind: "eliminated", inRound: summary.round, finalRank: place } };
      return { ...p, status: survived ? { kind: "playing" } : { kind: "eliminated", inRound: summary.round, finalRank: place } };
    }),
    ...(status === "waiting" && !finished ? [{ id: "late", name: "Lina", status: { kind: "waiting" } as const, isBot: false, ready: false, look: harnessLook(99, false) }] : []),
  ];
  const arena: PublicArena = {
    id: "KIT001",
    settings: SETTINGS,
    players,
    phase: finished ? { kind: "finished", winnerId, resultId: null } : { kind: "break", nextRound: 2, nextRuleSetId: null, start: { kind: "waiting" } },
    rounds: [summary],
    game: 1,
    auto: null,
    nextGameInMs: null,
    chat: "on",
  };
  const me = players.find((p) => p.id === meId) ?? players[0];
  if (me === undefined) throw new Error("The harness has no players.");
  const panes: Record<AfterTab, ReactNode> = {
    result: laptop ? (
      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-6">
        <ResultPane arena={arena} me={me} />
        <FinalRankingPane arena={arena} me={me} />
      </div>
    ) : (
      <ResultPane arena={arena} me={me} />
    ),
    ranking: <FinalRankingPane arena={arena} me={me} />,
    tank: <p className="text-muted">{h.tankPlaceholder}</p>,
  };
  return (
    <Frame
      status={finished ? h.statusFinished : h.statusBreak}
      tabs={
        <BottomTabs
          idBase="kit-room"
          label={h.heading}
          value={tab}
          onChange={setTab}
          tabs={[
            { value: "result", label: h.tabs.result, icon: <Trophy aria-hidden size={22} /> },
            { value: "ranking", label: h.tabs.ranking, icon: <ListOrdered aria-hidden size={22} /> },
            { value: "tank", label: h.tabs.tank, icon: <Wrench aria-hidden size={22} /> },
          ]}
        />
      }
    >
      <div {...tabPanelProps("kit-room", tab)} className="flex min-h-0 flex-1 flex-col">
        {panes[tab]}
      </div>
    </Frame>
  );
}

/** The test match where the preparation pane places it: one tab of the room's tank pane. */
function TestScene() {
  const m = useMessages();
  const h = m.board.harness;
  const preset = PRESETS.find((p) => p.id === DEFAULT_PRESET_ID) ?? PRESETS[0];
  if (preset === undefined) throw new Error("The engine has no play styles.");
  const [tab, setTab] = useState<"tank" | "players" | "invite">("tank");
  const [prepTab, setPrepTab] = useState<PrepTab>("try");
  const [strategy] = useState(() => (param("rules") === "quiet" ? quietRuleStrategy() : preset.strategy));
  return (
    <Frame
      status={h.statusLobby}
      tabs={
        <BottomTabs
          idBase="kit-room"
          label={h.heading}
          value={tab}
          onChange={setTab}
          tabs={[
            { value: "tank", label: h.tabs.tank, icon: <Wrench aria-hidden size={22} /> },
            { value: "players", label: h.tabs.players, icon: <ListOrdered aria-hidden size={22} /> },
            { value: "invite", label: h.tabs.invite, icon: <Trophy aria-hidden size={22} /> },
          ]}
        />
      }
    >
      {/* The preparation pane's own tab row (prep/PrepPanel.tsx), so the test match gets the box it gets in the room. */}
      <PaneTabs label={m.prep.tabsLabel} value={prepTab} onChange={setPrepTab} tabs={PREP_TABS.map((value) => ({ value, label: m.prep.tabs[value] }))}>
        <Practice strategy={strategy} name="Ayu" defaultRuleSetId={STANDARD_RULE_SET_ID} look={harnessLook(0, false)} />
      </PaneTabs>
    </Frame>
  );
}
