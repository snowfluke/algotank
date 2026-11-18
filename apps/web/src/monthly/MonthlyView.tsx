// "/monthly" drawn from props, so tests and the kit harness (/kit?show=monthly) show every state
// without a server. MonthlyPage.tsx holds the data and the flow and passes them in.
//
// Layout (docs/specs/revamp/77-monthly-league.md, section 6: "laid out like the big screen"):
// - A laptop-wide window with the fixed-height layout is a presenter view: the big screen's
//   type scale (screen/screenScale.ts), a top row with the league, the day's clock, the league
//   switch and the one action, then the board as tall as the area beside a pane with the
//   ranking ("Hari ini", "Bulan ini") and, for an owner, "Tank kamu".
// - A phone (and the scrolling fallback) has a status row (switch and clock), one pane at a
//   time behind BottomTabs (Arena, Peringkat, Tank kamu, Aktivitas). Join stays above the tabs
//   for a visitor; an owner changes rules and look in "Tank kamu".
// The board is first in both. A seated owner's tank is ringed on the board and kept in view in
// the ranking; when the owner shows another league, "Tank kamu" says where the tank plays and
// offers the way back, and the turn feed waits for the own league, because a league's stream
// carries `own` only for tanks in that league. A switch in "Tank kamu" shows today's statistics
// card (K2, stats/StatsCard.tsx) in place of the summary; the numbers come from /api/monthly/me.

import { History, ListOrdered, Swords, UserRound } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { FIRST_PUBLISHED_RULES_MONTH, MONTHLY_RANKED_DAYS, type LeagueDayRecord, type LeagueRankingResponse, type MonthlyMeResponse, type MonthMove } from "@game/arena";
import { ArenaCondition } from "./ArenaCondition.tsx";
import { ActivityList } from "./ActivityList.tsx";
import { TankSheet, type SheetSource, type SheetTank } from "./TankSheet.tsx";
import { MonthlyAbout } from "./MonthlyAbout.tsx";
import { LegendButton } from "../board/BoardLegend.tsx";
import type { TankInfo } from "../board/props.ts";
import { useFormat, useLanguage, useMessages } from "../i18n/I18nProvider.tsx";
import { SCREEN_SCALE_STYLE } from "../screen/screenScale.ts";
import { PagedRanking } from "../standings/StandingsTable.tsx";
import { tankLetters } from "../tank/look.ts";
import { TankBadge } from "../tank/TankBadge.tsx";
import { BottomTabs, tabPanelProps } from "../ui/BottomTabs.tsx";
import { Button } from "../ui/Button.tsx";
import { useFitLayout, useLaptopLayout } from "../ui/layout.ts";
import { Picker } from "../ui/Picker.tsx";
import { SegmentedControl } from "../ui/SegmentedControl.tsx";
import { StatusBanner } from "../ui/StatusBanner.tsx";
import { useFitDetail } from "../ui/useFitDetail.ts";
import { StatsCard } from "../stats/StatsCard.tsx";
import type { LeagueBoard, LeagueLiveLoad } from "./leagueLive.ts";
import { MonthlyBoard, type BoardRow, type FollowSwitch } from "./MonthlyBoard.tsx";
import { formatDayClock, gameMastersFirst, lastFinishedDay, leagueSwitchKind, monthItems, todayItems, withLivePoints } from "./monthlyParts.ts";
import type { LeagueConnection } from "./useLeagueLive.ts";
import { useNow } from "./useNow.ts";

export type MonthlySeat = NonNullable<MonthlyMeResponse["seat"]>;
/** The phone's tabs; "mine" only for a seated owner. */
export type MonthlyTab = "arena" | "ranking" | "mine" | "activity";
/** The pane beside the board on a laptop, and the ranking's switch on a phone ("mine" shows today there). */
export type MonthlySide = "today" | "month" | "mine" | "activity";

/** What the board says around midnight: the day's end while it is recorded, then the finished day for a few seconds. */
export type DayChange = { readonly kind: "closing" } | { readonly kind: "done"; readonly day: string; readonly winner: LeagueDayRecord | null };

