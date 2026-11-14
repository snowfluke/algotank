import { describe, expect, test } from "bun:test";
import { nextFlow, WATCHING, type FlowEvent, type MonthlyFlow } from "./flow.ts";

const naming: MonthlyFlow = { kind: "naming" };
const preparing: MonthlyFlow = { kind: "preparing", submitting: false };
const submitting: MonthlyFlow = { kind: "preparing", submitting: true };
const seated: MonthlyFlow = { kind: "seated" };
const quitting: MonthlyFlow = { kind: "quitting", busy: false };
const quittingBusy: MonthlyFlow = { kind: "quitting", busy: true };

describe("the monthly page's flow (the table in flow.ts)", () => {
  const rows: [MonthlyFlow, FlowEvent, MonthlyFlow][] = [
    [WATCHING, { type: "join", signedIn: false }, { kind: "signingIn" }],
    [WATCHING, { type: "join", signedIn: true }, naming],
    [{ kind: "signingIn" }, { type: "returnedToJoin" }, naming],
    [WATCHING, { type: "returnedToJoin" }, naming],
    [naming, { type: "nameDone" }, preparing],
    [naming, { type: "back" }, WATCHING],
    [preparing, { type: "back" }, naming],
    [submitting, { type: "back" }, submitting],
    [preparing, { type: "submit" }, submitting],
    [submitting, { type: "submit" }, submitting],
    [submitting, { type: "submitFailed", nameProblem: true }, naming],
    [submitting, { type: "submitFailed", nameProblem: false }, preparing],
    [submitting, { type: "seatTaken" }, seated],
    [seated, { type: "askQuit" }, quitting],
    [quitting, { type: "cancelQuit" }, seated],
    [quittingBusy, { type: "cancelQuit" }, quittingBusy],
    [quitting, { type: "quitConfirmed" }, quittingBusy],
    [quittingBusy, { type: "quitFailed" }, quitting],
    [quittingBusy, { type: "quitDone" }, WATCHING],
    [WATCHING, { type: "seatLoaded", seated: true }, seated],
    [naming, { type: "seatLoaded", seated: true }, seated],
    [preparing, { type: "seatLoaded", seated: true }, seated],
    [submitting, { type: "seatLoaded", seated: true }, submitting],
    [seated, { type: "seatLoaded", seated: false }, WATCHING],
    [quitting, { type: "seatLoaded", seated: false }, WATCHING],
    [quittingBusy, { type: "seatLoaded", seated: false }, quittingBusy],
  ];
  for (const [from, event, to] of rows) {
    test(`${JSON.stringify(from)} + ${JSON.stringify(event)}`, () => expect(nextFlow(from, event)).toEqual(to));
  }

  test("an event no row allows keeps the state", () => {
    expect(nextFlow(WATCHING, { type: "askQuit" })).toEqual(WATCHING);
    expect(nextFlow(seated, { type: "join", signedIn: true })).toEqual(seated);
    expect(nextFlow(naming, { type: "seatTaken" })).toEqual(naming);
    expect(nextFlow(WATCHING, { type: "quitDone" })).toEqual(WATCHING);
  });
});
