// The tours as data (docs/specs/revamp/65-guidance.md, section 3), and the time each
// step needs. A tour is a list of steps; each step points at the first visible element
// of its `targets` (CSS selectors, most often a data-coach attribute), and says how it
// moves on: a "look" step by Next (and, in a timed phase, when its reading time is
// over), a "do" step when the player taps something or a screen sends a signal.
//
// Timing (section 2b): reading one step takes 4 s plus 0.5 s per word. In a timed phase
// the steps shown in one occurrence of the phase must add up to at most the phase's real
// length minus 5 s. `pauseAfter` ends the part of a tour that one occurrence holds; the
// rest comes the next time the phase comes. The table below states the real lengths;
// tours.test.ts checks every timed part against them in both languages.
//
// Real phase lengths of the public arenas, in seconds (source: apps/server/src/public-kinds.ts,
// PUBLIC_RULES; a round is its turns times 0.9 s; nothing is imported from the server):
//
// | Phase           | practice              | tournament | Tour that runs in it    |
// |-----------------|-----------------------|------------|-------------------------|
// | Lobby           | 30 (3 once all ready) | 60         | lobby: steps 1-2, then 3-4 |
// | Round           | 54 (60 turns)         | 81         | round: steps 1-3        |
// | Break           | none                  | 20         | none                    |
// | Result          | 20                    | 30         | none (result tour is for arenas without a result clock) |
// (The monthly arena is a league with day-long rounds and no lobby, 77-monthly-league.md.)
//
// | Timed part          | Words (en / id) | Seconds (en / id) | Budget (shortest phase - 5) |
// |---------------------|-----------------|-------------------|-----------------------------|
// | lobby steps 1-2     | 15+13 / 14+13   | 22 / 21.5         | 30 - 5 = 25                 |
// | lobby steps 3-4     | 14+13 / 12+12   | 21.5 / 20         | 25                          |
// | round steps 1-3     | 15+12+8 / 14+9+7| 29.5 / 27         | 54 - 5 = 49                 |
// | practice result     | no step         | the two result steps need more than 20 - 5 = 15 s | 15 |

import type { StepKey } from "./messages.ts";

export type TourId = "workshop" | "lobby" | "round" | "result" | "home";

/** Events a screen sends to a running tour, for "do" steps that no tap shows. */
export type GuideSignal = "styleStarted" | "ruleChanged" | "styleNamed";

export type StepDone =
  /** Next, or the reading time in a timed phase. */
  | { readonly kind: "look" }
  /** The player taps an element that matches the selector (the target, or one like it). */
  | { readonly kind: "tap"; readonly selector: string }
  | { readonly kind: "signal"; readonly signal: GuideSignal };

export interface TourStep {
  readonly key: StepKey;
  /** Selectors, in order; the step points at the first one that is visible. */
  readonly targets: readonly string[];
  readonly done: StepDone;
  /** Where the "where to go" pill sits while the target is missing: next to the first visible one of these. */
  readonly way?: readonly string[];
  /** In a timed phase, the tour stops after this step until the next occurrence of the phase. */
  readonly pauseAfter?: true;
  /** The callout goes into the screen's `data-coach-dock` slot even when it would fit beside the target. */
  readonly dock?: true;
}

/** Real phase lengths in seconds (see the table above). */
export const PUBLIC_PHASE_SECONDS = {
  practice: { lobby: 30, round: 54, result: 20 },
  tournament: { lobby: 60, round: 81, break: 20, result: 30 },
} as const;

/** The margin a timed phase keeps free after the last step (section 2b). */
export const PHASE_MARGIN_SECONDS = 5;

const look: StepDone = { kind: "look" };
const bottomTab = (value: string) => `[data-shell-bottom] [data-tab="${value}"]`;

/** Words of a sentence: what a child reads. */
export function wordCount(text: string): number {
  return text.split(/\s+/).filter((word) => word !== "").length;
}

/** Seconds a child needs to read a step: 4 s plus 0.5 s per word. */
export function readingSeconds(text: string): number {
  return 4 + 0.5 * wordCount(text);
}