export interface MonthlyViewProps {
  readonly league: number;
  /** League 1 first, with the tanks seated in each. */
  readonly leagues: readonly { readonly league: number; readonly tanks: number }[];
  onLeague(next: number): void;
  readonly load: LeagueLiveLoad;
  readonly connection: LeagueConnection;
  onRetry(): void;
  /** A fixed Date.now() for the day's clock, for tests and the kit's still pictures. The page leaves it out: the clock then ticks by itself. */
  readonly now?: number;
  readonly ranking: LeagueRankingResponse | null;
  /** This month's finished days of the shown league, newest first. */
  readonly days: readonly LeagueDayRecord[];
  readonly seat: MonthlySeat | null;
  readonly move: MonthMove | null;
  onMoveSeen(): void;
  /** The visitor's one action; null for a seated owner and while the account is not known yet. */
  readonly onJoin: (() => void) | null;
  readonly dayChange: DayChange | null;
  /** True for a moment after the round rebuilt for board growth (leagueLive.ts, `reshuffles`). */
  readonly reshuffled: boolean;
  onQuit(): void;
  /** A seated owner's way to new rules (flow.ts, askChangeRules). */
  onChangeRules(): void;
  /** A seated owner's way to a new look: the tank editor, whose look the seat follows (server monthly.ts followLook). */
  onChangeLook(): void;
  readonly tab: MonthlyTab;
  onTab(next: MonthlyTab): void;
  readonly side: MonthlySide;
  onSide(next: MonthlySide): void;
}

const PANE = "flex min-h-0 min-w-0 flex-1 flex-col gap-2";

const LIVE: SheetSource = { kind: "live" };

/** A date such as "14 November 2026" from YYYY-MM-DD, at noon UTC so no time zone moves it to another day. */
function useDayName(): (day: string) => string {
  const f = useFormat();
  return (day) => f.date(`${day}T12:00:00Z`);
}

// --- The parts -----------------------------------------------------------------------------

function LeagueSwitch({ league, leagues, ownLeague, onLeague }: { league: number; leagues: MonthlyViewProps["leagues"]; ownLeague: number | null; onLeague(next: number): void }) {
  const m = useMessages();
  const t = m.monthly;
  const kind = leagueSwitchKind(leagues.length);
  if (kind === "none") return null;
  if (kind === "row") {
    return (
      <div data-league-switch="row" className="min-w-0">
        <SegmentedControl
          legend={t.leagues}
          hideLegend
          size="sm"
          value={String(league)}
          onChange={(value) => onLeague(Number(value))}
          options={leagues.map((l) => ({ value: String(l.league), label: t.league(l.league), ...(l.league === ownLeague ? { dot: t.ownLeague } : {}) }))}
        />
      </div>
    );
  }
  return (
    <div data-league-switch="list" className="min-w-[10rem]">
      <Picker
        label={t.leagues}
        look="inline"
        data-picker="league"
        value={String(league)}
        onChange={(value) => onLeague(Number(value))}
        choices={leagues.map((l) => ({ value: String(l.league), label: l.league === ownLeague ? t.ownLeagueChoice(l.league) : t.league(l.league) }))}
      />
    </div>
  );
}

/**
 * Ticks by itself, so a second renders this line and not the page. `fixedNow` stops it at one time,
 * for tests and the kit's still pictures. `short`: the phone's line, which has the arena condition beside it.
 */
function DayClock({ board, fixedNow, dayChange, short }: { board: LeagueBoard | null; fixedNow: number | undefined; dayChange: DayChange | null; short: boolean }) {
  const m = useMessages();
  const ticking = useNow();
  if (board === null) return null;
  const left = board.dayEndsAt - (fixedNow ?? ticking);
  const closing = dayChange?.kind === "closing" || board.live.phase === "closing" || left <= 0;
  return (
    <p data-day-clock="" className="min-w-0 font-display font-semibold tabular-nums [overflow-wrap:anywhere]" aria-live="off">
      {closing ? (short ? m.monthly.dayClosingShort : m.monthly.dayClosing) : (short ? m.monthly.endsInShort : m.monthly.endsIn)(formatDayClock(left))}
    </p>
  );
}

/**
 * The round's arena condition on a line of its own, under the clock: beside it, a long name
 * (Lapangan luas) was cut short at 1000 px and on a phone, and a name that wraps or not at a
 * reshuffle would move the page. An empty league has no round, so no condition yet.
 */
function ConditionLine({ board, short }: { board: LeagueBoard | null; short: boolean }) {
  if (board === null || board.live.tanks.length === 0) return null;
  return <ArenaCondition ruleSetId={board.snapshot.ruleSetId} short={short} />;
}

