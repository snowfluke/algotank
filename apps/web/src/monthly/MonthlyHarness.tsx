// "/kit?show=monthly": the monthly page's states without a server, for the no-scroll audit.
// The league is one shared thing per server, so a real page cannot be put in each state on demand.
//
// Parameters: `case` = visitor (5 tanks), empty, one (1 tank and the bot), seated (16 tanks, the
// owner's tank in the shown league), other (the owner's tank plays in League 2, League 1 shows),
// move (seated, with the month close's notice), dayDone (the finished day over the board),
// closing (the day's end is being recorded), failed (the stream was refused);
// `leagues` = 1 (default), 2 or 9; `tab` = arena, ranking or mine (the phone's tab); `side` =
// today, month or mine (the pane beside the board, and the phone's ranking switch); `quit` = 1
// opens the quit question.

import { useMemo, useState } from "react";
import { AppHeader } from "../ui/AppHeader.tsx";
import { AppShell } from "../ui/AppShell.tsx";
import { Dialog } from "../ui/Dialog.tsx";
import { useFitLayout, useLaptopLayout } from "../ui/layout.ts";
import { useMessages } from "../i18n/I18nProvider.tsx";
import { FIXTURE_MOVE, fixtureDays, fixtureLeagues, fixtureLive, fixtureLoad, fixtureRanking, fixtureSeat } from "./monthlyFixtures.ts";
import type { LeagueLiveLoad } from "./leagueLive.ts";
import { MonthlyPhoneBar, MonthlyView, type DayChange, type MonthlySide, type MonthlyTab } from "./MonthlyView.tsx";

const CASES = ["visitor", "empty", "one", "seated", "other", "move", "dayDone", "closing", "failed"] as const;
type Case = (typeof CASES)[number];

function param<T extends string>(name: string, values: readonly T[], fallback: T): T {
  const value = new URLSearchParams(window.location.search).get(name);
  return values.find((v) => v === value) ?? fallback;
}

const TANKS: Record<Case, number> = { visitor: 5, empty: 0, one: 1, seated: 16, other: 16, move: 16, dayDone: 16, closing: 16, failed: 5 };

export function MonthlyHarness() {
  const m = useMessages();
  const which = param("case", CASES, "visitor");
  const leagueCount = Number(param("leagues", ["1", "2", "9"], "1"));
  const [tab, setTab] = useState<MonthlyTab>(param<MonthlyTab>("tab", ["arena", "ranking", "mine"], "arena"));
  const [side, setSide] = useState<MonthlySide>(param<MonthlySide>("side", ["today", "month", "mine"], "today"));
  const [quitting, setQuitting] = useState(new URLSearchParams(window.location.search).get("quit") === "1");
  const [league, setLeague] = useState(1);
  const laptop = useLaptopLayout();
  const fit = useFitLayout();
  const presenter = laptop && fit;
  const [now] = useState(() => Date.now());
  const seated = which === "seated" || which === "other" || which === "move" || which === "dayDone" || which === "closing";
  const seat = seated ? fixtureSeat(which === "other" ? 2 : league) : null;
  const live = useMemo(() => fixtureLive(league, TANKS[which]), [league, which]);
  const load: LeagueLiveLoad = which === "failed" ? { kind: "connecting" } : fixtureLoad(which === "closing" ? { ...live, dayEndsInMs: 0 } : live, now);
  const dayChange: DayChange | null = which === "dayDone" ? { kind: "done", day: "2026-11-13", winner: fixtureDays(league)[0] ?? null } : null;
  const leagues = fixtureLeagues(Math.max(leagueCount, which === "other" ? 2 : 1), 37);
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
        now={now}
        ranking={TANKS[which] === 0 ? { ...fixtureRanking(live), today: [], thisMonth: [] } : fixtureRanking(live)}
        days={fixtureDays(league)}
        seat={seat}
        move={which === "move" ? FIXTURE_MOVE : null}
        onMoveSeen={() => undefined}
        onJoin={onJoin}
        dayChange={dayChange}
        onQuit={() => setQuitting(true)}
        tab={tab}
        onTab={setTab}
        side={side}
        onSide={setSide}
      />
      {seat === null ? null : (
        <Dialog
          open={quitting}
          hook="monthly-quit"
          title={m.monthly.quit.title}
          body={m.monthly.quit.bodyCounted(seat.points)}
          confirmLabel={m.monthly.quit.confirm}
          onConfirm={() => setQuitting(false)}
          onCancel={() => setQuitting(false)}
        />
      )}
    </AppShell>
  );
}
