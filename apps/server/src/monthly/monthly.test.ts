// The league's rules through its public methods, with the manual clock and scheduler and the
// Asia/Jakarta calendar (docs/specs/revamp/77-monthly-league.md, sections 1 to 3 and 5).

import { Disclosure } from "./disclosure.ts";
import { GameMasters } from "./game-masters.ts";
import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import type { Database } from "bun:sqlite";
import { plainTankLook, ULTIMATES_FROM, type LeagueStreamMessage, type MonthlyMeResponse } from "@game/arena";
import { arenaSize, PRESETS, ruleSet, STANDARD_RULE_SET_ID, ULTIMATE_RULES } from "@game/engine";
import { HttpError } from "../http.ts";
import { manualScheduler, type ManualScheduler } from "../test-helpers.ts";
import { DEFAULT_LEAGUE_TIME_ZONE, zoneCalendar, type LeagueCalendar } from "./calendar.ts";
import { Champions } from "./champions.ts";
import { insertAccount, memoryDatabase } from "../db/testing.ts";
import { LeagueStore } from "./league-store.ts";
import { BOARD_GROWTH, RESHUFFLE_TURNS } from "./league-day.ts";
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
/**
 * `seatsPerLeague` is 16 unless given, so the tests of several leagues and of the month close need 17
 * tanks, not 513; `null` gives the server's MONTHLY_SEATS.
 */