/** Yesterday's winner, or the newest finished day's when yesterday had no tank. */
function LastWinner({ days, today }: { days: readonly LeagueDayRecord[]; today: string | null }) {
  const m = useMessages();
  const dayName = useDayName();
  const last = today === null ? null : lastFinishedDay(days, today);
  const winner = last?.record.top[0];
  if (last === null || winner === undefined) return null;
  return (
    <p data-last-winner="" className="flex min-w-0 shrink-0 items-center gap-2">
      <TankBadge look={winner.look} label={tankLetters(winner.name)} size={32} name={null} detail="full" angle={-90} className="h-[1.5em] w-[1.5em] shrink-0" />
      <span className="min-w-0 [overflow-wrap:anywhere]">
        {last.yesterday ? m.monthly.yesterdayWinner(winner.name, winner.points) : m.monthly.dayWinner(dayName(last.record.day), winner.name, winner.points)}
      </span>
    </p>
  );
}

/** The board as large as its box allows, with the midnight notice, "Reshuffled" or the empty league's invitation over it. */
function Board({ board, ownSeatId, onJoin, dayChange, reshuffled, row, ranking }: { board: LeagueBoard; ownSeatId: string | null; onJoin: (() => void) | null; dayChange: DayChange | null; reshuffled: boolean; row: BoardRow; ranking: LeagueRankingResponse | null }) {
  const m = useMessages();
  const t = m.monthly;
  const dayName = useDayName();
  const { live } = board;
  const names = useMemo(() => Object.fromEntries(live.tanks.map((tank) => [tank.id, tank.name])), [live.tanks]);
  const tanks = useMemo(() => new Map<string, TankInfo>(live.tanks.map((tank) => [tank.id, { look: tank.look, isBot: tank.isBot }])), [live.tanks]);
  // The game masters' tanks leave tread marks on the board (owner, 2026-11-17); the ranking says which they are.
  // Keyed by the ids, so a ranking poll with the same game masters keeps the set and the memoised board.
  const gameMasterKey = (ranking?.today ?? []).filter((row) => row.gm).map((row) => row.seatId).join(" ");
  const gameMasterIds = useMemo(() => new Set(gameMasterKey === "" ? [] : gameMasterKey.split(" ")), [gameMasterKey]);
  const winner = dayChange?.kind === "done" ? (dayChange.winner?.top[0] ?? null) : null;
  let notice: ReactNode = null;
  if (dayChange?.kind === "done") {
    notice = (
      <div data-day-done="" className="flex flex-col gap-1">
        <p className="font-display text-title font-semibold">{t.dayDone(dayName(dayChange.day))}</p>
        {winner === null ? null : (
          <p className="flex items-center gap-2">
            <TankBadge look={winner.look} label={tankLetters(winner.name)} size={40} name={null} detail="full" angle={-90} className="h-[1.75em] w-[1.75em] shrink-0" />
            <span className="min-w-0 [overflow-wrap:anywhere]">{t.dayWinner(dayName(dayChange.day), winner.name, winner.points)}</span>
          </p>
        )}
        <p>{t.newDay}</p>
      </div>
    );
  } else if (reshuffled && live.tanks.length > 0) {
    notice = (
      <div data-reshuffled="" className="flex flex-col items-center gap-1 text-center">
        <p className="font-display text-display font-semibold">{t.reshuffled}</p>
        <p className="text-title font-semibold">{t.condition(m.vocabulary.roundRules[board.snapshot.ruleSetId].name)}</p>
      </div>
    );
  } else if (live.tanks.length === 0) {
    notice = (
      <div data-league-empty="" className="flex flex-col gap-1">
        <p className="font-display text-title font-semibold">{t.empty.title}</p>
        {onJoin === null ? null : <p>{t.empty.body}</p>}
      </div>
    );
  }
  return (
    <section aria-label={t.board(live.league)} className="flex min-h-0 min-w-0 flex-1 flex-col">
      <MonthlyBoard
        snapshot={board.snapshot}
        throws={board.throws}
        tunnels={board.tunnels}
        names={names}
        highlightId={ownSeatId}
        tickMs={live.tickMs}
        tanks={tanks}
        row={row}
        trailIds={gameMasterIds}
        overlay={
          notice === null ? null : (
            // The notices hold no control, so a tap goes through to the tanks under them (board/tankPeek.ts).
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-[4%]">
              {/* A panel behind the words, so they read on the sand and over tanks. */}
              <div className="max-w-[32em] rounded-[var(--radius-card)] bg-panel/95 p-[1em] shadow-[var(--shadow-raised)] animate-rise">{notice}</div>
            </div>
          )
        }
      />
    </section>
  );
}

