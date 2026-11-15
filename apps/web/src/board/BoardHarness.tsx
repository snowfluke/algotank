// "/kit?show=board": the arena board and the test match without a server. Rounds
// run in the browser with the engine, so an engineer can look at 8, 16 and 64
// tanks under every rule set, a paused turn with each kind of shot, the countdown,
// the own-tank highlight and the test match, at phone and big-screen sizes.

import { plainTankLook } from "../tank/look.ts";
import { useEffect, useMemo, useState } from "react";
import type { PublicSnapshot } from "@game/arena";
import { isFinalRound, survivorCount } from "@game/arena";
import { DEFAULT_PRESET_ID, PRESETS, RULE_SET_IDS, STANDARD_RULE_SET_ID, runRound } from "@game/engine";
import type { BoardItem, BotId, Direction, ItemKind, RuleSetId, TankEffect, ThrowEvent, TickResult } from "@game/engine";
import { useMessages } from "../i18n/I18nProvider.tsx";
import { Practice } from "../practice/Practice.tsx";
import { AppHeader } from "../ui/AppHeader.tsx";
import { Button } from "../ui/Button.tsx";
import { Page } from "../ui/Page.tsx";
import { SegmentedControl } from "../ui/SegmentedControl.tsx";
import { ArenaBoard } from "./ArenaBoard.tsx";
import { LegendButton } from "./BoardLegend.tsx";
import { PaneHarness } from "./PaneHarness.tsx";
import { Scoreboard } from "./Scoreboard.tsx";

type Scene = "round" | "turn" | "match";
type Layout = "page" | "screen";
const PLAYER_COUNTS = ["8", "16", "64"] as const;
type PlayerCount = (typeof PLAYER_COUNTS)[number];
const OWN_ID: BotId = "p1";
const TICK_MS = 400;
const TURNS = 120;
/** A fixed seed, so each screenshot of the same choices shows the same round. */
const SEED = 2026;
const WALL_SQUARES = 0.6;

interface HarnessRound {
  readonly spawn: PublicSnapshot;
  readonly ticks: readonly TickResult[];
  readonly names: Readonly<Record<BotId, string>>;
}

/** The engine's own round with the play styles in turn, so 64 tanks are possible (a test match stops at 16). */
function harnessRound(players: number, ruleSetId: RuleSetId, tankName: (n: number) => string): HarnessRound {
  const ids = Array.from({ length: players }, (_, i) => `p${i + 1}`);
  const { spawn, ticks } = runRound({
    seed: SEED,
    ruleSetId,
    ticksTotal: TURNS,
    survivorsAfterRound: isFinalRound(players) ? null : survivorCount(players),
    items: true,
    players: ids.map((id, i) => {
      const preset = PRESETS[i % PRESETS.length];
      if (preset === undefined) throw new Error("The engine has no play styles.");
      return { id, strategy: preset.strategy };
    }),
  });
  const names = Object.fromEntries(ids.map((id, i) => [id, id === OWN_ID ? "Ayu" : tankName(i + 1)]));
  return { spawn, ticks, names };
}

/**
 * One turn laid out by hand on an 8 by 6 floor: a hit with a bucket ("+2"), a throw an
 * umbrella blocks, a dry shot and a shot into nothing, all along diagonals so the kit shows
 * how a diagonal jet, splash and open umbrella look, and one tank facing straight north for
 * comparison. Every item lies on the floor once (the umbrella in its last turns), three tanks
 * hold one, one tank is dizzy and one is stuck (84-items.md).
 */
