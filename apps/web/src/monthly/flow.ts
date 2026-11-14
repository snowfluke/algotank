// What the viewer of "/monthly" is doing (docs/specs/revamp/77-monthly-league.md, section 6).
// Watching needs nothing; taking a seat needs the account, a name and a tank. Pure, so every
// row is tested (flow.test.ts); MonthlyPage.tsx runs it and does the effects.
//
// | From       | Event                          | Actor  | Guard                          | To                     |
// |------------|--------------------------------|--------|--------------------------------|------------------------|
// | watching   | join                           | viewer | signed out                     | signingIn (sign-in page)|
// | watching   | join                           | viewer | signed in                      | naming                 |
// | signingIn  | back on the page, ?join=1      | viewer | signed in, no seat             | naming                 |
// | naming     | nameDone                       | viewer | the name follows the name rule | preparing              |
// | naming     | back                           | viewer |                                | watching               |
// | preparing  | back                           | viewer | not submitting                 | naming                 |
// | preparing  | submit                         | viewer | not submitting                 | preparing (submitting) |
// | preparing  | submitFailed (a name problem)  | server |                                | naming                 |
// | preparing  | submitFailed (another problem) | server |                                | preparing              |
// | preparing  | seatTaken                      | server |                                | seated                 |
// | seated     | askQuit                        | owner  |                                | quitting               |
// | quitting   | cancelQuit                     | owner  | not busy                       | seated                 |
// | quitting   | quitConfirmed                  | owner  | not busy                       | quitting (busy)        |
// | quitting   | quitFailed                     | server |                                | quitting               |
// | quitting   | quitDone                       | server |                                | watching               |
// | watching,  | seatLoaded: a seat             | server | (another device took one)      | seated                 |
// | naming,    |                                |        |                                |                        |
// | preparing  |                                |        |                                |                        |
// | seated,    | seatLoaded: no seat            | server | not busy (quit elsewhere)      | watching               |
// | quitting   |                                |        |                                |                        |
// Every other pair keeps the state. No state is terminal: a quit leads back to watching.

export type MonthlyFlow =
  | { readonly kind: "watching" }
  | { readonly kind: "signingIn" }
  | { readonly kind: "naming" }
  | { readonly kind: "preparing"; readonly submitting: boolean }
  | { readonly kind: "seated" }
  | { readonly kind: "quitting"; readonly busy: boolean };

export type FlowEvent =
  | { readonly type: "join"; readonly signedIn: boolean }
  | { readonly type: "returnedToJoin" }
  | { readonly type: "nameDone" }
  | { readonly type: "back" }
  | { readonly type: "submit" }
  | { readonly type: "submitFailed"; readonly nameProblem: boolean }
  | { readonly type: "seatTaken" }
  | { readonly type: "askQuit" }
  | { readonly type: "cancelQuit" }
  | { readonly type: "quitConfirmed" }
  | { readonly type: "quitFailed" }
  | { readonly type: "quitDone" }
  | { readonly type: "seatLoaded"; readonly seated: boolean };

export const WATCHING: MonthlyFlow = { kind: "watching" };

export function nextFlow(flow: MonthlyFlow, event: FlowEvent): MonthlyFlow {
  switch (event.type) {
    case "join":
      if (flow.kind !== "watching") return flow;
      return event.signedIn ? { kind: "naming" } : { kind: "signingIn" };
    case "returnedToJoin":
      return flow.kind === "watching" || flow.kind === "signingIn" ? { kind: "naming" } : flow;
    case "nameDone":
      return flow.kind === "naming" ? { kind: "preparing", submitting: false } : flow;
    case "back":
      if (flow.kind === "naming") return WATCHING;
      if (flow.kind === "preparing" && !flow.submitting) return { kind: "naming" };
      return flow;
    case "submit":
      return flow.kind === "preparing" && !flow.submitting ? { kind: "preparing", submitting: true } : flow;
    case "submitFailed":
      if (flow.kind !== "preparing") return flow;
      return event.nameProblem ? { kind: "naming" } : { kind: "preparing", submitting: false };
    case "seatTaken":
      return flow.kind === "preparing" ? { kind: "seated" } : flow;
    case "askQuit":
      return flow.kind === "seated" ? { kind: "quitting", busy: false } : flow;
    case "cancelQuit":
      return flow.kind === "quitting" && !flow.busy ? { kind: "seated" } : flow;
    case "quitConfirmed":
      return flow.kind === "quitting" && !flow.busy ? { kind: "quitting", busy: true } : flow;
    case "quitFailed":
      return flow.kind === "quitting" ? { kind: "quitting", busy: false } : flow;
    case "quitDone":
      return flow.kind === "quitting" ? WATCHING : flow;
    case "seatLoaded":
      if (event.seated) return flow.kind === "watching" || flow.kind === "naming" || (flow.kind === "preparing" && !flow.submitting) ? { kind: "seated" } : flow;
      if (flow.kind === "seated" || (flow.kind === "quitting" && !flow.busy)) return WATCHING;
      return flow;
  }
}