function StreamLine({ load, connection, onRetry }: { load: LeagueLiveLoad; connection: LeagueConnection; onRetry(): void }) {
  const m = useMessages();
  const t = m.monthly;
  if (connection === "failed") {
    return (
      <StatusBanner
        tone="danger"
        title={t.failed}
        action={
          <Button variant="secondary" onClick={onRetry}>
            {t.retry}
          </Button>
        }
      />
    );
  }
  if (connection === "reconnecting") return <p role="status" className="shrink-0 font-semibold text-warning">{t.reconnecting}</p>;
  if (load.kind === "connecting") return <p role="status" className="animate-pulse-soft text-lead text-muted">{t.connecting}</p>;
  return null;
}

function MoveNotice({ move, onSeen }: { move: MonthMove; onSeen(): void }) {
  const m = useMessages();
  const f = useFormat();
  const t = m.monthly.move;
  const title = move.kind === "up" ? t.up(move.to) : move.kind === "down" ? t.down(move.to) : t.stayed(move.to);
  return (
    <div data-month-move={move.kind} className="shrink-0">
      <StatusBanner
        tone={move.kind === "up" ? "success" : "info"}
        title={title}
        // Seats carry over, so a seated player never passes the join step again: the month close says what is open.
        body={`${t.body(f.month(move.month))} ${move.month >= FIRST_PUBLISHED_RULES_MONTH ? t.rulesOpen(f.month(move.month)) : t.rulesSoon(f.month(FIRST_PUBLISHED_RULES_MONTH))}`}
        action={
          <Button variant="secondary" onClick={onSeen}>
            {t.ok}
          </Button>
        }
      />
    </div>
  );
}

function Ranking({ part, ranking, ownSeatId }: { part: "today" | "month"; ranking: LeagueRankingResponse | null; ownSeatId: string | null }) {
  const m = useMessages();
  const t = m.monthly;
  const gameMasters = useMemo(() => new Set((ranking?.today ?? []).filter((row) => row.gm).map((row) => row.seatId)), [ranking]);
  const items = useMemo(() => {
    if (ranking === null) return null;
    const built = part === "today" ? todayItems(ranking.today, t.left, t.gm) : monthItems(ranking.thisMonth, t.notRanked(MONTHLY_RANKED_DAYS), t.gm);
    return gameMastersFirst(built, gameMasters);
  }, [ranking, part, t, gameMasters]);
  // A row opens its tank's sheet (TankSheet.tsx). Not a tank that left today: its seat is gone, so it has no sheet.
  const [sheet, setSheet] = useState<SheetTank | null>(null);
  const tanks = useMemo(() => {
    if (ranking === null) return new Map<string, SheetTank>();
    const rows = part === "today" ? ranking.today.filter((row) => row.seated) : ranking.thisMonth;
    return new Map(rows.map((row) => [row.seatId, { seatId: row.seatId, name: row.name, look: row.look, gm: row.gm }]));
  }, [ranking, part]);
  const label = part === "today" ? t.ranking.today : t.ranking.month;
  if (items === null) return <p className="animate-pulse-soft text-muted">{t.connecting}</p>;
  if (items.length === 0) return <p className="text-muted">{part === "today" ? t.todayEmpty : t.monthEmpty}</p>;
  return (
    <div data-monthly-ranking={part} className="flex min-h-0 min-w-0 flex-1 flex-col">
      <PagedRanking
        label={label}
        items={items}
        highlightId={ownSeatId}
        jumpLabel={part === "month" ? t.toNotRanked : null}
        open={{
          label: (name, id) => (gameMasters.has(id) ? t.sheet.openRules(name) : t.sheet.open(name)),
          cue: (id) => (gameMasters.has(id) ? t.sheet.rulesCue : null),
          can: (id) => tanks.has(id),
          onOpen: (id) => setSheet(tanks.get(id) ?? null),
        }}
      />
      <TankSheet tank={sheet} source={LIVE} onClose={() => setSheet(null)} />
    </div>
  );
}


/** "League 1 · 15 players": the league shown and its seated tanks, or the league alone before the count arrives. */
function leagueTitleOf(t: ReturnType<typeof useMessages>["monthly"], league: number, leagues: MonthlyViewProps["leagues"]): string {
  const players = leagues.find((entry) => entry.league === league)?.tanks;
  return players === undefined ? t.league(league) : t.leaguePlayers(league, players);
}

