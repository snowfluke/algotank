// "/monthly": the monthly arena for everyone (docs/specs/revamp/77-monthly-league.md, section 6).
// This file holds the data (the stream, useMonthlyData), runs the viewer's flow (flow.ts, its
// table) and does the effects: the sign-in page, the seat request, the quit. MonthlyView.tsx
// draws the watching and seated states; JoinSteps.tsx draws the name and the tank.
//
// Which league shows: the one the viewer chose while it exists, else the seated owner's own
// league, else League 1 (monthlyParts.leagueToShow). The stream opens once that is known, so a
// seated owner does not first see League 1. When the month close moves the owner's tank, the
// page follows it, unless the viewer had chosen another league; a closed league sends the
// viewer to their own league or League 1.
//
// Midnight: a state with a new day shows "the round of <day> has ended" with its winner over
// the board for DAY_NOTICE_MS, while the new round already plays under it. A reshuffle (a new
// round of the same day, leagueLive.ts) shows "Reshuffled" over the board for RESHUFFLE_NOTICE_MS.

import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import type { TakeSeatRequest } from "@game/arena";
import type { StrategyInput } from "@game/engine";
import { putMonthlyLook, putMonthlyStrategy, quitMonthlySeat, markMonthlyMoveSeen, takeMonthlySeat } from "../api/client.ts";
import { errorSentence } from "../api/errorSentences.ts";
import { navigate } from "../app/navigation.ts";
import { paths } from "../app/route.ts";
import { useAccount } from "../auth/accountStore.ts";
import { canSendEmail, useMailCapability } from "../auth/mailCapability.ts";
import { useMessages } from "../i18n/I18nProvider.tsx";
import { MyTankSheet } from "../mytank/MyTankSheet.tsx";
import { myTankStore, useMyTank } from "../mytank/useMyTank.ts";
import { useNameDraft } from "../mytank/useNameDraft.ts";
import { focusChangeButton } from "../player/JoinForm.tsx";
import { AppHeader } from "../ui/AppHeader.tsx";
import { AppShell } from "../ui/AppShell.tsx";
import { Dialog } from "../ui/Dialog.tsx";
import { useFitLayout, useLaptopLayout } from "../ui/layout.ts";
import { useToast } from "../ui/Toast.tsx";
import { nextFlow, WATCHING } from "./flow.ts";
import { NameStep, TankStep, useMonthlyStrategy } from "./JoinSteps.tsx";
import { leagueToShow } from "./monthlyParts.ts";
import { MonthlyPhoneBar, MonthlyView, type DayChange, type MonthlySide, type MonthlyTab } from "./MonthlyView.tsx";
import { useLeagueLive } from "./useLeagueLive.ts";
import { useMonthlyData } from "./useMonthlyData.ts";

/** How long the finished day's notice stays over the board after midnight. */
const DAY_NOTICE_MS = 12_000;
/** Long enough to read one word; the round already plays under it. */
const RESHUFFLE_NOTICE_MS = 2_500;

/** Name problems send the viewer back to the name step. */
const NAME_CODES: ReadonlySet<string> = new Set(["name_taken", "name_invalid", "name_blocked", "monthly_name_fixed"]);

/** Date.now(), once a second while `on`. */
function useNow(on: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!on) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [on]);
  return now;
}

/** True when the address asks for the join step (the sign-in page returns to paths.monthlyJoin()). */
function askedToJoin(): boolean {
  return new URLSearchParams(window.location.search).get("join") === "1";
}

