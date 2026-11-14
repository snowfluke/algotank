// The league's rules through its public methods, with the manual clock and scheduler and the
// Asia/Jakarta calendar (docs/specs/revamp/77-monthly-league.md, sections 1 to 3 and 5).

import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import type { Database } from "bun:sqlite";
import { plainTankLook, type LeagueStreamMessage, type MonthlyMeResponse } from "@game/arena";
import { PRESETS } from "@game/engine";
import { HttpError } from "../http.ts";
import { manualScheduler, type ManualScheduler } from "../test-helpers.ts";
import { zoneCalendar } from "./calendar.ts";
import { Champions } from "./champions.ts";
import { memoryDatabase } from "../db/testing.ts";
import { LeagueStore } from "./league-store.ts";
import { MonthlyLeagues } from "./monthly.ts";
import { LeagueStreams } from "./streams.ts";

const DAY_MS = 24 * 60 * 60 * 1000;
/** 2026-11-14 00:00 in Asia/Jakarta (UTC+7). */
const NOV_14 = Date.parse("2026-11-13T17:00:00Z");
const strategy = (i = 0) => (PRESETS[i % PRESETS.length] as (typeof PRESETS)[number]).strategy;

let errors: ReturnType<typeof spyOn>;
beforeEach(() => {
  errors = spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  errors.mockRestore();
});

interface League {
  readonly ticks: ManualScheduler;
  readonly monthly: MonthlyLeagues;
  readonly champions: Champions;
  readonly streams: LeagueStreams;
}

/** A league on `db` (a new database in memory when not given); a second league on the same database is what a restart finds. */
function startLeague(options: { readonly at?: number; readonly db?: Database; readonly ticks?: ManualScheduler } = {}): League {
  const ticks = options.ticks ?? manualScheduler(options.at ?? NOV_14 + 10 * 60 * 60 * 1000);
  const db = options.db ?? memoryDatabase();
  const champions = new Champions(db);
  const streams = new LeagueStreams({ heartbeatMs: 60_000, maxStreamsPerLeague: 10 });
  const monthly = new MonthlyLeagues({
    store: new LeagueStore(db, ticks.now),
    champions,
    streams,
    calendar: zoneCalendar("Asia/Jakarta"),
    now: ticks.now,
    scheduler: ticks,
    tickMs: 900,
  });
  monthly.start();
  return { ticks, monthly, champions, streams };
}

/** Reads a stream as the page would, in the background; `take` returns the messages that arrived since the last call. */
function collect(response: Response): { take(): Promise<{ messages: LeagueStreamMessage[]; ended: boolean }> } {
  const reader = response.body?.getReader();
  if (reader === undefined) throw new Error("expected a stream body");
  const decoder = new TextDecoder();
  let text = "";
  let ended = false;
  void (async () => {
    for (;;) {
      const next = await reader.read();
      if (next.done) break;
      text += decoder.decode(next.value, { stream: true });
    }
    ended = true;
  })();
  return {
    async take() {
      // The stream's queue hands its chunks over in microtasks; one macrotask lets them all arrive.
      await new Promise((resolve) => setTimeout(resolve, 0));
      const blocks = text.split("\n\n");
      text = blocks.pop() ?? "";
      const messages = blocks
        .map((block) => block.split("\n").find((line) => line.startsWith("data: ")))
        .filter((line): line is string => line !== undefined)
        .map((line) => JSON.parse(line.slice(6)) as LeagueStreamMessage);
      return { messages, ended };
    },
  };
}

let accounts = 0;
const newAccount = () => `account-${++accounts}`;

function take(l: League, accountId: string, body: Record<string, unknown> = {}): MonthlyMeResponse {
  return l.monthly.takeSeat(accountId, { look: plainTankLook(((accounts % 12) + 1) as 1), strategy: strategy(accounts), ...body });
}

function seatOf(l: League, accountId: string): NonNullable<MonthlyMeResponse["seat"]> {
  const seat = l.monthly.me(accountId).seat;
  if (seat === null) throw new Error(`${accountId} has no seat`);
  return seat;
}