/** The owner's tank: today, the counted days, the turns, and the way out. */
function OwnPane({ seat, league, board, ranking, onLeague, onQuit, actions }: {
  seat: MonthlySeat;
  league: number;
  board: LeagueBoard | null;
  ranking: LeagueRankingResponse | null;
  onLeague(next: number): void;
  onQuit(): void;
  actions?: ReactNode;
}) {
  const m = useMessages();
  const t = m.monthly.own;
  const [language] = useLanguage();
  const here = seat.league === league;
  const freshStart = here && board?.ownFreshStart?.id === seat.seatId ? board.ownFreshStart : null;
  const todayRow = ranking?.today.find((row) => row.seatId === seat.seatId) ?? null;
  // K2: today's statistics card in place of the summary, so each has the pane's height.
  const [part, setPart] = useState<"summary" | "stats">("summary");
  // The autoplay tip gives way first. In another league it is already absent, so the counting note goes first.
  const countingLevel = here ? 2 : 1;
  const detail = useFitDetail<HTMLElement>(
    countingLevel + 1,
    `${language}|${part}|${here}|${seat.league}|${todayRow === null}|${seat.countsToday}|${seat.rank === null}|${freshStart !== null}`,
  );
  return (
    <section ref={detail.ref} data-own-pane="" aria-label={t.heading} className={`${PANE} fit:overflow-hidden`}>
      {/* One row: the name gives way (ellipsis) to the switch, so the summary below keeps its height. */}
      <div className="flex min-w-0 shrink-0 items-center gap-x-3">
        <TankBadge look={seat.look} label={tankLetters(seat.name)} size={44} name={null} self detail="full" angle={-90} className="h-[2em] w-[2em] shrink-0" />
        <h2 className="min-w-0 flex-1 truncate text-title" title={seat.name}>
          {seat.name}
        </h2>
        <div data-own-part="" className="shrink-0">
          <SegmentedControl
            legend={m.stats.parts.label}
            hideLegend
            size="sm"
            value={part}
            onChange={setPart}
            options={[
              { value: "summary", label: m.stats.parts.summary },
              { value: "stats", label: m.stats.parts.stats },
            ]}
          />
        </div>
      </div>
      {actions}
      {part === "stats" ? (
        <StatsCard heading={m.stats.today} numbers={seat.stats} rules={seat.stats} />
      ) : (
        <>
          <div className="flex min-w-0 shrink-0 flex-col gap-1">
            {here ? null : (
              <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
                <p className="min-w-0 font-semibold">{t.otherLeague(seat.league)}</p>
                <Button variant="secondary" data-own-league="" onClick={() => onLeague(seat.league)}>
                  {t.show(seat.league)}
                </Button>
              </div>
            )}
            {todayRow === null ? null : <p>{todayRow.gm ? t.todayGm(todayRow.points) : t.today(todayRow.rank, todayRow.points)}</p>}
            {detail.level < countingLevel ? <p className="text-muted">{seat.countsToday ? t.counts : t.notCounted}</p> : null}
            {/* Only beside the own league: the other league's view spends this room on the way back, and the help dialog says it too. */}
            {here && detail.level === 0 ? (
              <p data-own-plays-alone="" className="text-muted">
                {t.playsAlone}
              </p>
            ) : null}
            <p>{seat.rank === null ? t.daysNeeded(seat.countedDays, MONTHLY_RANKED_DAYS) : t.monthPlace(seat.rank, seat.score, seat.countedDays)}</p>
          </div>
          {/* Keep the latest tunnel in the own feed (owner, 2026-11-19), so it can be read after the turn. */}
          {freshStart === null ? null : (
            <p data-own-fresh-start="" role="status" className="min-w-0 shrink-0 [overflow-wrap:anywhere]">
              <span key={freshStart.tick}>{t.freshStart}</span>
            </p>
          )}
          <div className="min-h-0 flex-1" />
        </>
      )}
      <div className="flex min-w-0 shrink-0 flex-wrap gap-2">
        <Button variant="secondary" data-quit-open="" onClick={onQuit}>
          {m.monthly.quit.open}
        </Button>
      </div>
    </section>
  );
}