function pausedTurn(tankName: (n: number) => string): { snapshot: PublicSnapshot; throws: ThrowEvent[]; names: Record<BotId, string> } {
  const place = (id: string, x: number, y: number, direction: Direction, score: number, water: number, item: ItemKind | null = null, effect: TankEffect | null = null) => ({
    id,
    x,
    y,
    direction,
    score,
    water,
    wasHit: false,
    build: {},
    hitsLanded: 0,
    hitsTaken: 0,
    item,
    effect,
  });
  const bots = [
    place("p1", 1, 1, "SE", 4, 6),
    place("p2", 3, 3, "NW", 1, 9),
    place("p3", 6, 0, "SW", 2, 6),
    place("p4", 4, 2, "NE", 0, 9, null, { kind: "dizzy", turnsLeft: 2 }),
    place("p5", 7, 5, "NW", 1, 1, "mudBall"),
    place("p6", 6, 4, "SE", 2, 7, null, { kind: "stuck", turnsLeft: 1 }),
    place("p7", 2, 5, "NE", 0, 6, "pinwheel"),
    place("p8", 0, 3, "N", 1, 9, "umbrella"),
  ];
  const items: BoardItem[] = [
    { kind: "bucket", x: 0, y: 0, turnsLeft: 22 },
    { kind: "umbrella", x: 2, y: 1, turnsLeft: 3 },
    { kind: "pinwheel", x: 5, y: 3, turnsLeft: 18 },
    { kind: "mudBall", x: 7, y: 2, turnsLeft: 25 },
  ];
  const throws: ThrowEvent[] = [
    { throwerId: "p1", outcome: "hit", targetId: "p2", distance: 2, hitChance: 60, bucket: true },
    { throwerId: "p3", outcome: "blocked", targetId: "p4", distance: 2, hitChance: 60 },
    { throwerId: "p5", outcome: "dry", targetId: "p6", distance: 1 },
    { throwerId: "p7", outcome: "empty" },
  ];
  const names = Object.fromEntries(bots.map((bot, i) => [bot.id, bot.id === OWN_ID ? "Ayu" : tankName(i + 1)]));
  return { snapshot: { width: 8, height: 6, tick: 37, ticksTotal: TURNS, survivorsAfterRound: null, ruleSetId: STANDARD_RULE_SET_ID, bots, items }, throws, names };
}

export function BoardHarness() {
  // "&pane=…" shows the watch panes in a room-like frame instead (board/PaneHarness.tsx).
  return new URLSearchParams(window.location.search).has("pane") ? <PaneHarness /> : <BoardScenes />;
}