/** The HttpError code that `run` throws. */
function codeOf(run: () => unknown): string | undefined {
  try {
    run();
  } catch (error) {
    if (error instanceof HttpError) return error.extra.code;
    throw error;
  }
  throw new Error("expected an HttpError");
}

/** Moves the clock to the next day's start and runs the turn that closes the day. */
function nextDay(l: League): void {
  const live = l.monthly.live(1);
  l.ticks.advance(live.dayEndsInMs);
  l.ticks.tick();
}

describe("the day round", () => {
  test("lasts from 00:00 to 24:00 in the league's time zone: 96,000 turns of 0.9 s", () => {
    const l = startLeague({ at: NOV_14 });
    const live = l.monthly.live(1);
    expect(live).toMatchObject({ day: "2026-11-14", month: "2026-11", dayEndsInMs: DAY_MS, tickMs: 900 });
    expect(live.board.ticksTotal).toBe(96_000);
    take(l, newAccount());
    expect(l.monthly.live(1).board.ticksTotal).toBe(96_000);
  });

  test("0 tanks: no turn runs and the empty board shows; 1 tank: one bot; 2 tanks: no bot; back to 1: the bot returns", () => {
    const l = startLeague();
    const empty = l.monthly.live(1);
    expect(empty).toMatchObject({ phase: "idle", tanks: [] });
    l.ticks.tick();
    expect(l.monthly.live(1).board.tick).toBe(0);

    const ada = newAccount();
    take(l, ada);
    const one = l.monthly.live(1);
    expect(one.phase).toBe("withBot");
    expect(one.tanks.map((t) => t.isBot).sort()).toEqual([false, true]);
    l.ticks.tick();
    expect(l.monthly.live(1).board.tick).toBe(1);

    const bo = newAccount();
    take(l, bo);
    const two = l.monthly.live(1);
    expect(two.phase).toBe("withoutBot");
    expect(two.tanks.some((t) => t.isBot)).toBe(false);
    expect(two.tanks).toHaveLength(2);

    l.monthly.quit(bo);
    expect(l.monthly.live(1).tanks.filter((t) => t.isBot)).toHaveLength(1);
    l.monthly.quit(ada);
    expect(l.monthly.live(1)).toMatchObject({ phase: "idle", tanks: [] });
    // The bot never appears in a ranking.
    expect(l.monthly.ranking(1).today.every((row) => row.name !== "Splashy")).toBe(true);
  });

  test("the board keeps its size for 16 tanks when tanks come and go", () => {
    const l = startLeague();
    const size = (): [number, number] => [l.monthly.live(1).board.width, l.monthly.live(1).board.height];
    const before = size();
    const owners = Array.from({ length: 5 }, newAccount);
    for (const owner of owners) take(l, owner);
    expect(size()).toEqual(before);
    l.monthly.quit(owners[0] ?? "");
    expect(size()).toEqual(before);
  });

  test("a tank that joins during the day plays from the next turn, and the day does not count for it", () => {
    const l = startLeague();
    const ada = newAccount();
    take(l, ada);
    const me = seatOf(l, ada);
    expect(me).toMatchObject({ countsToday: false, points: 0, league: 1 });
    const turns: string[][] = [];
    const before = l.monthly.live(1).board.tick;
    l.ticks.tick();
    turns.push(l.monthly.live(1).tanks.map((t) => t.id));
    expect(l.monthly.live(1).board.tick).toBe(before + 1);
    expect(turns[0]).toContain(me.seatId);
  });

  test("a new day respawns every seated tank with 0 points, and it counts for all of them", () => {
    const l = startLeague();
    const ada = newAccount();
    const bo = newAccount();
    take(l, ada);
    take(l, bo);
    for (let i = 0; i < 300; i++) l.ticks.tick();
    nextDay(l);
    expect(l.monthly.live(1).day).toBe("2026-11-15");
    for (const owner of [ada, bo]) expect(seatOf(l, owner)).toMatchObject({ points: 0, countsToday: true });
  });

  test("a quit on a counted day keeps the points the tank had when it left; the tank leaves at once", () => {
    const l = startLeague();
    const ada = newAccount();
    const bo = newAccount();
    take(l, ada);
    take(l, bo);
    nextDay(l);
    for (let i = 0; i < 2000 && seatOf(l, ada).points === 0; i++) l.ticks.tick();
    const points = seatOf(l, ada).points;
    const seatId = seatOf(l, ada).seatId;
    l.monthly.quit(ada);
    expect(l.monthly.live(1).tanks.some((t) => t.id === seatId)).toBe(false);
    expect(l.monthly.ranking(1).today.find((row) => row.seatId === seatId)).toMatchObject({ points, counts: true, seated: false });
    // A new seat the same day does not erase the day: its own day does not count.
    take(l, ada);
    for (let i = 0; i < 50; i++) l.ticks.tick();
    nextDay(l);
    const days = l.monthly.daysOf(1).days;
    expect(days[0]?.day).toBe("2026-11-15");
    // The day's score of the quit is in the month, and the new seat's points of that day are not.
    const after = seatOf(l, ada);
    expect(after.countedDays).toBe(1);
    expect(after.score).toBe(points);
  });

  test("a day close counts the tanks seated at its first turn and not the ones that came later; its top 3 is kept", () => {
    const l = startLeague();
    const ada = newAccount();
    const bo = newAccount();
    take(l, ada);
    take(l, bo);
    nextDay(l);
    const cy = newAccount();
    take(l, cy);
    for (let i = 0; i < 200; i++) l.ticks.tick();
    nextDay(l);
    expect(seatOf(l, ada).countedDays).toBe(1);
    expect(seatOf(l, bo).countedDays).toBe(1);
    expect(seatOf(l, cy).countedDays).toBe(0);
    const [record] = l.monthly.daysOf(1).days;
    expect(record?.day).toBe("2026-11-15");
    expect(record?.top).toHaveLength(3);
    // The first day had two tanks that both came during it: it has a top too, and counted for nobody.
    expect(l.monthly.daysOf(1).days.map((d) => d.day)).toEqual(["2026-11-15", "2026-11-14"]);
    const month = l.monthly.ranking(1).thisMonth;
    expect(month.map((row) => row.countedDays).sort()).toEqual([0, 1, 1]);
    expect(month.every((row) => row.rank === null)).toBe(true);
  });
});