/** The owner's tank in one line above the board on a phone. */
/** The phone's line beside the board's switch ("#4 · 893 poin"); the own pane says it in a full sentence. */
function OwnLine({ seat, league, ranking, onLeague }: { seat: MonthlySeat; league: number; ranking: LeagueRankingResponse | null; onLeague(next: number): void }) {
  const m = useMessages();
  const t = m.monthly.own;
  const row = ranking?.today.find((r) => r.seatId === seat.seatId) ?? null;
  if (seat.league !== league) {
    return (
      <div data-own-line="" className="flex min-w-0 shrink-0 flex-wrap items-center gap-x-3 gap-y-1">
        <p className="min-w-0 flex-1 basis-40 font-semibold">{t.otherLeague(seat.league)}</p>
        <Button variant="secondary" data-own-league="" onClick={() => onLeague(seat.league)}>
          {t.show(seat.league)}
        </Button>
      </div>
    );
  }
  if (row === null) return null;
  return (
    <p data-own-line="" className="flex min-w-0 shrink-0 items-center gap-2 rounded-[var(--radius-control)] bg-self-soft px-2 py-1">
      <TankBadge look={seat.look} label={tankLetters(seat.name)} size={28} name={null} self detail="simple" angle={-90} className="shrink-0" />
      <span className="min-w-0 [overflow-wrap:anywhere]">{row.gm ? t.todayGmShort(row.points) : t.todayShort(row.rank, row.points)}</span>
    </p>
  );
}

// --- The two layouts -----------------------------------------------------------------------

export function MonthlyView(props: MonthlyViewProps) {
  const laptop = useLaptopLayout();
  const fit = useFitLayout();
  // Today's points follow the board turn by turn (monthlyParts.ts, withLivePoints); the layouts read only this ranking.
  const board = boardOf(props.load);
  const ranking = useMemo(
    () => withLivePoints(props.ranking, board === null ? null : { league: board.live.league, day: board.live.day, snapshot: board.snapshot }),
    [props.ranking, board],
  );
  const live = { ...props, ranking };
  return laptop && fit ? <PresenterLayout {...live} /> : <PhoneLayout {...live} />;
}

function boardOf(load: LeagueLiveLoad): LeagueBoard | null {
  return load.kind === "ready" ? load.board : null;
}

