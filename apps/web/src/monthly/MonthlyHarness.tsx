// "/kit?show=monthly": the monthly page's states without a server, for the no-scroll audit.
// The league is one shared thing per server, so a real page cannot be put in each state on demand.
//
// Parameters: `case` = visitor (5 tanks), empty, one (1 tank and the bot), seated (16 tanks, the
// owner's tank in the shown league), other (the owner's tank plays in League 2, League 1 shows),
// move (seated, with the month close's notice), dayDone (the finished day over the board),
// closing (the day's end is being recorded), failed (the stream was refused), crowd (40 tanks on
// the board a full tournament league grows to, the owner's tank among them), ranked (the owner's
// tank with a place in the month and 12 turns in its feed: the longest own pane);
// `tanks` = a number of tanks in place of the case's own, and `field` = open puts the board on the
// open-field rules, whose board is larger (27 tanks give 23 x 17, 40 give 28 x 21);
// `stream=<url>` replays a recorded league (apps/server/scripts/perf-stream.ts) turn by turn, with the
// day's clock running, so the board's cost shows with hundreds of tanks that move;
// `leagues` = 1 (default), 2 or 9; `tab` = arena, ranking, mine or activity (the phone's tab);
// `side` = today, month, mine or activity (beside the board); `activity` = full adds a full
// activity list; `quit` = 1 opens the quit question.

import { LEAGUE_ACTIVITY_LIMIT } from "@game/arena";
import { RULE_SET_IDS, STANDARD_RULE_SET_ID, type RuleSetId } from "@game/engine";
import { useMemo, useState } from "react";
import { AppHeader } from "../ui/AppHeader.tsx";
import { AppShell } from "../ui/AppShell.tsx";
import { Dialog } from "../ui/Dialog.tsx";
import { useFitLayout, useLaptopLayout } from "../ui/layout.ts";
import { useMessages } from "../i18n/I18nProvider.tsx";
import { FIXTURE_MOVE, fixtureActivity, fixtureDays, fixtureLeagues, fixtureLive, fixtureLoad, fixtureOwnTurns, fixtureRanking, fixtureRankedSeat, fixtureSeat } from "./monthlyFixtures.ts";
import type { LeagueLiveLoad } from "./leagueLive.ts";
import { useStreamReplay } from "./useStreamReplay.ts";
import { MonthlyPhoneBar, MonthlyView, type DayChange, type MonthlySide, type MonthlyTab } from "./MonthlyView.tsx";

const CASES = ["visitor", "empty", "one", "seated", "other", "move", "dayDone", "closing", "failed", "crowd", "ranked", "reshuffled"] as const;
type Case = (typeof CASES)[number];

function param<T extends string>(name: string, values: readonly T[], fallback: T): T {
  const value = new URLSearchParams(window.location.search).get(name);
  return values.find((v) => v === value) ?? fallback;
}

const TANKS: Record<Case, number> = { visitor: 5, empty: 0, one: 1, seated: 16, other: 16, move: 16, dayDone: 16, closing: 16, failed: 5, crowd: 40, ranked: 16, reshuffled: 16 };

/** `tanks=27` in the address puts that many tanks on the board in place of the case's own. */
function tanksParam(fallback: number): number {
  const value = Number(new URLSearchParams(window.location.search).get("tanks"));
  return Number.isInteger(value) && value > 0 && value <= 512 ? value : fallback;
}