export function MonthlyPage() {
  const m = useMessages();
  const t = m.monthly;
  const toast = useToast();
  const account = useAccount();
  const signedIn = account.kind === "signedIn";
  const { tank } = useMyTank();
  const name = useNameDraft(tank.name);
  const strategy = useMonthlyStrategy();
  const [flow, dispatch] = useReducer(nextFlow, WATCHING);
  const [asked, setAsked] = useState<number | null>(null);
  const [tab, setTab] = useState<MonthlyTab>("arena");
  const [side, setSide] = useState<MonthlySide>("today");
  const [editingTank, setEditingTank] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [seenMove, setSeenMove] = useState<string | null>(null);
  const [dayChange, setDayChange] = useState<{ readonly day: string; readonly until: number } | null>(null);
  const joinAsked = useRef(askedToJoin());
  const laptop = useLaptopLayout();
  const fit = useFitLayout();

  // The league and its stream. The stream key changes with every state message, so the reads follow joins, quits and days.
  const [leagueKey, setLeagueKey] = useState<number | null>(null);
  const live = useLeagueLive(leagueKey);
  const board = live.load.kind === "ready" ? live.load.board : null;
  const stateKey = board === null ? "" : `${board.live.league}|${board.live.day}|${board.live.phase}|${board.live.tanks.map((x) => `${x.id}:${x.name}`).join(",")}`;
  const data = useMonthlyData(leagueKey ?? 1, stateKey, board?.live.day ?? "", signedIn);
  const me = signedIn ? data.me.data : null;
  const seat = me?.seat ?? null;
  const leagueCount = data.overview.data?.leagues.length ?? null;
  const meKnown = account.kind !== "unknown" && (!signedIn || data.me.data !== null || data.me.failure !== null);
  const league = leagueToShow(asked ?? seat?.league ?? 1, leagueCount ?? Number.MAX_SAFE_INTEGER, seat?.league ?? null);
  useEffect(() => {
    if (meKnown) setLeagueKey(league);
  }, [meKnown, league]);

  // The month close moved the owner's tank: follow it, unless the viewer chose another league.
  const lastSeatLeague = useRef<number | null>(null);
  useEffect(() => {
    const now = seat?.league ?? null;
    const before = lastSeatLeague.current;
    lastSeatLeague.current = now;
    if (before !== null && now !== null && before !== now && (asked === null || asked === before)) setAsked(now);
  }, [seat?.league, asked]);

  // A closed league: to the owner's league or League 1, and the leagues are read again.
  const closedLeagues = live.load.kind === "closed" ? live.load.leagues : null;
  const { reloadOverview, reloadMe } = data;
  useEffect(() => {
    if (closedLeagues === null) return;
    setAsked(leagueToShow(-1, closedLeagues, seat?.league ?? null));
    reloadOverview();
    reloadMe();
  }, [closedLeagues, seat?.league, reloadOverview, reloadMe]);

  // Midnight: a new day on the same league shows the finished day over the board for a while.
  const seenDay = useRef<{ league: number; day: string } | null>(null);
  useEffect(() => {
    if (board === null) return;
    const before = seenDay.current;
    seenDay.current = { league: board.live.league, day: board.live.day };
    if (before !== null && before.league === board.live.league && before.day !== board.live.day) setDayChange({ day: before.day, until: Date.now() + DAY_NOTICE_MS });
  }, [board]);
  // A reshuffle: the count of today's new rounds went up on the same stream.
  const [reshuffledUntil, setReshuffledUntil] = useState(0);
  const seenReshuffles = useRef<number | null>(null);
  const reshuffles = board?.reshuffles ?? null;
  useEffect(() => {
    const before = seenReshuffles.current;
    seenReshuffles.current = reshuffles;
    if (before !== null && reshuffles !== null && reshuffles > before) setReshuffledUntil(Date.now() + RESHUFFLE_NOTICE_MS);
  }, [reshuffles]);
  const now = useNow(board !== null);
  const shownDayChange: DayChange | null =
    dayChange !== null && now < dayChange.until ? { kind: "done", day: dayChange.day, winner: data.days.data?.days.find((d) => d.day === dayChange.day) ?? null } : null;

  // The seat decides between watching and seated, also when it changed on another device.
  const seated = seat !== null;
  useEffect(() => {
    if (meKnown) dispatch({ type: "seatLoaded", seated });
  }, [meKnown, seated]);

  // Back from the sign-in page with ?join=1: straight to the name step. The address loses the mark either way.
  useEffect(() => {
    if (!joinAsked.current || !meKnown) return;
    joinAsked.current = false;
    window.history.replaceState(window.history.state, "", paths.monthly());
    if (signedIn && !seated) dispatch({ type: "returnedToJoin" });
  }, [meKnown, signedIn, seated]);

  // The server refuses a seat to an unverified email when it sends email (monthly/routes.ts), so such
  // a player verifies first and comes back to the join steps, instead of filling them in for nothing.
  const mail = useMailCapability();
  const mustVerify = signedIn && !account.account.emailVerified && canSendEmail(mail);
  const join = useCallback(() => {
    if (mustVerify) {
      navigate(paths.verifyEmail(paths.monthlyJoin()));
      return;
    }
    dispatch({ type: "join", signedIn });
    if (!signedIn) navigate(paths.signIn(paths.monthlyJoin()));
  }, [signedIn, mustVerify]);

  const fixedName = me?.name !== null && me?.name !== undefined && !me.name.canChange ? me.name.name : null;

  async function submit(): Promise<void> {
    if (strategy.load.kind !== "ready" || flow.kind !== "preparing" || flow.submitting) return;
    dispatch({ type: "submit" });
    setProblem(null);
    const typed = name.field.value.trim();
    const body: TakeSeatRequest = { look: tank.look, strategy: strategy.load.draft, ...(fixedName === null && typed !== "" ? { name: typed } : {}) };
    const result = await takeMonthlySeat(body);
    if (result.ok) {
      if (result.data.seat !== null) setAsked(result.data.seat.league);
      setTab("arena");
      dispatch({ type: "seatTaken" });
      toast.show({ message: t.joinSteps.joined });
      reloadMe();
      reloadOverview();
      return;
    }
    const code = result.code ?? "";
    if (code === "name_taken") name.replace(name.field.value, t.joinSteps.nameTaken);
    else if (code === "name_blocked" && typeof result.error.suggestion === "string") name.replace(result.error.suggestion, errorSentence(result, "join", m.errors));
    else if (code === "name_invalid") name.replace(name.field.value, errorSentence(result, "join", m.errors));
    else if (code === "monthly_seat_taken") setProblem(t.joinSteps.seatTaken);
    else if (!NAME_CODES.has(code)) setProblem(errorSentence(result, "join", m.errors));
    dispatch({ type: "submitFailed", nameProblem: NAME_CODES.has(code) });
    // A fixed name or a seat taken elsewhere: the account's answer shows the right step.
    if (code === "monthly_name_fixed" || code === "monthly_seat_taken") reloadMe();
  }

  /** The rules step opens with the seated tank's own rules. */
  function changeRules(seatStrategy: StrategyInput): void {
    setProblem(null);
    void strategy.saveStrategy(seatStrategy);
    dispatch({ type: "askChangeRules" });
  }

  async function submitRules(): Promise<void> {
    if (strategy.load.kind !== "ready" || flow.kind !== "changingRules" || flow.submitting) return;
    dispatch({ type: "submit" });
    setProblem(null);
    const result = await putMonthlyStrategy(strategy.load.draft);
    if (result.ok) {
      dispatch({ type: "rulesChanged" });
      setTab("arena");
      toast.show({ message: t.changeRules.done });
      reloadMe();
      return;
    }
    setProblem(errorSentence(result, "join", m.errors));
    dispatch({ type: "rulesFailed" });
    // A seat that is gone (quit on another device): the account's answer leads back to watching.
    if (result.code === "no_monthly_seat") reloadMe();
  }

  async function quit(): Promise<void> {
    dispatch({ type: "quitConfirmed" });
    const result = await quitMonthlySeat();
    if (result.ok || result.code === "no_monthly_seat") {
      dispatch({ type: "quitDone" });
      reloadMe();
      reloadOverview();
      return;
    }
    dispatch({ type: "quitFailed" });
    toast.show({ message: errorSentence(result, "leave", m.errors) });
  }

  async function moveSeen(month: string): Promise<void> {
    setSeenMove(month);
    const result = await markMonthlyMoveSeen();
    // The notice stays hidden on this page either way; a failed save shows it once more on the next visit.
    if (!result.ok) console.error("The month close's notice could not be marked as seen:", result.error);
  }

  if (editingTank) {
    return (
      // The full width, as on the My tank page: a narrow page left the editor and its tank small on a laptop (2026-11-16).
      <AppShell>
        <MyTankSheet
          look={tank.look}
          onLook={(look) => myTankStore.setLook(look)}
          tankName={fixedName ?? name.field.value}
          name={fixedName === null ? name : null}
          onClose={() => {
            setEditingTank(false);
            // A seated owner came from "Change look": the seat takes the look now, also when "My tank" cannot
            // reach the account. A joining player came from the join step's button.
            if (seat === null) {
              focusChangeButton();
              return;
            }
            void putMonthlyLook(myTankStore.getSnapshot().tank.look).then((result) => {
              if (!result.ok) toast.show({ message: t.changeLookFailed });
            });
            requestAnimationFrame(() => document.querySelector<HTMLElement>("[data-change-look]")?.focus());
          }}
        />
      </AppShell>
    );
  }

  if (flow.kind === "naming") {
    return (
      <AppShell width="narrow" header={<AppHeader title={m.common.pageTitles.monthly} />}>
        <NameStep
          look={tank.look}
          name={name}
          fixedName={fixedName}
          onChangeTank={() => setEditingTank(true)}
          onBack={() => dispatch({ type: "back" })}
          onNext={() => {
            if (fixedName !== null || name.commit()) dispatch({ type: "nameDone" });
          }}
        />
      </AppShell>
    );
  }

  if (flow.kind === "preparing" || (flow.kind === "changingRules" && seat !== null)) {
    const joining = flow.kind === "preparing";
    return (
      <AppShell header={<AppHeader title={m.common.pageTitles.monthly} />}>
        <TankStep
          purpose={joining ? "join" : "changeRules"}
          strategy={strategy}
          look={joining ? tank.look : (seat?.look ?? tank.look)}
          playerName={joining ? (fixedName ?? name.field.value) : (seat?.name ?? "")}
          submitting={flow.submitting}
          problem={problem}
          onBack={() => dispatch({ type: "back" })}
          onSubmit={() => void (joining ? submit() : submitRules())}
        />
      </AppShell>
    );
  }

  const leagues = data.overview.data?.leagues ?? [{ league, tanks: board?.live.tanks.length ?? 0 }];
  const move = me?.move !== null && me?.move !== undefined && me.move.month !== seenMove ? me.move : null;
  const onJoin = seat === null && account.kind !== "unknown" && flow.kind === "watching" ? join : null;
  const presenter = laptop && fit;
  return (
    <AppShell
      width="full"
      header={<AppHeader {...(presenter ? {} : { title: m.common.pageTitles.monthly })} />}
      bottom={presenter ? undefined : <MonthlyPhoneBar seat={seat} onJoin={onJoin} onChangeRules={() => {
          if (seat !== null) changeRules(seat.strategy);
        }} onChangeLook={() => setEditingTank(true)} tab={tab} onTab={setTab} />}
    >
      <MonthlyView
        league={league}
        leagues={leagues}
        onLeague={setAsked}
        load={live.load}
        connection={live.connection}
        onRetry={live.retry}
        now={now}
        ranking={data.ranking.data?.league === league ? data.ranking.data : null}
        days={data.days.data?.days.filter((d) => d.league === league) ?? []}
        seat={seat}
        move={move}
        onMoveSeen={() => {
          if (move !== null) void moveSeen(move.month);
        }}
        onJoin={onJoin}
        dayChange={shownDayChange}
        reshuffled={now < reshuffledUntil}
        onQuit={() => dispatch({ type: "askQuit" })}
        onChangeRules={() => {
          if (seat !== null) changeRules(seat.strategy);
        }}
        onChangeLook={() => setEditingTank(true)}
        tab={tab}
        onTab={setTab}
        side={side}
        onSide={setSide}
      />
      {seat === null ? null : (
        <Dialog
          open={flow.kind === "quitting"}
          hook="monthly-quit"
          title={t.quit.title}
          body={seat.countsToday ? t.quit.bodyCounted(seat.points) : t.quit.bodyNotCounted}
          confirmLabel={t.quit.confirm}
          onConfirm={() => void quit()}
          onCancel={() => dispatch({ type: "cancelQuit" })}
        />
      )}
    </AppShell>
  );
}