function startLeague(options: { readonly at?: number; readonly db?: Database; readonly ticks?: ManualScheduler; readonly seatsPerLeague?: number | null; readonly calendar?: LeagueCalendar } = {}): League {
  const ticks = options.ticks ?? manualScheduler(options.at ?? NOV_14 + 10 * 60 * 60 * 1000);
  const db = options.db ?? memoryDatabase();
  const champions = new Champions(db);
  const streams = new LeagueStreams({ heartbeatMs: 60_000, maxStreamsPerLeague: 10 });
  const monthly = new MonthlyLeagues({
    store: new LeagueStore(db, ticks.now),
    gameMasters: new GameMasters(db),
    disclosure: new Disclosure(db),
    champions,
    streams,
    calendar: options.calendar ?? zoneCalendar(DEFAULT_LEAGUE_TIME_ZONE),
    now: ticks.now,
    scheduler: ticks,
    tickMs: 900,
    // Every draw is 0: no bot, except the one a lone tank always gets (league-day.ts), with the first play style of the lineup.
    random: () => 0,
    ...(options.seatsPerLeague === null ? {} : { seatsPerLeague: options.seatsPerLeague ?? 16 }),
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
  test("the Jakarta midnight that opens ultimates gives the new day's tanks a fresh charge", () => {
    const l = startLeague({ at: ULTIMATES_FROM - 1 });
    take(l, newAccount());
    expect(l.monthly.live(1)).toMatchObject({ day: "2026-11-21", dayEndsInMs: 1 });
    expect(l.monthly.live(1).board.bots.every((bot) => bot.ultimate === undefined)).toBe(true);
    nextDay(l);
    const live = l.monthly.live(1);
    expect(live).toMatchObject({ day: "2026-11-22", board: { tick: 0 } });
    expect(live.board.bots).toHaveLength(2);
    expect(live.board.bots.every((bot) => bot.ultimate?.kind === "charging" && bot.ultimate.turnsLeft === ULTIMATE_RULES.firstReadyTurn)).toBe(true);
  });

  test("a league whose day spans the gate keeps its round off through ticks and joins until the next round", () => {
    const l = startLeague({ at: ULTIMATES_FROM - 1, calendar: zoneCalendar("UTC") });
    take(l, newAccount());
    l.ticks.advance(2);
    l.ticks.tick();
    const joined = take(l, newAccount());
    const before = l.monthly.live(1).board;
    expect(before.tick).toBe(1);
    expect(before.bots.find((bot) => bot.id === joined.seat?.seatId)).toBeDefined();
    expect(before.bots.every((bot) => bot.ultimate === undefined)).toBe(true);
    for (let i = 0; i < RESHUFFLE_TURNS; i++) l.ticks.tick();
    const after = l.monthly.live(1).board;
    expect(after.tick).toBe(1);
    expect(after.bots.every((bot) => bot.ultimate?.kind === "charging")).toBe(true);
  });
  test("lasts from 00:00 to 24:00 in the league's time zone: 96,000 turns of 0.9 s", () => {
    const l = startLeague({ at: NOV_14 });
    const live = l.monthly.live(1);
    expect(live).toMatchObject({ day: "2026-11-14", month: "2026-11", dayEndsInMs: DAY_MS, tickMs: 900 });
    expect(live.board.ticksTotal).toBe(96_000);
    take(l, newAccount());
    expect(l.monthly.live(1).board.ticksTotal).toBe(96_000);
  });

  test("0 tanks: no turn runs; 1 tank: at least one bot; a second tank keeps the bots until the next new start, which draws again", () => {
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
    expect(two.phase).toBe("withBot");
    expect(two.tanks).toHaveLength(3);
    // The next new start draws again; every draw is 0 here, and two tanks need no bot.
    while (l.monthly.live(1).board.tick !== 0) l.ticks.tick();
    const drawn = l.monthly.live(1);
    expect(drawn.phase).toBe("withoutBot");
    expect(drawn.tanks).toHaveLength(2);

    l.monthly.quit(bo);
    expect(l.monthly.live(1).tanks.filter((t) => t.isBot)).toHaveLength(1);
    l.monthly.quit(ada);
    expect(l.monthly.live(1)).toMatchObject({ phase: "idle", tanks: [] });
    // The bot never appears in a ranking.
    expect(l.monthly.ranking(1).today.every((row) => row.name !== "Splashy")).toBe(true);
  });

  test("the board keeps its size for 16 tanks when up to 16 tanks come and go", () => {
    const l = startLeague();
    const size = (): [number, number] => [l.monthly.live(1).board.width, l.monthly.live(1).board.height];
    const before = size();
    const owners = Array.from({ length: 5 }, newAccount);
    for (const owner of owners) take(l, owner);
    expect(size()).toEqual(before);
    l.monthly.quit(owners[0] ?? "");
    expect(size()).toEqual(before);
  });

  test("with the server's seats, the 17th and the 100th tank stay in League 1, and the board grows with them", () => {
    const l = startLeague({ seatsPerLeague: null });
    const cells = () => l.monthly.live(1).board.width * l.monthly.live(1).board.height;
    const small = cells();
    // 100 joins with no turn between them: a rush never runs out of squares, and every tank is on the board.
    const owners = Array.from({ length: 100 }, newAccount);
    for (const owner of owners) take(l, owner);
    expect(owners.every((owner) => seatOf(l, owner).league === 1)).toBe(true);
    expect(l.monthly.overview().leagues).toEqual([{ league: 1, tanks: 100, phase: expect.any(String) }]);
    expect(l.monthly.live(1).tanks.filter((tank) => !tank.isBot)).toHaveLength(100);
    // During the rush the board grew whenever the tanks passed BOARD_GROWTH times its size.
    const cellsFor = (tanks: number) => {
      const size = arenaSize(tanks, ruleSet(STANDARD_RULE_SET_ID));
      return size.width * size.height;
    };
    expect(cells()).toBeGreaterThan(small);
    expect(cells()).toBeGreaterThanOrEqual(cellsFor(Math.ceil(100 / BOARD_GROWTH)));
    // The next new start sizes the board for exactly the seated tanks.
    for (let i = 0; i < RESHUFFLE_TURNS + 1; i++) l.ticks.tick();
    expect(cells()).toBe(cellsFor(100));
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

  test("every RESHUFFLE_TURNS turns the tanks start again on new squares with their points, and open pages get the new board", async () => {
    const l = startLeague();
    const ada = newAccount();
    const bo = newAccount();
    take(l, ada);
    take(l, bo);
    const page = collect(l.streams.open(1, null, l.monthly.live(1)));
    for (let i = 0; i < RESHUFFLE_TURNS - 1; i++) l.ticks.tick();
    expect(l.monthly.live(1).board.tick).toBe(RESHUFFLE_TURNS - 1);
    await page.take();
    const before = [seatOf(l, ada).points, seatOf(l, bo).points];
    // The turn that reaches the limit is played, then the round starts again.
    l.ticks.tick();
    const after = l.monthly.live(1);
    expect(after.board.tick).toBe(0);
    expect(after.board.bots.every((bot) => bot.water === after.board.bots[0]?.water)).toBe(true);
    const played = [seatOf(l, ada).points, seatOf(l, bo).points];
    // The points are kept: only the one turn played before the new start can change them, by a few hits at most.
    for (const [i, points] of played.entries()) expect(Math.abs(points - (before[i] ?? 0))).toBeLessThanOrEqual(3);
    const types = (await page.take()).messages.map((message) => message.type);
    expect(types.slice(-2)).toEqual(["tick", "state"]);
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
    // Leaving is a pause: a new seat the same day goes on from the saved points, and today counts for it.
    take(l, ada);
    expect(seatOf(l, ada)).toMatchObject({ points, countsToday: true });
    for (let i = 0; i < 50; i++) l.ticks.tick();
    // One row for the player: the tank on the board, moving with it.
    const rows = l.monthly.ranking(1).today.filter((row) => row.name === seatOf(l, ada).name);
    expect(rows).toEqual([expect.objectContaining({ seatId: seatOf(l, ada).seatId, points: seatOf(l, ada).points, counts: true, seated: true, livePoints: true })]);
    const final = seatOf(l, ada).points;
    nextDay(l);
    const days = l.monthly.daysOf(1).days;
    expect(days[0]?.day).toBe("2026-11-15");
    // The day's score is the tank's points at the day's end, the turns before and after the pause together.
    const after = seatOf(l, ada);
    expect(after.countedDays).toBe(1);
    expect(after.score).toBe(final);
  });

  test("a game master's tank plays the day but takes no place: no counted day, no top 3, no month rank", () => {
    const db = memoryDatabase();
    const l = startLeague({ db });
    const [gm, ada, bo] = [newAccount(), newAccount(), newAccount()];
    // The game master table points at real accounts (gone with the account); the other tests' accounts are only ids.
    insertAccount(db, gm);
    for (const account of [gm, ada, bo]) take(l, account);
    l.monthly.setGameMaster(seatOf(l, gm).seatId, true);
    nextDay(l);
    for (let i = 0; i < 200; i++) l.ticks.tick();
    nextDay(l);
    expect([seatOf(l, gm).countedDays, seatOf(l, ada).countedDays, seatOf(l, bo).countedDays]).toEqual([0, 1, 1]);
    const top = l.monthly.daysOf(1).days.flatMap((d) => d.top.map((t) => t.name));
    expect(top).not.toContain(seatOf(l, gm).name);
    const month = l.monthly.ranking(1).thisMonth;
    expect(month.find((row) => row.seatId === seatOf(l, gm).seatId)).toMatchObject({ rank: null, gm: true });
    expect(month.filter((row) => !row.gm).map((row) => row.rank).sort()).toEqual([1, 2]);
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
    // One counted day is enough for a place (MONTHLY_RANKED_DAYS), so only the tank that came later has none.
    expect(month.map((row) => [row.countedDays, row.rank === null])).toEqual([
      [1, false],
      [1, false],
      [0, true],
    ]);
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
      // League 1's first tank got a bot, which stays until the next new start.
      { league: 1, tanks: 16, phase: "withBot" },
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

  test("with one league every seated tank still gets the month close's notice, as 'stayed'", () => {
    const l = startLeague({ at: Date.parse("2026-11-29T20:00:00Z") });
    const ada = newAccount();
    take(l, ada);
    take(l, newAccount());
    nextDay(l);
    nextDay(l);
    expect(l.monthly.live(1).month).toBe("2026-12");
    expect(l.monthly.me(ada).move).toEqual({ month: "2026-11", from: 1, to: 1, kind: "stayed" });
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

describe("what anyone may read about a tank (monthly-protocol.ts, the visibility table)", () => {
  test("a tank's sheet has its last finished day's numbers, and rules only for a game master's tank", () => {
    const db = memoryDatabase();
    const l = startLeague({ db });
    const [gm, ada] = [newAccount(), newAccount()];
    insertAccount(db, gm);
    take(l, gm);
    take(l, ada);
    l.monthly.setGameMaster(seatOf(l, gm).seatId, true);
    expect(l.monthly.tankSheet(seatOf(l, ada).seatId)).toEqual({ seatId: seatOf(l, ada).seatId, rules: null, lastDay: null });
    for (let i = 0; i < 50; i++) l.ticks.tick();
    nextDay(l);
    const sheet = l.monthly.tankSheet(seatOf(l, ada).seatId);
    expect(sheet.rules).toBeNull();
    expect(sheet.lastDay?.day).toBe("2026-11-14");
    expect(sheet.lastDay?.numbers.turns).toBeGreaterThan(0);
    // The numbers carry no rule counts.
    expect(Object.keys(sheet.lastDay?.numbers ?? {}).sort()).toEqual(["hits", "shots", "squaresMoved", "timesHit", "turns"]);
    expect(l.monthly.tankSheet(seatOf(l, gm).seatId).rules).toEqual(l.monthly.me(gm).seat?.strategy ?? null);
    expect(codeOf(() => l.monthly.tankSheet("nobody"))).toBe("no_monthly_seat");
  });

  test("a quit keeps the numbers of the part of the day the tank played", () => {
    const db = memoryDatabase();
    const l = startLeague({ db });
    const ada = newAccount();
    take(l, ada);
    take(l, newAccount());
    for (let i = 0; i < 30; i++) l.ticks.tick();
    const seatId = seatOf(l, ada).seatId;
    l.monthly.quit(ada);
    expect(new Disclosure(db).lastDayNumbers(seatId, "2026-11-15")?.day).toBe("2026-11-14");
  });

  test("November's close opens no rules; December's opens every seated tank's rules once, with its place", () => {
    const db = memoryDatabase();
    const november = startLeague({ db, at: Date.parse("2026-11-29T20:00:00Z") });
    take(november, newAccount());
    nextDay(november);
    nextDay(november);
    expect(november.monthly.live(1).month).toBe("2026-12");
    expect(november.monthly.publishedMonths().months).toEqual([]);
    expect(codeOf(() => november.monthly.monthTanks("2026-11"))).toBe("month_not_published");

    // Seated during 2026-12-23, so 24 to 31 December are 8 counted days.
    const l = startLeague({ at: Date.parse("2026-12-22T20:00:00Z") });
    const owners = [newAccount(), newAccount(), newAccount()];
    owners.forEach((owner, i) => take(l, owner, { name: `Tank ${i + 1}`, strategy: strategy(i) }));
    for (let day = 0; day < 9; day++) nextDay(l);
    expect(l.monthly.live(1).month).toBe("2027-01");
    expect(l.monthly.publishedMonths().months).toEqual(["2026-12"]);
    const { tanks } = l.monthly.monthTanks("2026-12");
    expect(tanks.map((t) => t.rank)).toEqual([1, 2, 3]);
    expect(tanks.every((t) => t.league === 1 && !t.gm)).toBe(true);
    const first = tanks[0];
    expect(first).toBeDefined();
    const rules = l.monthly.monthTankRules("2026-12", first?.seatId);
    expect(rules.rules.modes.length).toBeGreaterThan(0);
    expect(codeOf(() => l.monthly.monthTankRules("2026-12", "nobody"))).toBe("no_monthly_seat");
    // The copy is the one taken at the close: a tank's new rules in January do not change it.
    const before = JSON.stringify(rules);
    l.monthly.changeStrategy(owners[0] ?? "", { strategy: strategy(5) });
    expect(JSON.stringify(l.monthly.monthTankRules("2026-12", first?.seatId))).toBe(before);
  });
});

describe("the host's rename", () => {
  test("the tank, the board and this month's day records take the new name", () => {
    const l = startLeague();
    const [ada, bo] = [newAccount(), newAccount()];
    take(l, ada, { name: "Prabowo" });
    take(l, bo, { name: "Bobo" });
    for (let i = 0; i < 300; i++) l.ticks.tick();
    nextDay(l);
    expect(l.monthly.daysOf(1).days.flatMap((d) => d.top.map((p) => p.name))).toContain("Prabowo");
    l.monthly.adminRename(seatOf(l, ada).seatId, { name: "Sunda empire" });
    expect(seatOf(l, ada).name).toBe("Sunda empire");
    expect(l.monthly.live(1).tanks.find((t) => t.id === seatOf(l, ada).seatId)?.name).toBe("Sunda empire");
    const names = l.monthly.daysOf(1).days.flatMap((d) => d.top.map((p) => p.name));
    expect(names).toContain("Sunda empire");
    expect(names).not.toContain("Prabowo");
    expect(codeOf(() => l.monthly.adminRename(seatOf(l, ada).seatId, { name: "bobo" }))).toBe("name_taken");
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
    // Every turn was played: after 5,500 turns the round counter shows the turns since the last new start (RESHUFFLE_TURNS).
    expect(l.monthly.live(1).board.tick).toBe(5500 % RESHUFFLE_TURNS);
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
      gameMasters: new GameMasters(db),
    disclosure: new Disclosure(db),
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