describe("seats", () => {
  test("one seat per account; a quit frees it; a quit without a seat is refused", () => {
    const l = startLeague();
    const ada = newAccount();
    take(l, ada);
    expect(codeOf(() => take(l, ada))).toBe("monthly_seat_taken");
    l.monthly.quit(ada);
    expect(codeOf(() => l.monthly.quit(ada))).toBe("no_monthly_seat");
    take(l, ada);
  });

  test("a body that is not a tank is refused at the boundary", () => {
    const l = startLeague();
    expect(() => l.monthly.takeSeat(newAccount(), { look: plainTankLook(1), strategy: { modes: [] } })).toThrow(HttpError);
    expect(codeOf(() => l.monthly.takeSeat(newAccount(), { look: { colour: 99 }, strategy: strategy() }))).toBe("look_invalid");
    expect(() => l.monthly.takeSeat(newAccount(), null)).toThrow(HttpError);
  });

  test("the 17th seat opens League 2, and a new seat goes to the lowest league with a free seat", () => {
    const l = startLeague();
    const owners = Array.from({ length: 17 }, newAccount);
    for (const owner of owners) take(l, owner);
    expect(seatOf(l, owners[16] ?? "").league).toBe(2);
    expect(l.monthly.overview().leagues).toEqual([
      { league: 1, tanks: 16, phase: "withoutBot" },
      { league: 2, tanks: 1, phase: "withBot" },
    ]);
    l.monthly.quit(owners[0] ?? "");
    // League 2 is the lowest league and has free seats, so it gets the next one.
    const late = newAccount();
    take(l, late);
    expect(seatOf(l, late).league).toBe(2);
  });

  test("names: the first name of a month stays after a quit, may change once in a later month, and is reserved for its account", () => {
    const l = startLeague({ at: Date.parse("2026-11-29T17:00:00Z") }); // 2026-11-30 00:00 in Jakarta
    const ada = newAccount();
    take(l, ada, { name: "Ada" });
    l.monthly.quit(ada);
    expect(codeOf(() => take(l, ada, { name: "Bob" }))).toBe("monthly_name_fixed");
    // Another account cannot take the name while it is reserved this month.
    expect(codeOf(() => take(l, newAccount(), { name: "ada" }))).toBe("name_taken");
    expect(take(l, ada).seat?.name).toBe("Ada");
    expect(codeOf(() => l.monthly.rename(ada, { name: "Bob" }))).toBe("monthly_name_fixed");

    nextDay(l); // 2026-12-01: the month changes
    expect(l.monthly.me(ada).name).toEqual({ name: "Ada", month: "2026-11", canChange: true });
    l.monthly.rename(ada, { name: "Bob" });
    expect(l.monthly.me(ada)).toMatchObject({ seat: { name: "Bob" }, name: { name: "Bob", month: "2026-12", canChange: false } });
    expect(l.monthly.live(1).tanks.find((t) => !t.isBot)?.name).toBe("Bob");
    expect(codeOf(() => l.monthly.rename(ada, { name: "Cy" }))).toBe("monthly_name_fixed");
    // "Ada" was November's; it is free in December.
    expect(take(l, newAccount(), { name: "Ada" }).seat?.name).toBe("Ada");
  });

  test("a typed name follows the name rule and the block list", () => {
    const l = startLeague();
    expect(codeOf(() => take(l, newAccount(), { name: "x" }))).toBe("name_invalid");
    expect(codeOf(() => take(l, newAccount(), { name: "fuck" }))).toBe("name_blocked");
  });
});

