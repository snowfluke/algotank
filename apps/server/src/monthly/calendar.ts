// The monthly league's calendar: which day round plays at a moment, when it starts and ends,
// and which month it belongs to (docs/specs/revamp/77-monthly-league.md, section 2).
//
// | Calendar        | Day                                        | Month                       | Used by                 |
// |-----------------|--------------------------------------------|-----------------------------|-------------------------|
// | zoneCalendar    | 00:00 to 24:00 in LEAGUE_TIME_ZONE         | the calendar month there    | the game and the tests  |
// | shortDayCalendar| `dayMs` long, counted from an anchor       | `daysPerMonth` days         | a scripted run only     |
//
// The short calendar exists because PUBLIC_TIME_DIVISOR stops at 9, which still makes a day
// 2.7 hours: a real run must show a day close and a month close within minutes. Its ids look
// like real dates (the month of the anchor, then the next months), so every store and page
// reads them like real ones. It depends on the anchor and the clock only, so a restart with the
// same LEAGUE_SHORT_DAYS continues the same day.

/** One day round of the calendar. */
export interface CalendarDay {
  /** YYYY-MM-DD. */
  readonly day: string;
  /** YYYY-MM. */
  readonly month: string;
  /** Milliseconds since 1970 of the day's first moment. */
  readonly startsAt: number;
  /** The first moment of the next day. */
  readonly endsAt: number;
}

export interface LeagueCalendar {
  dayAt(ms: number): CalendarDay;
}

export const DEFAULT_LEAGUE_TIME_ZONE = "Asia/Jakarta";

/** True when Intl knows the zone. config.ts checks LEAGUE_TIME_ZONE with it at start. */
export function isTimeZone(zone: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

const pad = (n: number, width = 2): string => String(n).padStart(width, "0");

/** The wall-clock fields of `ms` in the formatter's zone. */
function wallClock(ms: number, formatter: Intl.DateTimeFormat): { y: number; m: number; d: number; h: number; min: number; s: number } {
  const parts = formatter.formatToParts(ms);
  const field = (type: Intl.DateTimeFormatPartTypes): number => {
    const value = parts.find((p) => p.type === type)?.value;
    if (value === undefined) throw new Error(`The time ${ms} has no ${type} in the league's time zone.`);
    return Number(value);
  };
  return { y: field("year"), m: field("month"), d: field("day"), h: field("hour"), min: field("minute"), s: field("second") };
}

/** How far the zone's wall clock is ahead of UTC at `ms`. */
function offsetAt(ms: number, formatter: Intl.DateTimeFormat): number {
  const w = wallClock(ms, formatter);
  return Date.UTC(w.y, w.m - 1, w.d, w.h, w.min, w.s) - (ms - (((ms % 1000) + 1000) % 1000));
}

// ponytail: one correction for a change of the offset at midnight; a zone that skips its midnight
// (a few zones change their clocks at 00:00) gets the nearest moment. Asia/Jakarta has no changes.
function midnight(y: number, m: number, d: number, formatter: Intl.DateTimeFormat): number {
  const guess = Date.UTC(y, m - 1, d);
  const first = guess - offsetAt(guess, formatter);
  return guess - offsetAt(first, formatter);
}

/** The calendar days of `timeZone`. */
export function zoneCalendar(timeZone: string): LeagueCalendar {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  return {
    dayAt(ms) {
      const w = wallClock(ms, formatter);
      const month = `${pad(w.y, 4)}-${pad(w.m)}`;
      return { day: `${month}-${pad(w.d)}`, month, startsAt: midnight(w.y, w.m, w.d, formatter), endsAt: midnight(w.y, w.m, w.d + 1, formatter) };
    },
  };
}

export interface ShortDays {
  /** The first moment of the first short day. */
  readonly anchor: number;
  readonly dayMs: number;
  readonly daysPerMonth: number;
}

/** Days of `dayMs` from the anchor on, `daysPerMonth` to a month. For a scripted run (LEAGUE_SHORT_DAYS). */
export function shortDayCalendar({ anchor, dayMs, daysPerMonth }: ShortDays): LeagueCalendar {
  const base = new Date(anchor);
  const baseMonths = base.getUTCFullYear() * 12 + base.getUTCMonth();
  return {
    dayAt(ms) {
      const index = Math.floor((ms - anchor) / dayMs);
      const monthIndex = Math.floor(index / daysPerMonth);
      const months = baseMonths + monthIndex;
      const month = `${pad(Math.floor(months / 12), 4)}-${pad((months % 12) + 1)}`;
      const startsAt = anchor + index * dayMs;
      return { day: `${month}-${pad(index - monthIndex * daysPerMonth + 1)}`, month, startsAt, endsAt: startsAt + dayMs };
    },
  };
}

const SHORT_DAYS = /^([^/]+)\/(\d{1,6})\/(\d{1,2})$/;

/** LEAGUE_SHORT_DAYS: "<anchor ISO time>/<seconds per day>/<days per month>", or null when the text does not fit. */
export function parseShortDays(text: string): ShortDays | null {
  const match = SHORT_DAYS.exec(text);
  if (match === null) return null;
  const anchor = Date.parse(match[1] ?? "");
  const seconds = Number(match[2]);
  const days = Number(match[3]);
  if (!Number.isFinite(anchor) || seconds < 10 || seconds > 86_400 || days < 1 || days > 31) return null;
  return { anchor, dayMs: seconds * 1000, daysPerMonth: days };
}