const WORKSHOP: readonly TourStep[] = [
  { key: "workshopNew", targets: ['[data-coach="workshop-new"]'], done: { kind: "tap", selector: "[data-workshop-new]" } },
  { key: "workshopStart", targets: ['[data-coach="start-from"]'], done: { kind: "signal", signal: "styleStarted" }, way: ['[data-coach="workshop-new"]'] },
  // The editor opens on Rules (71-workshop-appeal.md C1), so the list is there at once: the step names it and asks for a tap.
  { key: "workshopAlgorithm", targets: ['[data-pager-item] [data-rule-open]'], done: { kind: "tap", selector: "[data-rule-open]" }, way: [bottomTab("rules")] },
  { key: "workshopWhenDo", targets: ['[data-coach="rule-sections"]'], done: look, way: [bottomTab("rules")] },
  // The rule's When, Do and More switch; inside one condition, the whole condition editor (its picker and a number's
  // minus and plus), because a callout never covers its target, so it never covers the control the child must use.
  { key: "workshopChange", targets: ['[data-coach="rule-sections"]', '[data-coach="condition-edit"]'], done: { kind: "signal", signal: "ruleChanged" }, way: [bottomTab("rules")] },
  // The tray of upgrade points: every built-in style opens with all 6 placed, so the step says where they are.
  { key: "workshopUpgrades", targets: ["[data-upgrade-tray]"], done: look, way: [bottomTab("upgrades")] },
  { key: "workshopRun", targets: ["[data-test-run]"], done: { kind: "tap", selector: "[data-test-run]" }, way: [bottomTab("try")] },
  // Last, the result sentence (the page's first item): on a small phone the sheet's title is for screen readers only (82-fit-fixes.md).
  { key: "workshopResult", targets: ['[data-pager-item] [data-coach="did-most"]', '[data-pager-item] [data-coach="did-most-heading"]', "[data-test-result] [data-pager-item]"], done: look, way: ["[data-test-show-result]", bottomTab("try")] },
  { key: "workshopName", targets: ['[data-coach="style-name"]'], done: { kind: "signal", signal: "styleNamed" } },
  { key: "workshopSaved", targets: ['[data-coach="style-saved"]'], done: look },
];

export type LobbyStart = "public" | "owner" | "guest";

/**
 * The lobby tour. A public lobby is timed: steps 1 and 2 in one lobby, 3 and 4 in the next,
 * which comes after the first game, so step 3 says how to do better.
 */
function lobbySteps(start: LobbyStart): readonly TourStep[] {
  const prep = '[data-prep-pane] [data-tab="style"]';
  return [
    { key: "lobbyTank", targets: ["[data-mytank-entry]"], done: look },
    { key: "lobbyPlays", targets: [prep], done: look, way: [bottomTab("tank")], pauseAfter: true },
    { key: start === "public" ? "lobbyStyleBetter" : "lobbyStyleFirst", targets: ['[data-coach="style-source"]'], done: look, way: [prep, bottomTab("tank")] },
    start === "public"
      ? { key: "lobbyStartPublic", targets: ["[data-ready-bar]"], done: look }
      : start === "owner"
        ? { key: "lobbyStartOwner", targets: ["[data-start-bar]"], done: look }
        : { key: "lobbyStartGuest", targets: ["[data-status-line]"], done: look },
  ];
}

/** Built once per variant, so a screen gets the same step objects on every render. */
const LOBBY: Readonly<Record<LobbyStart, readonly TourStep[]>> = { public: lobbySteps("public"), owner: lobbySteps("owner"), guest: lobbySteps("guest") };

const ROUND: readonly TourStep[] = [
  { key: "roundHit", targets: ['[data-coach="own-status"]'], done: look, way: [bottomTab("arena")] },
  { key: "roundWater", targets: ['[data-coach="own-status"]'], done: look, way: [bottomTab("arena")] },
  // A phone has the Ranking tab; a laptop shows the ranking beside the board and has no tab bar in a round.
  { key: "roundRanking", targets: [bottomTab("ranking"), '[data-room-pane="ranking"] [data-ranking-pane]'], done: look },
];

const RESULT: readonly TourStep[] = [
  { key: "resultPlace", targets: ["[data-result-pane] h2"], done: look, way: [bottomTab("result")] },
  { key: "resultBetter", targets: [bottomTab("tank")], done: look },
];

// On a laptop the cue sits under the page's sentence (the home page's dock), so it hides no way in. On a phone it
// floats under the two main tiles, because the page marks the name, its sentence and the tiles data-coach-keep-clear.
const HOME: readonly TourStep[] = [{ key: "homeCue", targets: ['[data-coach="home-workshop"]'], done: look, dock: true }];

/**
 * Tours whose screen shows the progress itself, so their callout has no step counter: the
 * workshop's checklist ("3 of 5") already counts, and the test match shows its turn ("4 of
 * 80"), so a third count on one screen was one too many (73-after-first-timer-test.md, row 9).
 */
export const PROGRESS_ON_SCREEN: ReadonlySet<TourId> = new Set<TourId>(["workshop"]);

/** Every tour has a fixed number of steps, whatever its variant, so a stored step stays valid. */
export const TOUR_LENGTHS: Readonly<Record<TourId, number>> = { workshop: WORKSHOP.length, lobby: LOBBY.guest.length, round: ROUND.length, result: RESULT.length, home: HOME.length };

export type TourVariant = { readonly lobbyStart: LobbyStart };

export function tourSteps(id: TourId, variant: TourVariant = { lobbyStart: "guest" }): readonly TourStep[] {
  switch (id) {
    case "workshop":
      return WORKSHOP;
    case "lobby":
      return LOBBY[variant.lobbyStart];
    case "round":
      return ROUND;
    case "result":
      return RESULT;
    case "home":
      return HOME;
  }
}

/** The parts of a tour that one occurrence of a timed phase shows: the step lists between `pauseAfter` marks. */
export function timedParts(steps: readonly TourStep[]): readonly (readonly TourStep[])[] {
  const parts: TourStep[][] = [[]];
  for (const step of steps) {
    parts[parts.length - 1]?.push(step);
    if (step.pauseAfter === true) parts.push([]);
  }
  return parts.filter((part) => part.length > 0);
}