describe("the month close", () => {
  test("rank 1 of League 1 with 7 counted days is the champion, with League 1's top 10, and the seats move", () => {
    // Seated during 2026-11-23, so 24 to 30 November are 7 counted days.
    const l = startLeague({ at: Date.parse("2026-11-22T20:00:00Z") });
    const owners = Array.from({ length: 17 }, newAccount);
    owners.forEach((owner, i) => take(l, owner, { name: `Tank ${i + 1}` }));
    for (let day = 0; day < 7; day++) nextDay(l);
    expect(l.monthly.live(1).day).toBe("2026-11-30");
    // Six quit from League 1, so League 2's only tank moves up to fill and League 2 closes.
    for (const owner of owners.slice(10, 16)) l.monthly.quit(owner);
    nextDay(l);
    expect(l.monthly.live(1)).toMatchObject({ day: "2026-12-01", month: "2026-12" });
    const [record] = l.champions.records();
    expect(record?.month).toBe("2026-11");
    expect(record?.champion).toMatchObject({ rank: 1, games: 7 });
    expect(record?.top.length).toBe(10);
    expect(l.monthly.overview().leagues).toEqual([{ league: 1, tanks: 11, phase: "withoutBot" }]);
    expect(l.monthly.me(owners[16] ?? "").move).toEqual({ month: "2026-11", from: 2, to: 1, kind: "up" });
    expect(l.monthly.me(owners[0] ?? "").move).toMatchObject({ kind: "stayed" });
    l.monthly.moveSeen(owners[16] ?? "");
    expect(l.monthly.me(owners[16] ?? "").move).toBeNull();
    // The new month starts with no counted day.
    expect(seatOf(l, owners[0] ?? "")).toMatchObject({ countedDays: 0, countsToday: true });
  });

  test("a month without a tank of 7 counted days records no champion", () => {
    const l = startLeague({ at: Date.parse("2026-11-29T20:00:00Z") });
    take(l, newAccount());
    nextDay(l);
    nextDay(l);
    expect(l.champions.isClosed("2026-11")).toBe(true);
    expect(l.champions.records()).toEqual([]);
  });
});