export function MonthlyHarness() {
  const m = useMessages();
  const which = param("case", CASES, "visitor");
  const leagueCount = Number(param("leagues", ["1", "2", "9"], "1"));
  const [tab, setTab] = useState<MonthlyTab>(param<MonthlyTab>("tab", ["arena", "ranking", "mine", "activity"], "arena"));
  const [side, setSide] = useState<MonthlySide>(param<MonthlySide>("side", ["today", "month", "mine", "activity"], "today"));
  // quit=1: the quit dialog. "Change rules" opens the join steps' tank step, which the join audit covers.
  const [quitting, setQuitting] = useState<"leave" | null>(() => {
    const value = new URLSearchParams(window.location.search).get("quit");
    return value === "1" ? "leave" : null;
  });
  const [league, setLeague] = useState(1);
  const laptop = useLaptopLayout();
  const fit = useFitLayout();
  const presenter = laptop && fit;
  const streamUrl = new URLSearchParams(window.location.search).get("stream");
  const replay = useStreamReplay(streamUrl);
  const [now] = useState(() => Date.now());
  const seated = which === "seated" || which === "other" || which === "move" || which === "dayDone" || which === "closing" || which === "crowd" || which === "ranked";
  // Memoised: a seat holds the statistics of 300 simulated turns, and the page gets one seat per read, not one per render.
  const seat = useMemo(() => (which === "ranked" ? fixtureRankedSeat(league) : seated ? fixtureSeat(which === "other" ? 2 : league) : null), [which, league, seated]);
  // rules=<id>: the round's arena condition, so the audit can show the longest name (open-field).
  const rules = param<RuleSetId>("rules", RULE_SET_IDS, STANDARD_RULE_SET_ID);
  const tanks = tanksParam(TANKS[which]);
  const field = param("field", ["standard", "open"], "standard");
  // field=open draws the larger open-field board; rules=<id> only names another condition over the same board.
  const fullActivity = param("activity", ["empty", "full"], "empty") === "full";
  const live = useMemo(() => ({
    ...fixtureLive(league, tanks, field === "open" ? "open-field" : rules),
    activity: fixtureActivity(now, fullActivity ? LEAGUE_ACTIVITY_LIMIT : 0),
  }), [league, tanks, field, rules, fullActivity, now]);
  const shownLive = replay?.kind === "ready" ? replay.board.live : live;
  const ranking = useMemo(() => (tanks === 0 ? { ...fixtureRanking(shownLive), today: [], thisMonth: [] } : fixtureRanking(shownLive)), [shownLive, tanks]);
  const load: LeagueLiveLoad =
    streamUrl !== null
      ? (replay ?? { kind: "connecting" })
      : which === "failed" ? { kind: "connecting" } : fixtureLoad(which === "closing" ? { ...live, dayEndsInMs: 0 } : live, now, which === "ranked" ? fixtureOwnTurns(12) : []);
  const dayChange: DayChange | null = which === "dayDone" ? { kind: "done", day: "2026-11-13", winner: fixtureDays(league)[0] ?? null } : null;
  const leagues = useMemo(() => fixtureLeagues(Math.max(leagueCount, which === "other" ? 2 : 1), 37), [leagueCount, which]);
  const days = useMemo(() => fixtureDays(league), [league]);
  const onJoin = seat === null ? () => undefined : null;
  return (
    <AppShell
      width="full"
      header={<AppHeader {...(presenter ? {} : { title: m.common.pageTitles.monthly })} />}
      bottom={presenter ? undefined : <MonthlyPhoneBar seat={seat} onJoin={onJoin} tab={tab} onTab={setTab} />}
    >
      <MonthlyView
        league={league}
        leagues={leagues}
        onLeague={setLeague}
        load={load}
        connection={which === "failed" ? "failed" : "open"}
        onRetry={() => undefined}
        {...(streamUrl === null ? { now } : {})}
        ranking={ranking}
        days={days}
        seat={seat}
        move={which === "move" ? FIXTURE_MOVE : null}
        onMoveSeen={() => undefined}
        onJoin={onJoin}
        dayChange={dayChange}
        reshuffled={which === "reshuffled"}
        onQuit={() => setQuitting("leave")}
        onChangeRules={() => undefined}
        onChangeLook={() => undefined}
        tab={tab}
        onTab={setTab}
        side={side}
        onSide={setSide}
      />
      {seat === null ? null : (
        <Dialog
          open={quitting !== null}
          hook="monthly-quit"
          title={m.monthly.quit.title}
          body={m.monthly.quit.bodyCounted(seat.points)}
          confirmLabel={m.monthly.quit.confirm}
          onConfirm={() => setQuitting(null)}
          onCancel={() => setQuitting(null)}
        />
      )}
    </AppShell>
  );
}
