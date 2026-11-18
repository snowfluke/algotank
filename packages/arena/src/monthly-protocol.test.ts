import { expect, test } from "bun:test";
import { LEAGUE_ACTIVITY_LIMIT, parseLeagueActivity } from "./monthly-protocol.ts";
import { plainTankLook } from "./types.ts";

test("league activity accepts the four public event kinds and drops fields outside the contract", () => {
  const tank = { seatId: "p1", name: "Ada", look: plainTankLook(2), at: 1_000 };
  const events = (["joined", "left", "changedRules", "changedLook"] as const).map((kind) => ({ kind, ...tank }));
  expect(parseLeagueActivity(events.map((event) => ({ ...event, accountId: "private" })))).toEqual(events);
  expect(parseLeagueActivity([])).toEqual([]);
});

test("league activity rejects oversized or malformed logs", () => {
  const event = { kind: "joined", seatId: "p1", name: "Ada", look: plainTankLook(2), at: 1_000 };
  expect(parseLeagueActivity(Array.from({ length: LEAGUE_ACTIVITY_LIMIT + 1 }, () => event))).toBeNull();
  for (const invalid of [{ kind: "renamed" }, { at: -1 }, { at: 1.5 }, { at: 9e15 }, { seatId: "" }, { name: null }, { look: {} }]) {
    expect(parseLeagueActivity([event, { ...event, ...invalid }])).toBeNull();
  }
  expect(parseLeagueActivity(undefined)).toBeNull();
});