describe("the streams", () => {
  test("`own` follows the stream's account: a seat taken after the stream opened, a quit, and a new seat", async () => {
    const l = startLeague();
    const ada = newAccount();
    const watcher = collect(l.streams.open(1, null, l.monthly.live(1)));
    const owner = collect(l.streams.open(1, ada, l.monthly.live(1)));
    const first = take(l, ada).seat?.seatId;
    l.ticks.tick();
    const ownOf = async (stream: ReturnType<typeof collect>) => (await stream.take()).messages.flatMap((m) => (m.type === "tick" ? [m.own?.botId ?? null] : []));
    expect(await ownOf(owner)).toEqual([first ?? "missing"]);
    expect(await ownOf(watcher)).toEqual([null]);
    l.monthly.quit(ada);
    take(l, newAccount());
    l.ticks.tick();
    expect(await ownOf(owner)).toEqual([null]);
    const second = take(l, ada).seat?.seatId;
    expect(second).not.toBe(first);
    l.ticks.tick();
    expect(await ownOf(owner)).toEqual([second ?? "missing"]);
  });

  test("a league the month close empties tells its open streams how many leagues are left, and ends them", async () => {
    const l = startLeague({ at: Date.parse("2026-11-29T20:00:00Z") });
    const owners = Array.from({ length: 17 }, newAccount);
    for (const owner of owners) take(l, owner);
    l.monthly.quit(owners[0] ?? "");
    const stream = collect(l.streams.open(2, null, l.monthly.live(2)));
    await stream.take();
    nextDay(l);
    nextDay(l); // 2026-12-01: League 2's only tank fills League 1's free seat, and League 2 closes.
    expect(l.monthly.overview().leagues.length).toBe(1);
    const { messages, ended } = await stream.take();
    expect(messages.at(-1)).toEqual({ type: "closed", leagues: 1 });
    expect(ended).toBe(true);
    expect(l.streams.count(2)).toBe(0);
  });

  test("my seat carries its strategy, so any device can describe the tank's turns", () => {
    const l = startLeague();
    const ada = newAccount();
    take(l, ada, { strategy: strategy(2) });
    expect(seatOf(l, ada).strategy).toEqual(strategy(2));
  });
});

describe("restart", () => {
  test("a clean stop writes the checkpoint; the start resumes the day with each tank's points and counts", () => {
    const db = memoryDatabase();
    const first = startLeague({ db });
    const ada = newAccount();
    const bo = newAccount();
    take(first, ada);
    take(first, bo);
    nextDay(first);
    const cy = newAccount();
    take(first, cy);
    for (let i = 0; i < 3000 && seatOf(first, ada).points === 0; i++) first.ticks.tick();
    const before = [ada, bo, cy].map((owner) => seatOf(first, owner));
    expect(before.some((seat) => seat.points !== 0)).toBe(true);
    first.monthly.stop();

    first.ticks.advance(60_000);
    const second = startLeague({ db, ticks: first.ticks });
    const after = [ada, bo, cy].map((owner) => seatOf(second, owner));
    expect(after.map((s) => [s.seatId, s.points, s.countsToday])).toEqual(before.map((s) => [s.seatId, s.points, s.countsToday]));
    // A new round: the board starts from turn 0 again, with the turns left of the day.
    expect(second.monthly.live(1).board.tick).toBe(0);
    second.monthly.stop();
  });

  test("a day that ended while the server was down closes at the start with the checkpoint's points", () => {
    const db = memoryDatabase();
    const first = startLeague({ db });
    const ada = newAccount();
    take(first, ada);
    take(first, newAccount());
    nextDay(first);
    for (let i = 0; i < 3000 && seatOf(first, ada).points === 0; i++) first.ticks.tick();
    const points = seatOf(first, ada).points;
    first.monthly.stop();

    first.ticks.advance(DAY_MS);
    const second = startLeague({ db, ticks: first.ticks });
    expect(second.monthly.live(1).day).toBe("2026-11-16");
    expect(seatOf(second, ada)).toMatchObject({ countedDays: 1, score: points, points: 0, countsToday: true });
    second.monthly.stop();
  });
});