function PresenterLayout(props: MonthlyViewProps) {
  // The zoomed view on a laptop too (owner, 2026-11-17). Its switch stands in the header, right of the clock and the
  // condition, whose two lines are as tall as the switch, so it adds no line over the board (owner, 2026-11-17).
  const [followChoice, setFollowChoice] = useState<FollowSwitch["choice"]>("whole");
  const follow: FollowSwitch = { choice: followChoice, onChoice: setFollowChoice };
  const [switchSlot, setSwitchSlot] = useState<HTMLElement | null>(null);
  const m = useMessages();
  const t = m.monthly;
  const { league, leagues, seat, load } = props;
  const board = boardOf(load);
  const ownSeatId = seat !== null && seat.league === league ? seat.seatId : null;
  const sideOptions: { value: MonthlySide; label: string }[] = [
    { value: "today", label: t.ranking.today },
    { value: "month", label: t.ranking.month },
    ...(seat === null ? [] : [{ value: "mine" as const, label: t.tabs.mine }]),
    { value: "activity", label: t.tabs.activity },
  ];
  const side = seat === null && props.side === "mine" ? "today" : props.side;
  const leagueTitle = leagueTitleOf(t, league, leagues);
  return (
    <div data-scale="screen" data-monthly-page="presenter" style={SCREEN_SCALE_STYLE} className="flex min-h-0 min-w-0 flex-1 flex-col gap-[1.5vh] px-[2vw]">
      {/* The title with the day's clock on one line under it, and the controls together on the right (owner, 2026-11-16: the clock in heading type wrapped between them). */}
      <div className="flex min-w-0 shrink-0 flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex min-w-0 flex-1 basis-80 flex-col">
          <h1 className="min-w-0 text-heading">
            {/* With several leagues the league switch beside it already says "League", so the title is the league; the row then fits a 1000 px window. */}
            {leagues.length > 1 ? null : (
              <>
                {m.common.pageTitles.monthly}
                <span className="sr-only">, </span>
              </>
            )}
            <span data-monthly-players="" className={leagues.length > 1 ? undefined : "ml-3 text-title text-muted"}>
              {leagueTitle}
            </span>
          </h1>
          {/* The board's switch leads the row, at the board's left edge (owner, 2026-11-19). */}
          <div className="flex min-w-0 flex-wrap items-center gap-x-4">
            <div ref={setSwitchSlot} data-camera-switch-slot="" className="flex shrink-0 empty:hidden" />
            <div className="flex min-w-0 flex-1 basis-56 flex-col">
              <DayClock board={board} fixedNow={props.now} dayChange={props.dayChange} short={false} />
              <ConditionLine board={board} short={false} />
            </div>
          </div>
        </div>
        <LeagueSwitch league={league} leagues={leagues} ownLeague={seat?.league ?? null} onLeague={props.onLeague} />
        {props.onJoin === null ? null : (
          <Button size="lg" data-monthly-join="" onClick={props.onJoin}>
            {t.join}
          </Button>
        )}
        {/* Only in the own league: another league's view leads back to it first, and a header with two buttons there did not fit 1000 px. */}
        {seat === null || seat.league !== league ? null : (
          <>
            <Button variant="secondary" data-change-rules="" onClick={props.onChangeRules}>
              {t.changeRules.open}
            </Button>
            <Button variant="secondary" data-change-look="" onClick={props.onChangeLook}>
              {t.changeLook}
            </Button>
          </>
        )}
        <MonthlyAbout />
        {/* The board legend, as beside a room's board: it lists the items and their effects (docs/items.md). */}
        <LegendButton />
      </div>
      <div className="flex min-w-0 shrink-0 flex-col gap-2 empty:hidden">
        {props.move === null ? null : <MoveNotice move={props.move} onSeen={props.onMoveSeen} />}
        <StreamLine load={load} connection={props.connection} onRetry={props.onRetry} />
      </div>
      {/* Flex, not a grid row: a grid's fr row in a flexed parent would size to the board's last measured pixels and never grow back after a resize. */}
      <div className="flex min-h-0 min-w-0 flex-1 gap-[2vw]">
        <div className="flex min-h-0 min-w-0 flex-[1.9] basis-0 flex-col">{board === null ? null : <Board board={board} ownSeatId={ownSeatId} onJoin={props.onJoin} dayChange={props.dayChange} reshuffled={props.reshuffled} row={{ place: { kind: "slot", element: switchSlot }, follow }} ranking={props.ranking} />}</div>
        <section aria-label={side === "activity" ? t.tabs.activity : t.ranking.label} className={`${PANE} basis-0`}>
          <div className="shrink-0 [&_label]:px-1 min-[1100px]:[&_label]:px-3">
            <SegmentedControl legend={t.tabs.label} hideLegend size="sm" value={side} onChange={props.onSide} options={sideOptions} />
          </div>
          {side === "mine" && seat !== null ? (
            <OwnPane seat={seat} league={league} board={board} ranking={props.ranking} onLeague={props.onLeague} onQuit={props.onQuit} />
          ) : side === "activity" ? (
            <ActivityList events={board?.live.league === league ? board.live.activity : []} fixedNow={props.now} />
          ) : (
            <>
              <Ranking part={side === "month" ? "month" : "today"} ranking={props.ranking} ownSeatId={ownSeatId} />
              <LastWinner days={props.days} today={board?.live.day ?? null} />
            </>
          )}
        </section>
      </div>
    </div>
  );
}

const TAB_ICONS: Record<MonthlyTab, ReactNode> = {
  arena: <Swords aria-hidden size={22} />,
  ranking: <ListOrdered aria-hidden size={22} />,
  mine: <UserRound aria-hidden size={22} />,
  activity: <History aria-hidden size={22} />,
};

/** The phone's bottom bar: the visitor's action above the tabs. MonthlyPage puts it in AppShell's `bottom`. */
export function MonthlyPhoneBar({ seat, onJoin, tab, onTab }: Pick<MonthlyViewProps, "seat" | "onJoin" | "tab" | "onTab">) {
  const m = useMessages();
  const t = m.monthly;
  const laptop = useLaptopLayout();
  const fit = useFitLayout();
  if (laptop && fit) return null;
  const tabs: MonthlyTab[] = seat === null ? ["arena", "ranking", "activity"] : ["arena", "ranking", "mine", "activity"];
  return (
    <>
      {onJoin === null ? null : (
        <div className="mx-auto flex w-full max-w-6xl px-4 py-2">
          <Button size="lg" data-monthly-join="" className="w-full" onClick={onJoin}>
            {t.join}
          </Button>
        </div>
      )}
      <BottomTabs idBase="monthly" label={t.tabs.label} value={seat === null && tab === "mine" ? "arena" : tab} onChange={onTab} tabs={tabs.map((value) => ({ value, label: t.tabs[value], icon: TAB_ICONS[value] }))} />
    </>
  );
}

