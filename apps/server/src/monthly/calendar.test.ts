import { describe, expect, test } from "bun:test";
import { shortDayCalendar, zoneCalendar } from "./calendar.ts";

describe("zoneCalendar", () => {
  test("a day runs from 00:00 to 24:00 in the zone, and the month follows the zone's date", () => {
    const jakarta = zoneCalendar("Asia/Jakarta");
    // 2026-11-30 23:59 in Jakarta is 16:59 UTC.
    expect(jakarta.dayAt(Date.parse("2026-11-30T16:59:00Z"))).toEqual({
      day: "2026-11-30",
      month: "2026-11",
      startsAt: Date.parse("2026-11-29T17:00:00Z"),
      endsAt: Date.parse("2026-11-30T17:00:00Z"),
    });
    expect(jakarta.dayAt(Date.parse("2026-11-30T17:00:00Z"))).toMatchObject({ day: "2026-12-01", month: "2026-12" });
  });

  test("a day with a clock change is 23 or 25 hours long", () => {
    const berlin = zoneCalendar("Europe/Berlin");
    const day = berlin.dayAt(Date.parse("2026-10-25T12:00:00Z"));
    expect(day.day).toBe("2026-10-25");
    expect(day.endsAt - day.startsAt).toBe(25 * 60 * 60 * 1000);
  });
});

describe("shortDayCalendar", () => {
  test("counts short days from the anchor, a few to a month, with ids like dates", () => {
    const anchor = Date.parse("2026-11-14T10:00:00Z");
    const calendar = shortDayCalendar({ anchor, dayMs: 120_000, daysPerMonth: 3 });
    expect(calendar.dayAt(anchor)).toEqual({ day: "2026-11-01", month: "2026-11", startsAt: anchor, endsAt: anchor + 120_000 });
    expect(calendar.dayAt(anchor + 2 * 120_000 + 5)).toMatchObject({ day: "2026-11-03", month: "2026-11" });
    expect(calendar.dayAt(anchor + 3 * 120_000)).toMatchObject({ day: "2026-12-01", month: "2026-12" });
    expect(calendar.dayAt(anchor + 6 * 120_000)).toMatchObject({ day: "2027-01-01", month: "2027-01" });
  });
});