describe("the league's tables", () => {
  test("the UNIQUE seat name refuses a second tank of one name in any case with 409 name_taken, and writes nothing", () => {
    const db = memoryDatabase();
    const store = new LeagueStore(db, Date.now);
    const seat = (accountId: string, seatId: string, name: string, order: number) => ({ seatId, accountId, league: 1, name, look: plainTankLook(1), strategy: strategy(), order });
    const one = { leagues: 1, nextOrder: 2, closedMonth: null, seats: new Map([["account-a", seat("account-a", "p1", "Ada", 1)]]), names: new Map(), moves: new Map() };
    store.writeSeats(one);
    const two = { ...one, nextOrder: 3, seats: new Map([...one.seats, ["account-b", seat("account-b", "p2", "ADA", 2)]]) };
    let refused: unknown;
    try {
      store.writeSeats(two);
    } catch (error) {
      refused = error;
    }
    expect(refused).toBeInstanceOf(HttpError);
    expect(refused).toMatchObject({ status: 409, extra: { code: "name_taken" } });
    expect([...store.readSeats().seats.keys()]).toEqual(["account-a"]);
  });
});

describe("memory", () => {
  test("a shortened day of 16 tanks: nothing the league holds grows with the turns", () => {
    const l = startLeague();
    for (let i = 0; i < 16; i++) take(l, newAccount());
    for (let i = 0; i < 500; i++) l.ticks.tick();
    const early = l.monthly.holdings();
    for (let i = 0; i < 5000; i++) l.ticks.tick();
    expect(l.monthly.holdings()).toEqual(early);
    expect(l.monthly.live(1).board.tick).toBe(5500);
  });

  test("a turn runs no SQL: only the seat changes, the minute's checkpoint and the day's close reach the database", () => {
    const ticks = manualScheduler(NOV_14 + 10 * 60 * 60 * 1000);
    const db = memoryDatabase();
    // The league reaches the database only through these two stores, so counting their calls counts its SQL.
    let storeCalls = 0;
    const counted = <T extends object>(target: T): T =>
      new Proxy(target, {
        get(object, key) {
          const value: unknown = Reflect.get(object, key);
          return typeof value === "function" ? (...args: unknown[]) => (storeCalls++, value.apply(object, args)) : value;
        },
      });
    // The league's turn timer alone, without the checkpoint timer that tick() would also run.
    const timers: { readonly ms: number; readonly run: () => void }[] = [];
    const scheduler: ManualScheduler = { ...ticks, every: (run, ms) => (timers.push({ ms, run }), ticks.every(run, ms)) };
    const monthly = new MonthlyLeagues({
      store: counted(new LeagueStore(db, ticks.now)),
      champions: counted(new Champions(db)),
      streams: new LeagueStreams({ heartbeatMs: 60_000, maxStreamsPerLeague: 10 }),
      calendar: zoneCalendar("Asia/Jakarta"),
      now: ticks.now,
      scheduler,
      tickMs: 900,
    });
    monthly.start();
    for (let i = 0; i < 3; i++) monthly.takeSeat(newAccount(), { look: plainTankLook(1), strategy: strategy(i) });
    const turn = timers.find((timer) => timer.ms === 900);
    if (turn === undefined) throw new Error("no turn timer");
    const changes = () => db.query<{ n: number }, []>("SELECT total_changes() AS n").get()?.n;
    const before = changes();
    storeCalls = 0;
    for (let i = 0; i < 50; i++) turn.run();
    expect(monthly.live(1).board.tick).toBe(50);
    expect(storeCalls).toBe(0);
    expect(changes()).toBe(before);
    monthly.stop();
    expect(storeCalls).toBeGreaterThan(0);
  });
});