function PhoneLayout(props: MonthlyViewProps) {
  // The follow window's choice outlasts a visit to the ranking or the own tab (MonthlyBoard.tsx).
  const [followChoice, setFollowChoice] = useState<FollowSwitch["choice"]>("whole");
  const follow: FollowSwitch = { choice: followChoice, onChoice: setFollowChoice };
  const m = useMessages();
  const t = m.monthly;
  const { league, leagues, seat, load } = props;
  const board = boardOf(load);
  const ownSeatId = seat !== null && seat.league === league ? seat.seatId : null;
  const tab = seat === null && props.tab === "mine" ? "arena" : props.tab;
  const part = props.side === "month" ? "month" : "today";
  const leagueTitle = leagueTitleOf(t, league, leagues);
  let pane: ReactNode;
  if (tab === "mine" && seat !== null) {
    pane = (
      <OwnPane
        seat={seat}
        league={league}
        board={board}
        ranking={props.ranking}
        onLeague={props.onLeague}
        onQuit={props.onQuit}
        actions={
          // A row above the tabs took too much height (owner, 2026-11-16). Putting the buttons beside
          // the tabs crowded the bar (2026-11-18, 77-monthly-league.md), so both live with the tank.
          <div className="flex min-w-0 shrink-0 flex-wrap gap-2">
            <Button variant="secondary" className="max-w-full flex-1" data-change-rules="" onClick={props.onChangeRules}>
              <span className="min-w-0">{t.changeRules.open}</span>
            </Button>
            <Button variant="secondary" className="max-w-full flex-1" data-change-look="" onClick={props.onChangeLook}>
              <span className="min-w-0">{t.changeLook}</span>
            </Button>
          </div>
        }
      />
    );
  } else if (tab === "ranking") {
    pane = (
      <section aria-label={t.ranking.label} className={PANE}>
        <div className="shrink-0">
          <SegmentedControl legend={t.ranking.label} hideLegend value={part} onChange={props.onSide} options={[{ value: "today", label: t.ranking.today }, { value: "month", label: t.ranking.month }]} />
        </div>
        <Ranking part={part} ranking={props.ranking} ownSeatId={ownSeatId} />
      </section>
    );
  } else if (tab === "activity") {
    pane = <ActivityList events={board?.live.league === league ? board.live.activity : []} fixedNow={props.now} />;
  } else {
    pane = (
      <div className={PANE}>
        {board === null ? null : (
          <Board
            board={board}
            ownSeatId={ownSeatId}
            onJoin={props.onJoin}
            dayChange={props.dayChange}
            reshuffled={props.reshuffled}
            row={{ place: { kind: "row", lead: seat === null ? null : <OwnLine seat={seat} league={league} ranking={props.ranking} onLeague={props.onLeague} /> }, follow }}
            ranking={props.ranking}
          />
        )}
        <LastWinner days={props.days} today={board?.live.day ?? null} />
      </div>
    );
  }
  return (
    <div data-monthly-page="phone" className="flex min-h-0 min-w-0 flex-1 flex-col gap-2 px-4">
      <div className="flex min-w-0 shrink-0 flex-wrap items-center gap-x-3 gap-y-1">
        <LeagueSwitch league={league} leagues={leagues} ownLeague={seat?.league ?? null} onLeague={props.onLeague} />
        <div className="min-w-0 flex-1 basis-48">
          {/* The app header names the page on a phone, so this heading names the league and its players. */}
          <h1 data-monthly-players="" className="text-caption font-semibold text-muted [overflow-wrap:anywhere]">
            {leagueTitle}
          </h1>
        </div>
        <MonthlyAbout />
        {/* The board legend, as beside a room's board: it lists the items and their effects (docs/items.md). */}
        <LegendButton />
      </div>
      {/* One full-width line of time left and condition (owner, 2026-11-16: four lines were too many). It does not wrap,
          so a longer condition name at a reshuffle is cut short instead of moving the page. */}
      <div className="flex min-w-0 shrink-0 flex-nowrap items-center gap-4">
        <div className="shrink-0">
          <DayClock board={board} fixedNow={props.now} dayChange={props.dayChange} short />
        </div>
        <ConditionLine board={board} short />
      </div>
      {props.move === null ? null : <MoveNotice move={props.move} onSeen={props.onMoveSeen} />}
      <StreamLine load={load} connection={props.connection} onRetry={props.onRetry} />
      <div {...tabPanelProps("monthly", tab)} className="flex min-h-0 min-w-0 flex-1 flex-col">
        {pane}
      </div>
    </div>
  );
}