function BoardScenes() {
  const m = useMessages();
  const h = m.board.harness;
  const [scene, setScene] = useState<Scene>("round");
  const [players, setPlayers] = useState<PlayerCount>("8");
  const [ruleSetId, setRuleSetId] = useState<RuleSetId>(STANDARD_RULE_SET_ID);
  const [own, setOwn] = useState<"shown" | "hidden">("shown");
  const [layout, setLayout] = useState<Layout>("page");
  const [frame, setFrame] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [turnRun, setTurnRun] = useState<{ key: number; live: boolean }>({ key: 0, live: false });

  const round = useMemo(() => harnessRound(Number(players), ruleSetId, h.tankName), [players, ruleSetId, h.tankName]);
  const turn = useMemo(() => pausedTurn(h.tankName), [h.tankName]);

  useEffect(() => {
    setFrame(0);
    setPlaying(false);
    setCountdown(null);
  }, [round]);

  useEffect(() => {
    if (countdown === null) return;
    const timer = setTimeout(() => {
      if (countdown > 1) {
        setCountdown(countdown - 1);
      } else {
        setCountdown(null);
        setPlaying(true);
      }
    }, 1000);
    return () => clearTimeout(timer);
  }, [countdown]);

  useEffect(() => {
    if (!playing) return;
    const timer = setInterval(() => setFrame((current) => (current >= round.ticks.length ? 0 : current + 1)), TICK_MS);
    return () => clearInterval(timer);
  }, [playing, round]);

  const highlightId = own === "shown" ? OWN_ID : null;
  const tick = frame === 0 ? undefined : round.ticks[frame - 1];
  const snapshot = scene === "turn" ? turn.snapshot : (tick?.snapshot ?? round.spawn);
  const throws = scene === "turn" ? turn.throws : (tick?.throws ?? []);
  const names = scene === "turn" ? turn.names : round.names;
  const ratio = (snapshot.width + WALL_SQUARES) / (snapshot.height + WALL_SQUARES);
  const big = layout === "screen";

  const board = (
    <div className="flex min-w-0 justify-center">
      <div
        className="min-w-0"
        style={{ aspectRatio: `${ratio}`, width: big ? `min(100%, calc((100dvh - 3rem) * ${ratio}))` : `min(100%, calc(80dvh * ${ratio}))` }}
      >
        <ArenaBoard
          key={scene === "turn" ? `turn-${turnRun.key}` : "round"}
          snapshot={snapshot}
          throws={throws}
          names={names}
          highlightId={highlightId}
          tickMs={TICK_MS}
          countdown={scene === "round" ? countdown : null}
          paused={scene === "turn" ? !turnRun.live : !playing}
        />
      </div>
    </div>
  );

  const controls = (
    <div className="flex min-w-0 flex-col gap-4">
      <SegmentedControl legend={h.scene} value={scene} onChange={setScene} options={(["round", "turn", "match"] as const).map((value) => ({ value, label: h.scenes[value] }))} />
      {scene === "round" ? (
        <>
          <SegmentedControl legend={h.tanks} value={players} onChange={setPlayers} options={PLAYER_COUNTS.map((value) => ({ value, label: value }))} />
          <SegmentedControl
            legend={h.roundRules}
            size="sm"
            value={ruleSetId}
            onChange={setRuleSetId}
            options={RULE_SET_IDS.map((value) => ({ value, label: m.vocabulary.roundRules[value].name }))}
          />
        </>
      ) : null}
      {scene === "match" ? null : (
        <div className="flex min-w-0 flex-wrap items-end gap-4">
          <SegmentedControl legend={h.ownTank} value={own} onChange={setOwn} options={(["shown", "hidden"] as const).map((value) => ({ value, label: h.ownTankOptions[value] }))} />
          <SegmentedControl legend={h.layout} value={layout} onChange={setLayout} options={(["page", "screen"] as const).map((value) => ({ value, label: h.layouts[value] }))} />
        </div>
      )}
      {scene === "round" ? (
        <div className="flex min-w-0 flex-wrap items-center gap-3">
          <Button
            onClick={() => {
              setPlaying(false);
              setFrame(0);
              setCountdown(3);
            }}
          >
            {h.countdown}
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              setCountdown(null);
              setPlaying(!playing);
            }}
          >
            {playing ? h.pause : h.play}
          </Button>
          <span className="tabular text-muted">{h.turnOf(frame, round.ticks.length)}</span>
        </div>
      ) : null}
      {scene === "turn" ? (
        <Button className="self-start" onClick={() => setTurnRun((current) => ({ key: current.key + 1, live: true }))}>
          {h.playTurn}
        </Button>
      ) : null}
    </div>
  );

  if (scene === "match") {
    const preset = PRESETS.find((candidate) => candidate.id === DEFAULT_PRESET_ID) ?? PRESETS[0];
    if (preset === undefined) throw new Error("The engine has no play styles.");
    return (
      <>
        <AppHeader title={h.heading} />
        <Page width="editor">
          {controls}
          <Practice strategy={preset.strategy} name="Ayu" defaultRuleSetId={STANDARD_RULE_SET_ID} look={plainTankLook(4)} />
        </Page>
      </>
    );
  }

  if (big) {
    return (
      <div data-scale="screen" className="flex min-h-dvh flex-col gap-6 bg-ground p-6">
        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_minmax(0,24rem)] items-start gap-8">
          {board}
          <Scoreboard snapshot={snapshot} names={names} highlightId={highlightId} maxRows={12} />
        </div>
        {controls}
      </div>
    );
  }

  return (
    <>
      <AppHeader title={h.heading} />
      <Page width="editor">
        {controls}
        <div className="grid min-w-0 grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,18rem)]">
          {board}
          <Scoreboard snapshot={snapshot} names={names} highlightId={highlightId} maxRows={8} />
        </div>
        <LegendButton />
      </Page>
    </>
  );
}
