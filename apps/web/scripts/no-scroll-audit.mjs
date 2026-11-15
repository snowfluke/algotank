// The no-scroll audit: the acceptance test of docs/specs/revamp/60-no-scroll.md.
//
//   cd apps/web && bun run audit -- <base-url> <output-folder> [screen or screen/state, ...]
//
// It imports @playwright/test, a dev dependency of apps/web; the variable PLAYWRIGHT=/path/to/@playwright/test/index.mjs
// imports another installation instead.
//
// It drives the built client served by the Bun server (start it with TRUST_PROXY=1, see
// README.md). It creates what each state needs over HTTP (accounts, arenas, players,
// rounds), opens every screen state of the spec's table in English and Indonesian, and
// checks it at every supported size. A state fails when:
//   (a) the document is taller or wider than the viewport;
//   (b) an element scrolls inside itself (scrollable overflow and more content than room);
//   (c) a visible text or control is cut off by an ancestor that hides overflow, or by the
//       viewport.
// The "fallback" size (a phone held sideways) checks only (c) and horizontal overflow, because
// the page may scroll there. The "sweep" moves the width from 360 to 1280 px at a height of
// 800 for the simple screens and fails on horizontal overflow.
// (d) The overlap rule (65-guidance.md, 5b): for every visible, enabled button, link and input
//     inside the viewport, the element at its centre point is the control itself, one of its
//     descendants, or its label. A control under an open modal dialog is exempt. A tour's
//     callout or pill may cover a control for its one step (70-fixes-after-guidance.md, fix 8),
//     except a control in the bottom bar; rule (e) checks the rest of that rule.
// (e) A tour state (`tour`): the coach mark's callout (or its "where to go" pill) shows, the
//     callout does not cover its target's ring, and neither meets a KEEP_CLEAR box: the bottom
//     bar with its tabs, a room's countdown clock, what a screen marks to keep in view, or the
//     player's own tank on a room's board with its "You" label (the same list as ui/CoachMark.tsx). Every other state starts with every tour marked finished,
//     so no coach mark shows.
// (f) A state with `inView` (the chat with the phone's keyboard open, 72-arena-chat.md): the last visible
//     element of each selector lies inside the viewport, so the input and the newest line both show.
// It writes one screenshot per state, language and size, results.json and results.md, prints
// the results table, and exits with 1 when anything failed.
//
// Hooks the screens provide (language-neutral, so one step works in both languages): tabs
// carry data-tab="<value>" (ui/Tabs.tsx, ui/BottomTabs.tsx); the other hooks are named in the
// state table below and listed in docs/specs/revamp/11-foundation-guide.md, section 11.
// Exempt from (b) and (c): a textarea's own text and Pager's invisible measuring layer. No
// other part of the interface may scroll inside itself.

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

/** The supported sizes. `kind` "fit" must not scroll; "fallback" may scroll vertically. `pages` "app" is every page, "screen" adds the big screen. */
export const SIZES = [
  { name: "360x640", width: 360, height: 640, kind: "fit", pages: "app", standsFor: "small phone" },
  { name: "390x844", width: 390, height: 844, kind: "fit", pages: "app", standsFor: "phone" },
  { name: "430x932", width: 430, height: 932, kind: "fit", pages: "app", standsFor: "large phone" },
  { name: "768x1024", width: 768, height: 1024, kind: "fit", pages: "app", standsFor: "tablet, upright" },
  { name: "1000x600", width: 1000, height: 600, kind: "fit", pages: "app", standsFor: "small laptop window (the owner's)" },
  { name: "1280x720", width: 1280, height: 720, kind: "fit", pages: "app", standsFor: "laptop" },
  { name: "1920x1080", width: 1920, height: 1080, kind: "fit", pages: "screen", standsFor: "big screen page only" },
  { name: "844x390", width: 844, height: 390, kind: "fallback", pages: "app", standsFor: "phone held sideways (fallback)" },
  // Only for the states that name it: a phone whose keyboard takes half the height, below the fixed-height layout.
  { name: "390x450", width: 390, height: 450, kind: "fallback", pages: "keyboard", standsFor: "phone with the keyboard open" },
  // Only for the states that name it: the owner's laptop, where the result page and the round history are judged (75-organiser-tournament.md).
  { name: "1728x1000", width: 1728, height: 1000, kind: "fit", pages: "owner", standsFor: "the owner's laptop" },
];

/** The in-between widths checked for horizontal overflow on the simple screens, at a height of 800. */
export const SWEEP = { from: 360, to: 1280, step: 80, height: 800 };

export const LANGUAGES = ["en", "id"];

/** Sizes a state is checked at. The big screen page is checked from the laptop sizes up, and nothing else at 1920 x 1080. A tour state names its sizes. */
export function sizesFor(state) {
  if (state.sizes) return SIZES.filter((size) => state.sizes.includes(size.name));
  // The owner's laptop size (1728 x 1000) is for the states that name it, the big screen's included.
  if (state.bigScreen) return SIZES.filter((size) => size.width >= 1000 && size.kind === "fit" && size.pages !== "owner");
  return SIZES.filter((size) => size.pages === "app");
}

// --- The screen states (the table in 60-no-scroll.md, plus 61-workshop.md) ------------
//
// `fixture` names the arena or account the state needs (built once, below). `as` is who
// looks: "visitor" (nobody), "owner" (the account's cookie, and its player seat when the
// owner plays), "player" (a joined player, no account), "creator" (an account with no
// arena). `steps` run after the page loads: { click }, { fill, value } (value may be a function
// of the fixtures), { wait }, { press }, { ownerFetch: (fixtures) => ({ path, method, body }) } (a request
// with the page's session, such as the owner's scheduled start), { pageToEnd } (Next of a Pager until its last page), and { route, status, body } (answers that request with a
// failure from then on, to show an error state).
// `mock` lists { route, status, body } answers set before the page loads, for data the page reads
// as it opens (the chooser's live lines, the champions). `returning` marks the device as one that
// finished a game before, so /play shows the chooser (publicplay/firstGame.ts).
// `sweep` adds the width sweep. `owner` is the work package that makes the state pass. `perSize`
// loads the page and runs the steps again at every size instead of resizing an open state.

const tab = (value) => ({ click: `[data-tab="${value}"]` });

/** Every tour of guide/tours.ts, finished: the state every screen state starts from. */
const ALL_TOURS_FINISHED = Object.fromEntries(["workshop", "lobby", "round", "result", "home"].map((id) => [id, { kind: "finished" }]));

/** What a tour's callout or pill never meets (rule e); the same selector as KEEP_CLEAR in ui/CoachMark.tsx. */
const KEEP_CLEAR = '[data-shell-bottom], [data-countdown-clock], [data-coach-keep-clear], [data-arena-pane] [data-self="true"], [data-arena-pane] [data-you-marker]';

// --- Fixed answers for the public arenas' states ------------------------------------------

const AUDIT_LOOK = (i) => ({ colour: (i % 12) + 1, skin: ["dots", "stripes", "stars", "waves"][i % 4], second: ((i + 5) % 12) + 1, plate: i % 3 === 0 ? null : ((i + 2) % 12) + 1, icon: ["star", "fish", null, "rocket"][i % 4] });
/** Names of the league rows; the second is as long as the name rule allows. */
const AUDIT_NAMES = ["Bima", "Bartholomew Kusu", "Citra", "Dewi", "Eko", "Fajar", "Gita", "Hana", "Irfan", "Joko"];
const leagueRow = (rank) => ({ rank, name: rank <= AUDIT_NAMES.length ? AUDIT_NAMES[rank - 1] : `${AUDIT_NAMES[rank % AUDIT_NAMES.length].slice(0, 11)} ${rank}`, look: AUDIT_LOOK(rank), score: Math.max(0, 640 - rank * 6), games: 20, wins: Math.max(0, 9 - rank) });
const winners = (n) => Array.from({ length: n }, (_, i) => ({ name: leagueRow(i + 1).name, look: AUDIT_LOOK(i + 3), wonAt: new Date(Date.UTC(2026, 10, 12 - i, 10)).toISOString(), tanks: 16 + (i % 3) * 8 }));

/** GET /api/public with the tournament in its lobby or running. */
function publicStatusMocks(tournament) {
  const status = {
    practice: { humans: 3 },
    tournament: tournament === "lobby" ? { phase: "lobby", humans: 6, startsInMs: 42_000, round: null, recentWinners: winners(2) } : { phase: "running", humans: 40, startsInMs: null, round: 2, recentWinners: winners(2) },
    monthly: { month: "2026-11", tanks: 120, leagues: 8, lastChampion: null },
  };
  return [
    { route: "**/api/public", status: 200, body: status },
  ];
}

/** /champions with `rows` rows this month (the visitor's own row is rank 57 when `withYou`), past months and winners when rows > 0. */
function championsMocks(rows, withYou) {
  const all = Array.from({ length: rows }, (_, i) => (withYou && i + 1 === 57 ? { ...leagueRow(57), name: "Ayu" } : leagueRow(i + 1)));
  const months = rows === 0 ? [] : ["2026-10", "2026-09", "2026-08", "2026-07"].map((month, k) => ({ month, champion: leagueRow(k + 1), top: [leagueRow(k + 1), leagueRow(k + 2), leagueRow(k + 3)] }));
  return [
    { route: "**/api/champions", status: 200, body: { months, tournamentWinners: rows === 0 ? [] : winners(30) } },
    {
      // League 1's ranking of the month (monthly league, 77-monthly-league.md). M2 brings the visitor's own row back.
      route: "**/api/monthly/leagues/1/ranking",
      status: 200,
      body: { league: 1, month: "2026-11", day: "2026-11-14", today: [], thisMonth: all.map((row, i) => ({ rank: i < 10 ? i + 1 : null, seatId: `s${i}`, name: row.name, look: row.look, score: row.score, countedDays: row.games })) },
    },
  ];
}


export const STATES = [
  // S0: the simple screens.
  { screen: "home", state: "default", owner: "S0", path: () => "/", as: "visitor", sweep: true },
  // F1 (82-fit-fixes.md): the monthly tile with tanks playing (120 of them), so the compact form's one-line live line is measured.
  { screen: "home", state: "monthly-playing", owner: "F1", path: () => "/", as: "visitor", mock: publicStatusMocks("running"), steps: [{ wait: "[data-entry-live]" }] },
  { screen: "join", state: "default", owner: "S0", path: () => "/join", as: "visitor", sweep: true },
  { screen: "join", state: "empty-error", owner: "S0", path: () => "/join", as: "visitor", steps: [{ click: "form button[type=submit]" }, { wait: "[aria-invalid=true]" }] },
  {
    screen: "join",
    state: "not-found",
    owner: "S0",
    path: () => "/join",
    as: "visitor",
    steps: [{ fill: "form input", value: "ZZZZZZ" }, { click: "form button[type=submit]" }, { wait: "[aria-invalid=true]" }],
  },
  { screen: "sign-in", state: "sign-in", owner: "S0", path: () => "/sign-in", as: "visitor", sweep: true },
  { screen: "sign-in", state: "sign-in-error", owner: "S0", path: () => "/sign-in", as: "visitor", steps: [{ click: "form button[type=submit]" }, { wait: "[aria-invalid=true]" }] },
  {
    screen: "sign-in",
    state: "wrong-password",
    owner: "S0",
    path: () => "/sign-in",
    as: "visitor",
    steps: [{ fill: "input[type=email]", value: "nobody-here@example.com" }, { fill: "input[autocomplete=current-password]", value: "not-the-password-1" }, { click: "form button[type=submit]" }, { wait: "[aria-invalid=true]" }],
  },
  {
    screen: "sign-in",
    state: "register-email-taken",
    owner: "S0",
    path: () => "/sign-in",
    as: "visitor",
    fixture: "creator",
    steps: [tab("register"), { fill: "input[type=email]", value: (f) => f.creator.email }, { fill: "input[autocomplete=new-password]", value: "splash-party-2027" }, { click: "form button[type=submit]" }, { wait: "[aria-invalid=true]" }],
  },
  {
    screen: "sign-in",
    state: "register-form-error",
    owner: "S0",
    path: () => "/sign-in",
    as: "visitor",
    steps: [
      tab("register"),
      { route: "**/api/auth/register", status: 429, body: { error: "Too many accounts from this address.", code: "rate_limited", retryAfterSeconds: 3000 } },
      { fill: "input[type=email]", value: "someone@example.com" },
      { fill: "input[autocomplete=new-password]", value: "splash-party-2027" },
      { click: "form button[type=submit]" },
      { wait: "form [role=alert]" },
    ],
  },
  { screen: "sign-in", state: "register", owner: "S0", path: () => "/sign-in", as: "visitor", steps: [tab("register")] },
  {
    screen: "sign-in",
    state: "register-error",
    owner: "S0",
    path: () => "/sign-in",
    as: "visitor",
    steps: [tab("register"), { fill: "input[type=email]", value: "someone@example.com" }, { click: "form button[type=submit]" }, { wait: "[aria-invalid=true]" }],
  },
  { screen: "play", state: "default", owner: "S0", path: () => "/play", as: "visitor", sweep: true },
  { screen: "play", state: "mytank", owner: "T1", path: () => "/play", as: "visitor", steps: [{ click: '[data-opens="mytank"]' }, { wait: "[data-step-sheet]" }] },
  // T1: the "My tank" editor on each part, the second page of the icons, and a name that breaks the rule.
  ...["colour", "skin", "second", "plate", "icon", "name"].map((part) => ({
    screen: "mytank",
    state: part,
    owner: "T1",
    path: () => "/my-tank",
    as: "visitor",
    perSize: true,
    sweep: part === "colour",
    steps: [{ click: `[data-tank-part="${part}"]` }, { wait: `[data-tank-part-panel="${part}"]` }],
  })),
  {
    screen: "mytank",
    state: "icon-page-2",
    owner: "T1",
    path: () => "/my-tank",
    as: "visitor",
    perSize: true,
    steps: [{ click: '[data-tank-part="icon"]' }, { wait: '[data-tank-part-panel="icon"]' }, { pageToEnd: "[data-choice-pages] [data-pager-next]" }],
  },
  {
    screen: "mytank",
    state: "name-error",
    owner: "T1",
    path: () => "/my-tank",
    as: "visitor",
    perSize: true,
    steps: [{ click: '[data-tank-part="name"]' }, { fill: "[data-tank-part-panel] input", value: "A!" }, { click: "[data-mytank-done]" }, { wait: "[aria-invalid=true]" }],
  },
  {
    screen: "play",
    state: "seat-error",
    owner: "S0",
    path: () => "/play",
    as: "visitor",
    steps: [{ route: "**/api/public/seat", status: 503, body: { error: "Every public arena is full.", code: "public_full" } }, { click: "form button[type=submit]" }, { wait: "[role=alert]" }],
  },
  { screen: "create-private", state: "signed-out", owner: "S0", path: () => "/new/private", as: "visitor", sweep: true },
  { screen: "create-private", state: "signed-out-register", owner: "S0", path: () => "/new/private", as: "visitor", steps: [tab("register")] },
  {
    screen: "create-private",
    state: "signed-out-register-error",
    owner: "S0",
    path: () => "/new/private",
    as: "visitor",
    steps: [tab("register"), { fill: "input[type=email]", value: "someone@example.com" }, { click: "form button[type=submit]" }, { wait: "[aria-invalid=true]" }],
  },
  { screen: "create-private", state: "form", owner: "S0", path: () => "/new/private", as: "creator", steps: [{ wait: "[data-create-form]" }], sweep: true },
  {
    screen: "create-private",
    state: "name-error",
    owner: "S0",
    path: () => "/new/private",
    as: "creator",
    steps: [{ wait: "[data-create-form]" }, { fill: "[data-create-form] input", value: "" }, { click: "[data-create-form] button[type=submit]" }, { wait: "[aria-invalid=true]" }],
  },
  { screen: "create-private", state: "options", owner: "S0", path: () => "/new/private", as: "creator", steps: [{ click: "[data-create-options]" }, { wait: "[data-step-sheet]" }] },
  {
    screen: "create-private",
    state: "option-rules",
    owner: "S0",
    path: () => "/new/private",
    as: "creator",
    steps: [{ click: "[data-create-options]" }, { click: '[data-create-option="ruleSetMode"]' }, { wait: "[data-step-sheet]" }],
  },
  { screen: "create-private", state: "limit", owner: "S0", path: () => "/new/private", as: "owner", fixture: "privateLobby", steps: [{ wait: "[data-limit-banner]" }] },
  {
    screen: "create-private",
    state: "limit-dialog",
    owner: "S0",
    path: () => "/new/private",
    as: "owner",
    fixture: "privateLobby",
    steps: [{ click: "[data-limit-close]" }, { wait: "dialog[open]" }],
  },
  { screen: "create-presenter", state: "form", owner: "S0", path: () => "/new/presenter", as: "creator", steps: [{ wait: "[data-create-form]" }], sweep: true },
  { screen: "create-presenter", state: "options", owner: "S0", path: () => "/new/presenter", as: "creator", steps: [{ click: "[data-create-options]" }, { wait: "[data-step-sheet]" }] },
  { screen: "not-found", state: "default", owner: "S0", path: () => "/no-such-page", as: "visitor", sweep: true },
  // The layout system itself, in a real AppShell: a paged ranking with the viewer's row kept, a carousel, a step sheet.
  { screen: "layout-demo", state: "pager", owner: "S0", path: () => "/kit?show=layout", as: "visitor", sweep: true },
  { screen: "layout-demo", state: "pager-page-2", owner: "S0", path: () => "/kit?show=layout", as: "visitor", steps: [{ click: "[data-pager-next]" }] },
  { screen: "layout-demo", state: "carousel", owner: "S0", path: () => "/kit?show=layout", as: "visitor", steps: [tab("tank"), { click: "[data-carousel-next]" }] },
  { screen: "layout-demo", state: "step-sheet", owner: "S0", path: () => "/kit?show=layout", as: "visitor", steps: [tab("invite"), { click: "[data-tab-panel] button" }, { wait: "[data-step-sheet]" }] },

  // S1a: the room frame and the presenter page.
  { screen: "room", state: "not-joined", owner: "S1a", path: (f) => `/a/${f.privateLobby.id}`, as: "visitor", fixture: "privateLobby" },
  ...["tank", "players", "invite"].flatMap((value) =>
    ["owner", "player"].map((as) => ({
      screen: "room",
      state: `lobby-${as}-${value}`,
      owner: "S1a",
      path: (f) => `/a/${f.privateLobby.id}`,
      as,
      fixture: "privateLobby",
      // The owner's Players tab waits for "Remove from arena" (T1), which comes with the player list.
      steps: value === "tank" ? [] : as === "owner" && value === "players" ? [tab(value), { wait: "[data-remove-player]:visible" }] : [tab(value)],
    })),
  ),
  { screen: "room", state: "running-owner-arena", owner: "S1a+S2", path: (f) => `/a/${f.privateRunning.id}`, as: "owner", fixture: "privateRunning" },
  ...["arena", "ranking", "mytank"].map((value) => ({
    screen: "room",
    state: `running-player-${value}`,
    owner: "S1a+S2",
    path: (f) => `/a/${f.privateRunning.id}`,
    as: "player",
    fixture: "privateRunning",
    steps: value === "arena" ? [] : [tab(value)],
  })),
  ...["break", "finished"].flatMap((phase) => {
    const fixture = phase === "break" ? "privateBreak" : "privateFinished";
    return [
      { screen: "room", state: `${phase}-owner-result`, owner: "S1a+S2", path: (f) => `/a/${f[fixture].id}`, as: "owner", fixture },
      // An owner's finished game shows its round history where the break shows the ranking (75-organiser-tournament.md).
      ...["result", phase === "finished" ? "history" : "ranking", "tank"].map((value) => ({
        screen: "room",
        state: `${phase}-player-${value}`,
        owner: "S1a+S2",
        path: (f) => `/a/${f[fixture].id}`,
        as: "player",
        fixture,
        steps: value === "result" ? [] : [tab(value)],
      })),
    ];
  }),
  ...["Lobby", "Running", "Break", "Finished"].flatMap((phase) => [
    { screen: "presenter", state: phase.toLowerCase(), owner: "S1a", path: (f) => `/a/${f[`presenter${phase}`].id}/host`, as: "owner", fixture: `presenter${phase}` },
    { screen: "big-screen", state: phase.toLowerCase(), owner: "S2", path: (f) => `/a/${f[`presenter${phase}`].id}/screen`, as: "visitor", fixture: `presenter${phase}`, bigScreen: true },
  ]),
  // S1a: the room's dialog and step sheets, and the lists at the arenas' capacity (paging).
  // "How the game works" no longer opens by itself (the lobby tour replaced that, G1): the help button opens it.
  { screen: "room", state: "lobby-how-it-works", owner: "S1a", path: (f) => `/a/${f.privateLobby.id}`, as: "player", fixture: "privateLobby", steps: [{ click: "[data-how-it-works-open]" }, { wait: "dialog[open]" }] },
  {
    screen: "room",
    state: "lobby-how-it-works-last",
    owner: "S1a",
    path: (f) => `/a/${f.privateLobby.id}`,
    as: "player",
    fixture: "privateLobby",
    // Six steps (84-items.md added the items): five clicks reach the last one.
    steps: [{ click: "[data-how-it-works-open]" }, { wait: "dialog[open]" }, { click: "[data-how-it-works-next]" }, { click: "[data-how-it-works-next]" }, { click: "[data-how-it-works-next]" }, { click: "[data-how-it-works-next]" }, { click: "[data-how-it-works-next]" }, { wait: "[data-how-it-works-done]" }],
  },
  {
    screen: "room",
    state: "lobby-how-it-works-items",
    owner: "S1a",
    path: (f) => `/a/${f.privateLobby.id}`,
    as: "player",
    fixture: "privateLobby",
    // The fifth step, the four items with their sentence (84-items.md).
    steps: [{ click: "[data-how-it-works-open]" }, { wait: "dialog[open]" }, { click: "[data-how-it-works-next]" }, { click: "[data-how-it-works-next]" }, { click: "[data-how-it-works-next]" }, { click: "[data-how-it-works-next]" }, { wait: "dialog[open]" }],
  },
  { screen: "room", state: "lobby-owner-settings", owner: "S1a", path: (f) => `/a/${f.privateLobby.id}`, as: "owner", fixture: "privateLobby", steps: [{ click: '[data-opens="settings"]' }, { wait: "[data-step-sheet]" }] },
  {
    screen: "room",
    state: "lobby-player-look",
    owner: "T1",
    path: (f) => `/a/${f.privateLobby.id}`,
    as: "player",
    fixture: "privateLobby",
    steps: [tab("players"), { click: '[data-opens="look"]' }, { wait: "[data-step-sheet]" }],
  },
  { screen: "room", state: "lobby-owner-look", owner: "T1", path: (f) => `/a/${f.privateLobby.id}`, as: "owner", fixture: "privateLobby", steps: [tab("players"), { click: '[data-opens="look"]' }, { wait: "[data-step-sheet]" }] },
  {
    screen: "room",
    state: "not-joined-blocked-name",
    owner: "T1",
    path: (f) => `/a/${f.privateLobby.id}`,
    as: "visitor",
    fixture: "privateLobby",
    steps: [
      { route: "**/api/arenas/*/players", status: 400, body: { error: "blocked", code: "name_blocked", suggestion: "Jolly Penguin" } },
      { fill: "[data-join-form] input", value: "Kaptenair" },
      { click: "[data-join-form] button[type=submit]" },
      { wait: "[aria-invalid=true]" },
    ],
  },
  { screen: "room", state: "not-joined-mytank", owner: "T1", path: (f) => `/a/${f.privateLobby.id}`, as: "visitor", fixture: "privateLobby", steps: [{ click: '[data-opens="mytank"]' }, { wait: "[data-step-sheet]" }] },
  { screen: "room", state: "lobby-full-players", owner: "S1a", path: (f) => `/a/${f.privateFull.id}`, as: "player", fixture: "privateFull", steps: [tab("players")] },
  // The owner's Tank tab has the smallest box (the start action sits above the tabs).
  ...["break", "finished"].map((phase) => {
    const fixture = phase === "break" ? "privateBreak" : "privateFinished";
    return { screen: "room", state: `${phase}-owner-tank`, owner: "S1a+S1b", path: (f) => `/a/${f[fixture].id}`, as: "owner", fixture, steps: [tab("tank")] };
  }),
  { screen: "room", state: "break-owner-settings", owner: "S1a", path: (f) => `/a/${f.privateBreak.id}`, as: "owner", fixture: "privateBreak", steps: [{ click: '[data-opens="settings"]' }, { wait: "[data-step-sheet]" }] },
  {
    screen: "room",
    state: "not-joined-name-error",
    owner: "S1a",
    path: (f) => `/a/${f.privateLobby.id}`,
    as: "visitor",
    fixture: "privateLobby",
    steps: [
      // An empty name is allowed (the game gives one), so a name that breaks the rule shows the error.
      { fill: "form input", value: "A!" }, { click: "form button[type=submit]" }, { wait: "[aria-invalid=true]" }],
  },
  ...["players", "screen"].map((value) => ({ screen: "presenter", state: `lobby-${value}`, owner: "S1a", path: (f) => `/a/${f.presenterLobby.id}/host`, as: "owner", fixture: "presenterLobby", steps: [tab(value)] })),
  { screen: "presenter", state: "lobby-full-players", owner: "S1a", path: (f) => `/a/${f.presenterFull.id}/host`, as: "owner", fixture: "presenterFull", steps: [tab("players")] },
  { screen: "presenter", state: "lobby-settings", owner: "S1a", path: (f) => `/a/${f.presenterLobby.id}/host`, as: "owner", fixture: "presenterLobby", steps: [{ click: '[data-opens="settings"]' }, { wait: "[data-step-sheet]" }] },

  // L2: a presenter arena of 512 players joined over HTTP (63-large-arenas.md): the follow window and the whole
  // arena, the paged lists with the cut line, the presenter page and the big screen.
  { screen: "room", state: "lobby-512-players", owner: "L2", path: (f) => `/a/${f.presenterFull.id}`, as: "player", fixture: "presenterFull", steps: [tab("players")] },
  ...[
    ["running-512-arena", []],
    ["running-512-whole", [{ click: '[data-camera-switch] label:has(input[value="whole"])' }, { wait: '[data-camera="whole"]' }]],
    ["running-512-ranking", [tab("ranking")]],
    ["running-512-ranking-cut", [tab("ranking"), { click: "[data-pager-jump]" }]],
    ["running-512-mytank", [tab("mytank")]],
  ].map(([state, steps]) => ({ screen: "room", state, owner: "L2", path: (f) => `/a/${f.presenterRunning512.id}`, as: "player", fixture: "presenterRunning512", steps })),
  ...[
    ["break-512-result", []],
    ["break-512-ranking", [tab("ranking")]],
    ["break-512-ranking-cut", [tab("ranking"), { click: "[data-pager-jump]" }]],
  ].map(([state, steps]) => ({ screen: "room", state, owner: "L2", path: (f) => `/a/${f.presenterBreak512.id}`, as: "player", fixture: "presenterBreak512", steps })),
  { screen: "presenter", state: "running-512", owner: "L2", path: (f) => `/a/${f.presenterRunning512.id}/host`, as: "owner", fixture: "presenterRunning512" },
  { screen: "presenter", state: "break-512", owner: "L2", path: (f) => `/a/${f.presenterBreak512.id}/host`, as: "owner", fixture: "presenterBreak512" },
  { screen: "big-screen", state: "lobby-512", owner: "L2", path: (f) => `/a/${f.presenterFull.id}/screen`, as: "visitor", fixture: "presenterFull", bigScreen: true },
  { screen: "big-screen", state: "running-512", owner: "L2", path: (f) => `/a/${f.presenterRunning512.id}/screen`, as: "visitor", fixture: "presenterRunning512", bigScreen: true },
  { screen: "big-screen", state: "break-512", owner: "L2", path: (f) => `/a/${f.presenterBreak512.id}/screen`, as: "visitor", fixture: "presenterBreak512", bigScreen: true },

  // S2: the watch panes and the test match in a room-like frame on /kit?show=board (board/PaneHarness.tsx),
  // so they are checked at every size before the room frame is rebuilt. Every choice is a URL parameter.
  ...[
    ["running-arena", "pane=running&players=16"],
    ["running-arena-8", "pane=running&players=8"],
    ["running-arena-64", "pane=running&players=64"],
    ["running-arena-spectator", "pane=running&players=16&viewer=none"],
    ["running-ranking", "pane=running&players=16&tab=ranking"],
    ["running-ranking-512", "pane=running&players=512&tab=ranking"],
    ["running-mytank", "pane=running&players=16&tab=mytank"],
    ["break-result", "pane=break&players=16&status=playing"],
    ["break-result-out", "pane=break&players=16&status=out"],
    ["break-result-waiting", "pane=break&players=16&status=waiting"],
    ["break-ranking", "pane=break&players=64&status=out&tab=ranking"],
    ["finished-result-won", "pane=finished&players=8&status=won"],
    ["finished-result-lost", "pane=finished&players=8&status=lost"],
    ["finished-ranking", "pane=finished&players=8&status=lost&tab=ranking"],
    ["test-start", "pane=test"],
  ].map(([state, query]) => ({ screen: "panes", state, owner: "S2", path: () => `/kit?show=board&${query}`, as: "visitor" })),
  {
    screen: "panes",
    state: "running-ranking-512-page-2",
    owner: "S2",
    path: () => "/kit?show=board&pane=running&players=512&tab=ranking",
    as: "visitor",
    steps: [{ click: "[data-pager-next]" }],
  },
  // The player's legend in a real room, with "Show me around" (fix 9 of 70-fixes-after-guidance.md).
  { screen: "room", state: "running-player-legend", owner: "F1", path: (f) => `/a/${f.privateRunning.id}`, as: "player", fixture: "privateRunning", perSize: true, steps: [{ click: "[data-legend-open]" }, { wait: "dialog[open]" }] },
  { screen: "panes", state: "running-legend", owner: "S2", path: () => "/kit?show=board&pane=running&players=16", as: "visitor", steps: [{ click: "[data-legend-open]" }, { wait: "dialog[open]" }] },
  // The items and their effects (84-items.md) are on the legend's later pages; how many pages there are depends on the height.
  { screen: "panes", state: "running-legend-page-2", owner: "S2", path: () => "/kit?show=board&pane=running&players=16", as: "visitor", steps: [{ click: "[data-legend-open]" }, { wait: "dialog[open]" }, { click: "dialog[open] [data-pager-next]" }] },
  { screen: "panes", state: "running-legend-page-3", owner: "S2", path: () => "/kit?show=board&pane=running&players=16", as: "visitor", steps: [{ click: "[data-legend-open]" }, { wait: "dialog[open]" }, { click: "dialog[open] [data-pager-next]" }, { click: "dialog[open] [data-pager-next]" }] },
  { screen: "panes", state: "test-match", owner: "S2", path: () => "/kit?show=board&pane=test", as: "visitor", steps: [{ click: "[data-test-run]" }, { wait: "[data-test-board]" }] },
  {
    screen: "panes",
    state: "test-result",
    owner: "S2",
    path: () => "/kit?show=board&pane=test",
    as: "visitor",
    steps: [{ click: "[data-test-run]" }, { click: "[data-test-show-result]" }, { wait: "[data-test-result]" }],
  },
  { screen: "panes", state: "test-options", owner: "S2", path: () => "/kit?show=board&pane=test", as: "visitor", steps: [{ click: "[data-test-options]" }, { wait: "[data-step-sheet]" }] },
  {
    screen: "panes",
    state: "test-options-picker",
    owner: "D1",
    perSize: true,
    path: () => "/kit?show=board&pane=test",
    as: "visitor",
    steps: [{ click: "[data-test-options]" }, { click: '[data-picker="bot-styles"]' }, { wait: "[data-picker-list]" }],
  },
  {
    screen: "panes",
    state: "test-rules",
    owner: "S2",
    path: () => "/kit?show=board&pane=test",
    as: "visitor",
    steps: [{ click: "[data-test-options]" }, { click: "[data-test-rules]" }, { wait: "[data-carousel-next]" }],
  },

  // S1b: the preparation pane (in the private lobby, as a player) and the workshop. Its tabs are
  // Play style, Rules, Upgrades and Try it (W2, 71-workshop-appeal.md C1).
  { screen: "prep", state: "style", owner: "S1b", path: (f) => `/a/${f.privateLobby.id}`, as: "player", fixture: "privateLobby", steps: [tab("style")] },
  { screen: "prep", state: "upgrades", owner: "W2", path: (f) => `/a/${f.privateLobby.id}`, as: "player", fixture: "privateLobby", steps: [tab("upgrades")] },
  { screen: "prep", state: "rules", owner: "W2", path: (f) => `/a/${f.privateLobby.id}`, as: "player", fixture: "privateLobby", steps: [tab("rules")] },
  {
    screen: "prep",
    state: "rule-open",
    owner: "S1b",
    path: (f) => `/a/${f.privateLobby.id}`,
    as: "player",
    fixture: "privateLobby",
    steps: [tab("rules"), { click: "[data-rule-open]" }, { wait: "[data-step-sheet]" }],
  },
  { screen: "prep", state: "try", owner: "S1b+S2", path: (f) => `/a/${f.privateLobby.id}`, as: "player", fixture: "privateLobby", steps: [tab("try")] },
  {
    screen: "prep",
    state: "test-match",
    owner: "S2",
    path: (f) => `/a/${f.privateLobby.id}`,
    as: "player",
    fixture: "privateLobby",
    steps: [tab("try"), { click: "[data-test-run]" }, { wait: "[data-test-board]" }],
  },
  {
    screen: "prep",
    state: "test-result",
    owner: "S2",
    path: (f) => `/a/${f.privateLobby.id}`,
    as: "player",
    fixture: "privateLobby",
    steps: [tab("try"), { click: "[data-test-run]" }, { click: "[data-test-show-result]" }, { wait: "[data-test-result]" }],
    // The room swaps its panes at the laptop width and unmounts the result, so it is reached again at every size.
    perSize: true,
  },
  // S1b: the same pane without a server, in a room-sized box ("/kit?show=prep"), across the whole
  // width and in the room's laptop middle column (22rem). "&strategy=stress" starts from 6 modes with
  // long names, 20 rules in the first mode and a rule with 4 conditions; "&strategy=ambusher" from a
  // play style with two modes (the mode strip, W2).
  ...[
    ["prep-kit", ""],
    ["prep-kit-column", "&column=narrow"],
    ["prep-kit-stress", "&strategy=stress"],
    ["prep-kit-modes", "&strategy=ambusher"],
  ].flatMap(([screen, query]) => {
    const base = { screen, owner: "S1b", path: () => `/kit?show=prep${query}`, as: "visitor" };
    const ready = { wait: '[data-tab="style"]' };
    const upgrades = [ready, tab("upgrades")];
    const rules = [ready, tab("rules")];
    const rule = [...rules, { click: "[data-rule-open]" }, { wait: "[data-step-sheet]" }];
    const condition = [...rule, { click: '[data-step-sheet] [data-pager-item] [data-focus-key^="condition:"]' }, { wait: '[data-step-sheet] input[type="checkbox"]' }];
    return [
      { ...base, state: "style", steps: [ready] },
      { ...base, owner: "W2", state: "upgrades", steps: upgrades },
      // The bench with 2 points free, all 6 free ("Take all out"), and a tap that needs more than lie free (W2).
      { ...base, owner: "W2", state: "upgrades-free-2", steps: [...upgrades, { click: '[data-upgrade-minus="aim"]' }, { click: '[data-upgrade-minus="aim"]' }] },
      { ...base, owner: "W2", state: "upgrades-free-6", steps: [...upgrades, { click: "[data-take-all-out]" }] },
      { ...base, owner: "W2", state: "upgrades-blocked", steps: [...upgrades, { click: '[data-upgrade-plus="reach"]' }] },
      { ...base, owner: "W2", state: "upgrades-help", steps: [...upgrades, { click: "[data-upgrade-help]" }, { wait: "[data-step-sheet]" }] },
      { ...base, owner: "W2", state: "rules", steps: rules, sweep: screen === "prep-kit" },
      { ...base, state: "rule-when", steps: rule },
      { ...base, state: "rule-do", steps: [...rule, { click: '[data-rule-section="do"]' }] },
      { ...base, state: "rule-more", steps: [...rule, { click: '[data-rule-section="more"]' }] },
      { ...base, state: "condition", steps: condition },
      // "If no rule fits" is the last item of the paged list: Next until the last page.
      { ...base, state: "fallback", steps: [...rules, { pageToEnd: "[data-pager-next]" }, { click: "[data-pager-item] [data-rule-fallback]" }, { wait: "[data-step-sheet]" }] },
      { ...base, state: "modes", steps: [...rules, { click: '[data-focus-key="modes"]' }, { wait: "[data-step-sheet]" }] },
      { ...base, state: "mode-options", steps: [...rules, { click: '[data-focus-key="modes"]' }, { click: '[data-pager-item] [data-focus-key^="mode-options:"]' }, { wait: '[data-step-sheet] input' }] },
      { ...base, state: "save-as", steps: [ready, tab("rules"), { click: "[data-save-as]" }, { wait: "[data-step-sheet]" }] },
      { ...base, state: "try", steps: [ready, tab("try")] },
      // D1: the game's own picker, open. Rows are chosen inside the visible listbox, because the
      // open list also holds invisible copies of its rows (the height spacer and Pager's layer).
      ...(screen === "prep-kit-stress"
        ? []
        : [
            { ...base, owner: "D1", state: "picker-short", perSize: true, steps: [...rule, { click: '[data-rule-section="do"]' }, ...pickAction(3, "turn"), { click: '[data-picker="param-way"]' }, { wait: "[data-picker-list]" }] },
            { ...base, owner: "D1", state: "picker-long", perSize: true, steps: [...rule, { click: '[data-rule-section="do"]' }, ...pickAction(1, "moveToward"), { click: '[data-picker="param-target"]' }, { wait: "[data-picker-list]" }] },
            { ...base, owner: "D1", state: "picker-groups", perSize: true, steps: [...condition, { click: '[data-picker="condition"]' }, { wait: "[data-picker-list]" }] },
            { ...base, owner: "D1", state: "picker-group", perSize: true, steps: [...condition, { click: '[data-picker="condition"]' }, { click: '[role="listbox"] [data-picker-group="1"]' }, { wait: '[role="listbox"] [data-picker-value]' }] },
          ]),
    ];
  }),
  // S3 (76-email-and-sequences.md): a first rule with 3 or 4 steps in order on its card, in the rule's
  // "Do" part, and running in the Try it replay, also at the owner's laptop size; and the switch from
  // one action to steps.
  ...[
    ["prep-kit-steps3", "&strategy=steps3"],
    ["prep-kit-steps4", "&strategy=steps4"],
  ].flatMap(([screen, query]) => {
    const base = { screen, owner: "S3", path: () => `/kit?show=prep${query}`, as: "visitor", sizes: SIZES.filter((s) => s.pages === "app" || s.name === "1728x1000").map((s) => s.name) };
    const ready = { wait: '[data-tab="style"]' };
    const rule = [ready, tab("rules"), { click: "[data-rule-open]" }, { wait: "[data-step-sheet]" }];
    return [
      { ...base, state: "rules", steps: [ready, tab("rules")] },
      { ...base, state: "rule-do-steps", steps: [...rule, { click: '[data-rule-section="do"]' }, { wait: "[data-steps-editor]" }] },
      // One step's own sheet: its kind, earlier, later and remove.
      { ...base, state: "step-sheet", steps: [...rule, { click: '[data-rule-section="do"]' }, { click: '[data-steps-editor] [data-step-block="1"]' }, { wait: "[data-step-choices]" }] },
      { ...base, state: "try-replay", steps: [ready, tab("try"), { click: "[data-test-run]" }, { wait: "[data-sequence-now]" }] },
    ];
  }),
  {
    screen: "prep-kit",
    state: "rule-do-to-steps",
    owner: "S3",
    path: () => "/kit?show=prep",
    as: "visitor",
    steps: [{ wait: '[data-tab="style"]' }, tab("rules"), { click: "[data-rule-open]" }, { wait: "[data-step-sheet]" }, { click: '[data-rule-section="do"]' }, { click: '[data-rule-do-kind="steps"]' }, { wait: "[data-steps-editor]" }],
  },
  // The tallest chrome above the pane: the next round's rules line, and a failed save with Retry.
  ...[
    ["prep-kit-rules", "&rules=known", []],
    // Secret round rules: the bench shows levels without numbers (W2).
    ["prep-kit-secret", "&rules=hidden", []],
    ["prep-kit-offline", "&server=offline", [{ click: "[data-carousel-next]" }, { click: "[data-carousel-slide] button" }, { wait: "p[role=status] span.text-hit" }]],
  ].flatMap(([screen, query, failSave]) => {
    const base = { screen, owner: "S1b", path: () => `/kit?show=prep${query}`, as: "visitor" };
    const ready = [{ wait: '[data-tab="style"]' }, ...failSave];
    return [
      { ...base, state: "style", steps: ready },
      { ...base, state: "upgrades", steps: [...ready, tab("upgrades")] },
      { ...base, state: "rules", steps: [...ready, tab("rules")] },
    ];
  }),
  { screen: "workshop", state: "empty", owner: "S1b", path: () => "/workshop", as: "visitor", steps: [{ wait: "[data-workshop-empty]" }], sweep: true },
  { screen: "workshop", state: "list-1", owner: "S1b", path: () => "/workshop", as: "visitor", seedWorkshop: 1, steps: [{ wait: "[data-workshop-list]" }], sweep: true },
  { screen: "workshop", state: "list-20", owner: "S1b", path: () => "/workshop", as: "visitor", seedWorkshop: 20, steps: [{ wait: "[data-workshop-list]" }] },
  { screen: "workshop", state: "list-20-page-2", owner: "S1b", path: () => "/workshop", as: "visitor", seedWorkshop: 20, steps: [{ wait: "[data-workshop-list]" }, { click: "[data-pager-next]" }] },
  { screen: "workshop", state: "rename", owner: "S1b", path: () => "/workshop", as: "visitor", seedWorkshop: 1, steps: [{ click: '[data-pager-item] [data-focus-key^="rename:"]' }, { wait: "[data-step-sheet] input" }] },
  { screen: "workshop", state: "start-from-full-list", owner: "S1b", path: () => "/workshop", as: "visitor", seedWorkshop: 3, steps: [{ click: "[data-workshop-new]" }, { wait: "[data-workshop-start-from]" }] },
  { screen: "workshop", state: "list-1-signed-in", owner: "S1b", path: () => "/workshop", as: "creator", seedWorkshop: 1, steps: [{ wait: "[data-workshop-list]" }] },
  { screen: "workshop", state: "start-from", owner: "S1b", path: () => "/workshop", as: "visitor", steps: [{ click: "[data-workshop-new]" }, { wait: "[data-workshop-start-from]" }] },
  ...["upgrades", "rules", "try"].map((pane) => ({
    screen: "workshop",
    state: `editor-${pane}`,
    owner: "S1b",
    path: () => "/workshop",
    as: "visitor",
    seedWorkshop: 1,
    steps: [{ click: "[data-workshop-open]" }, tab(pane)],
    sweep: pane === "rules",
  })),
  {
    screen: "workshop",
    state: "rule-open",
    owner: "S1b",
    path: () => "/workshop",
    as: "visitor",
    seedWorkshop: 1,
    steps: [{ click: "[data-workshop-open]" }, tab("rules"), { click: "[data-rule-open]" }, { wait: "[data-step-sheet]" }],
  },
  // The newest seeded style has a problem: the editor's save line and Try it say so.
  { screen: "workshop", state: "editor-problem", owner: "S1b", path: () => "/workshop", as: "visitor", seedWorkshop: 3, seedBroken: 0, steps: [{ click: "[data-workshop-open]" }, tab("try")] },
  // "Mine" in the arena's Play style tab, in the room-sized box of the harness and in the room itself.
  { screen: "prep-kit", state: "mine", owner: "S1b", path: () => "/kit?show=prep", as: "visitor", seedWorkshop: 20, steps: [{ wait: '[data-tab="style"]' }, { click: '[data-style-source="mine"]' }] },
  { screen: "prep", state: "mine", owner: "S1b", path: (f) => `/a/${f.privateLobby.id}`, as: "player", fixture: "privateLobby", seedWorkshop: 20, steps: [tab("style"), { click: '[data-style-source="mine"]' }] },
  { screen: "prep", state: "save-as", owner: "S1b", path: (f) => `/a/${f.privateLobby.id}`, as: "player", fixture: "privateLobby", steps: [tab("upgrades"), { click: "[data-save-as]" }, { wait: "[data-step-sheet]" }] },

  // P3b: the three public arenas (67-public-arenas.md). The chooser on /play for a device that finished a
  // game before (the first-timer's page is play/default above), with live lines from the server or from
  // a fixed answer; the rooms in the lobby and the result through the room harness (/kit?show=room),
  // because a real public lobby starts its game within 15 to 60 s; and /champions.
  { screen: "chooser", state: "default", owner: "P3b", path: () => "/play", as: "visitor", returning: true, sweep: true, steps: [{ wait: "[data-chooser]" }] },
  { screen: "chooser", state: "tournament-lobby", owner: "P3b", path: () => "/play", as: "creator", returning: true, mock: publicStatusMocks("lobby"), steps: [{ wait: "[data-chooser]" }] },
  { screen: "chooser", state: "tournament-running", owner: "P3b", path: () => "/play?arena=tournament", as: "creator", returning: true, mock: publicStatusMocks("running"), steps: [{ wait: "[data-chooser]" }] },
  { screen: "chooser", state: "mytank", owner: "P3b", path: () => "/play", as: "visitor", returning: true, steps: [{ click: '[data-opens="mytank"]' }, { wait: "[data-step-sheet]" }] },
  {
    screen: "chooser",
    state: "tournament-full",
    owner: "P3b",
    path: () => "/play?arena=tournament",
    as: "visitor",
    returning: true,
    mock: [...publicStatusMocks("running"), { route: "**/api/public/seat", status: 200, body: { arenaId: "ZZZZZZ" } }, { route: "**/api/arenas/ZZZZZZ/players", status: 409, body: { error: "full", code: "arena_full" } }],
    steps: [{ click: "[data-play-bar] button[type=submit]" }, { wait: "[data-play-bar] [role=alert]" }],
  },
  ...[
    ["practice-lobby", "kind=practice", []],
    ["practice-lobby-players", "kind=practice", [tab("players")]],
    ["practice-lobby-ready", "kind=practice&ready=1", []],
    ["practice-result", "kind=practice&phase=finished", []],
    // P4b: "I'm ready" on a public result (73-after-first-timer-test.md, row 7).
    ["practice-result-ready", "kind=practice&phase=finished&ready=1", []],
    ["practice-first-result", "kind=practice&phase=finished&first=1&winner=me", []],
    ["practice-first-ranking", "kind=practice&phase=finished&first=1", [tab("ranking")]],
    ["tournament-lobby", "kind=tournament&humans=64", []],
    ["tournament-lobby-players", "kind=tournament&humans=64", [tab("players")]],
    ["tournament-break", "kind=tournament&phase=break", []],
    ["tournament-break-out", "kind=tournament&phase=break&status=out", []],
    ["tournament-result-bot", "kind=tournament&phase=finished&winner=bot", []],
    ["tournament-result-won", "kind=tournament&phase=finished&winner=me", []],
    ["tournament-result-ranking", "kind=tournament&phase=finished", [tab("ranking")]],
    // P4c: every public result links to the chooser ("Other arenas", publicplay/OtherArenasLink.tsx), so its states wait for that link.
  ].map(([state, query, steps]) => ({
    screen: "public-room",
    state,
    owner: "P3b",
    path: () => `/kit?show=room&${query}`,
    as: "visitor",
    steps: [{ wait: "[data-room-pane]" }, ...(query.includes("phase=finished") ? [{ wait: "[data-other-arenas]" }] : []), ...steps],
  })),
  { screen: "champions", state: "empty", owner: "P3b", path: () => "/champions", as: "visitor", mock: championsMocks(0, false), sweep: true, steps: [{ wait: "[data-champions-part]" }] },
  { screen: "champions", state: "data", owner: "P3b", path: () => "/champions", as: "visitor", mock: championsMocks(12, true), steps: [{ wait: "[data-champions-part]" }] },
  { screen: "champions", state: "rows-100", owner: "P3b", path: () => "/champions", as: "visitor", mock: championsMocks(100, true), sweep: true, steps: [{ wait: "[data-champions-part]" }] },
  { screen: "champions", state: "rows-100-page-2", owner: "P3b", path: () => "/champions", as: "visitor", mock: championsMocks(100, true), steps: [{ wait: "[data-champions-part]" }, { click: '[data-champions-part="month"] [data-pager-next]' }] },
  { screen: "champions", state: "rows-100-last-page", owner: "P3b", path: () => "/champions", as: "visitor", mock: championsMocks(100, true), steps: [{ wait: "[data-champions-part]" }, { pageToEnd: '[data-champions-part="month"] [data-pager-next]' }] },
  { screen: "champions", state: "months", owner: "P3b", path: () => "/champions", as: "visitor", mock: championsMocks(100, true), steps: [{ wait: "[data-champions-part]" }, tab("months")] },
  { screen: "champions", state: "tournaments", owner: "P3b", path: () => "/champions", as: "visitor", mock: championsMocks(100, true), steps: [{ wait: "[data-champions-part]" }, tab("tournaments")] },
  { screen: "champions", state: "failed", owner: "P3b", path: () => "/champions", as: "visitor", mock: [{ route: "**/api/champions", status: 503, body: { error: "down" } }], steps: [{ wait: "[role=alert], [data-champions] button" }] },
];

// CH1b: arena chat (72-arena-chat.md). Lines come from their own fixtures, so no other state shows an unread dot.
// A refusal that the server would give only after real limits or words is a fixed answer to the POST (set after the
// page loaded its history); a wait of ten minutes keeps the countdown on screen while every size is measured.
// The Chat tab on a phone, or the switch of the laptop's side column (a radio of value "chat").
const chatTab = { click: '[data-tab="chat"], label:has(> input[type="radio"][value="chat"])' };
const FIT_APP_SIZES = SIZES.filter((size) => size.kind === "fit" && size.pages === "app").map((size) => size.name);
const chatState = (state, rest) => ({ screen: "chat", state, owner: "CH1b", as: "player", ...rest });
const refuse = (status, body) => [
  chatTab,
  { wait: "[data-chat-form]" },
  { route: "**/api/arenas/*/chat", status, body: { error: "refused", ...body } },
  { fill: "[data-chat-input]", value: "Halo semua" },
  { click: "[data-chat-send]" },
  { wait: "[data-chat-refusal]" },
];
STATES.push(
  chatState("empty", { path: (f) => `/a/${f.privateLobby.id}`, fixture: "privateLobby", steps: [chatTab, { wait: "[data-chat-empty]" }] }),
  chatState("few-lines", { path: (f) => `/a/${f.chatFew.id}`, fixture: "chatFew", steps: [chatTab, { wait: "[data-chat-line]" }] }),
  // The unread dot on the Chat tab while the Tank tab shows.
  chatState("unread-dot", { path: (f) => `/a/${f.chatFew.id}`, fixture: "chatFew", steps: [{ wait: "[data-unread-dot]" }] }),
  chatState("full-page", { path: (f) => `/a/${f.chatFull.id}`, fixture: "chatFull", steps: [chatTab, { wait: "[data-chat-line]" }] }),
  // Reached again at every size, because the laptop's columns mount the pane anew; the scrolling fallback has no pages.
  chatState("full-page-earlier", { path: (f) => `/a/${f.chatFull.id}`, fixture: "chatFull", perSize: true, sizes: FIT_APP_SIZES, steps: [chatTab, { wait: "[data-chat-line]" }, { click: "[data-pager-previous]" }] }),
  chatState("long-word-name", { path: (f) => `/a/${f.chatLong.id}`, fixture: "chatLong", steps: [chatTab, { wait: "[data-chat-line]" }] }),
  chatState("refusal-too-fast", { path: (f) => `/a/${f.chatFew.id}`, fixture: "chatFew", steps: refuse(429, { code: "chat_too_fast", retryAfterMs: 600_000 }) }),
  chatState("refusal-busy", { path: (f) => `/a/${f.chatFew.id}`, fixture: "chatFew", steps: refuse(429, { code: "chat_busy", retryAfterMs: 600_000 }) }),
  chatState("refusal-blocked", { path: (f) => `/a/${f.chatFew.id}`, fixture: "chatFew", steps: refuse(422, { code: "chat_text_blocked" }) }),
  chatState("refusal-closed", { path: (f) => `/a/${f.chatFew.id}`, fixture: "chatFew", steps: refuse(409, { code: "chat_closed" }) }),
  chatState("refusal-off", { path: (f) => `/a/${f.chatFew.id}`, fixture: "chatFew", steps: refuse(409, { code: "chat_off" }) }),
  chatState("refusal-too-long", { path: (f) => `/a/${f.chatFew.id}`, fixture: "chatFew", steps: refuse(400, { code: "chat_text_invalid" }) }),
  chatState("off", { path: (f) => `/a/${f.chatOff.id}`, fixture: "chatOff", steps: [chatTab, { wait: "[data-chat-off]" }] }),
  chatState("owner-settings", { path: (f) => `/a/${f.chatFew.id}`, as: "owner", fixture: "chatFew", steps: [{ click: '[data-opens="settings"]' }, { wait: "[data-chat-switch]" }] }),
  chatState("owner-room", { path: (f) => `/a/${f.chatFew.id}`, as: "owner", fixture: "chatFew", steps: [chatTab, { wait: "[data-chat-line]" }] }),
  chatState("break", { path: (f) => `/a/${f.privateBreak.id}`, fixture: "privateBreak", steps: [chatTab, { wait: "[data-chat-pane]" }] }),
  chatState("finished", { path: (f) => `/a/${f.privateFinished.id}`, fixture: "privateFinished", steps: [chatTab, { wait: "[data-chat-pane]" }] }),
  chatState("host-lobby", { path: (f) => `/a/${f.presenterChat.id}/host`, as: "owner", fixture: "presenterChat", steps: [chatTab, { wait: "[data-chat-line]" }] }),
  chatState("host-off", { path: (f) => `/a/${f.presenterChatOff.id}/host`, as: "owner", fixture: "presenterChatOff", steps: [chatTab, { wait: "[data-chat-off]" }] }),
  chatState("host-settings", { path: (f) => `/a/${f.presenterChatOff.id}/host`, as: "owner", fixture: "presenterChatOff", steps: [{ click: '[data-opens="settings"]' }, { wait: "[data-chat-switch]" }] }),
  chatState("host-break", { path: (f) => `/a/${f.presenterBreak.id}/host`, as: "owner", fixture: "presenterBreak", steps: [chatTab, { wait: "[data-chat-pane]" }] }),
  // The phone's keyboard takes half the height: the input and the newest line must both stay in view.
  chatState("keyboard-open", {
    path: (f) => `/a/${f.chatFull.id}`,
    fixture: "chatFull",
    sizes: ["390x450"],
    steps: [chatTab, { wait: "[data-chat-line]" }, { click: "[data-chat-input]" }],
    inView: ["[data-chat-input]", "[data-chat-line]"],
  }),
);

// G1: the tours for first-timers (65-guidance.md), one state per step at 360 x 640 and 1000 x 600 in both
// languages. Each seeds the tour's stored state at that step (algotank:tours), so the step shows without
// walking the steps before it. `tour` says what must show: the callout (which must not cover its ring) or the pill.
const TOUR_SIZES = ["360x640", "1000x600"];
const tourAt = (id, step) => ({ [id]: { kind: "running", step } });
const tourState = (state, id, step, rest) => ({ screen: "tour", state, owner: "G1", sizes: TOUR_SIZES, tours: tourAt(id, step), tour: "callout", ...rest });
const callout = { wait: "[data-coach-callout]" };
const pill = { wait: "[data-coach-pill]" };
const openStyle = { click: "[data-workshop-open]" };
STATES.push(
  { screen: "tour", state: "home-cue", owner: "G1", path: () => "/", as: "visitor", sizes: TOUR_SIZES, tours: { home: { kind: "notStarted" } }, tour: "callout", steps: [callout] },
  tourState("workshop-01-new", "workshop", 0, { path: () => "/workshop", as: "visitor", steps: [callout] }),
  tourState("workshop-02-start-from", "workshop", 1, { path: () => "/workshop", as: "visitor", steps: [{ click: "[data-workshop-new]" }, callout] }),
  // W2: the editor opens on Rules, so step 3 points at the list at once; step 4 shows its pill until a rule is open.
  tourState("workshop-03-algorithm", "workshop", 2, { path: () => "/workshop", as: "visitor", seedWorkshop: 1, steps: [openStyle, callout] }),
  tourState("workshop-04-pill", "workshop", 3, { path: () => "/workshop", as: "visitor", seedWorkshop: 1, tour: "pill", steps: [openStyle, pill] }),
  tourState("workshop-04-when-do", "workshop", 3, { path: () => "/workshop", as: "visitor", seedWorkshop: 1, steps: [openStyle, { click: "[data-rule-open]" }, callout] }),
  tourState("workshop-05-change", "workshop", 4, { path: () => "/workshop", as: "visitor", seedWorkshop: 1, steps: [openStyle, { click: "[data-rule-open]" }, callout] }),
  // The same step inside one condition: its callout must sit in the step's dock, clear of the number's minus and plus.
  tourState("workshop-05-change-condition", "workshop", 4, {
    path: () => "/workshop",
    as: "visitor",
    seedWorkshop: 1,
    steps: [openStyle, { click: "[data-rule-open]" }, { click: '[data-step-sheet] [data-pager-item] [data-focus-key^="condition:"]' }, callout],
  }),
  tourState("workshop-06-pill", "workshop", 5, { path: () => "/workshop", as: "visitor", seedWorkshop: 1, tour: "pill", steps: [openStyle, pill] }),
  tourState("workshop-06-upgrades", "workshop", 5, { path: () => "/workshop", as: "visitor", seedWorkshop: 1, steps: [openStyle, tab("upgrades"), callout] }),
  tourState("workshop-07-run", "workshop", 6, { path: () => "/workshop", as: "visitor", seedWorkshop: 1, steps: [openStyle, tab("try"), callout] }),
  tourState("workshop-08-result", "workshop", 7, {
    path: () => "/workshop",
    as: "visitor",
    seedWorkshop: 1,
    steps: [openStyle, tab("try"), { click: "[data-test-run]" }, { click: "[data-test-show-result]" }, callout],
  }),
  tourState("workshop-09-name", "workshop", 8, { path: () => "/workshop", as: "visitor", seedWorkshop: 1, steps: [openStyle, callout] }),
  tourState("workshop-10-saved", "workshop", 9, { path: () => "/workshop", as: "visitor", seedWorkshop: 1, steps: [openStyle, callout] }),
  tourState("workshop-checklist", "workshop", 4, { path: () => "/workshop", as: "visitor", seedWorkshop: 1, tour: "pill", steps: [{ click: '[data-focus-key="first-style-checklist"]' }, { wait: "[data-step-sheet]" }, pill] }),
  tourState("workshop-done", "workshop", 9, { path: () => "/workshop", as: "visitor", seedWorkshop: 1, tour: undefined, steps: [openStyle, { click: "[data-coach-callout] button" }, { wait: "[data-first-style-done]" }] }),
  // A private lobby has no clock, so every step waits for the player; the guest's step 4 points at the status line, the owner's at Start.
  ...[0, 1, 2, 3].map((step) => tourState(`lobby-${step + 1}-guest`, "lobby", step, { path: (f) => `/a/${f.privateLobby.id}`, as: "player", fixture: "privateLobby", steps: [callout] })),
  tourState("lobby-4-owner", "lobby", 3, { path: (f) => `/a/${f.privateLobby.id}`, as: "owner", fixture: "privateLobby", steps: [callout] }),
  // On a phone the Players tab hides the Tank tab's play style tabs, so step 2 shows the pill. A laptop shows both panes.
  tourState("lobby-2-pill", "lobby", 1, { path: (f) => `/a/${f.privateLobby.id}`, as: "player", fixture: "privateLobby", sizes: ["360x640"], tour: "pill", steps: [tab("players"), pill] }),
  // A public lobby, which has a countdown clock that no step may cover: steps 1 and 2 (the first lobby) and 3 and 4 (the
  // second). The harness's tournament lobby has 42 s left, so each part fits.
  ...[0, 1, 2, 3].map((step) => tourState(`lobby-${step + 1}-public`, "lobby", step, { path: () => "/kit?show=room&kind=tournament&humans=5", as: "visitor", steps: [{ wait: "[data-room-pane]" }, callout] })),
  // A 50-minute round (the privateRunning fixture), so a step always fits the time left.
  ...[0, 1, 2].map((step) => tourState(`round-${step + 1}`, "round", step, { path: (f) => `/a/${f.privateRunning.id}`, as: "player", fixture: "privateRunning", steps: [callout] })),
  // "Show me around" in the board's legend replays the round tour (70-fixes-after-guidance.md, fix 9): every tour starts finished here.
  { screen: "tour", state: "round-replay", owner: "F1", path: (f) => `/a/${f.privateRunning.id}`, as: "player", fixture: "privateRunning", sizes: TOUR_SIZES, tour: "callout", steps: [{ click: "[data-legend-open]" }, { wait: "dialog[open]" }, { click: "dialog[open] [data-show-around]" }, callout] },
  ...[0, 1].map((step) => tourState(`result-${step + 1}`, "result", step, { path: (f) => `/a/${f.privateFinished.id}`, as: "player", fixture: "privateFinished", steps: [callout] })),
);

// O1: the stored result and the round history (75-organiser-tournament.md section 5). The result page reads
// GET /api/results/<id>, answered here with a generated knockout: 16 tanks in 2 rounds, or 512 tanks in 7
// rounds (512, 256, 128, 64, 32, 16, then a final of 8). The owner's laptop size (1728 x 1000) is checked
// for the result page and the history; the phone states click the page's tabs, which a laptop does not have.
const RESULT_16 = "AuditResult16AAAAAAAAA";
const RESULT_512 = "AuditResult512AAAAAAAA";
const APP_SIZE_NAMES = SIZES.filter((size) => size.pages === "app").map((size) => size.name);
const WITH_OWNER_LAPTOP = [...APP_SIZE_NAMES, "1728x1000"];
const PHONE_LAYOUT_SIZES = SIZES.filter((size) => size.pages === "app" && size.width < 896).map((size) => size.name);
const resultName = (i) => `${AUDIT_NAMES[i % AUDIT_NAMES.length].slice(0, 11)} ${i + 1}`;

/** A stored result of `players` tanks: each round keeps max(8, half) in id order, so the first tank wins; every tenth is a bot. */
function knockoutResult(id, players) {
  const ids = Array.from({ length: players }, (_, i) => `p${i + 1}`);
  const rounds = [];
  let alive = ids;
  for (let round = 1; ; round++) {
    const isFinal = alive.length <= 8;
    const keep = isFinal ? 1 : Math.max(8, Math.ceil(alive.length / 2));
    // Points fall with the place, with a tie now and then so equal points show.
    rounds.push({ round, isFinal, ruleSetId: "standard", standings: alive.map((playerId, i) => ({ playerId, rank: i + 1, score: Math.max(0, 40 - Math.floor(i / 2)) })), survivors: alive.slice(0, keep) });
    if (isFinal) break;
    alive = alive.slice(0, keep);
  }
  return {
    id,
    arenaId: "ENDED2",
    arenaName: "Turnamen air Jumat sore bersama teman sekelas",
    kind: players > 64 ? "presenter" : "private",
    finishedAt: Date.UTC(2026, 10, 13, 10),
    game: 1,
    ticksPerRound: 333,
    tickMs: 900,
    ruleSetMode: "standard",
    joinPolicy: "account",
    players: ids.map((playerId, i) => ({ id: playerId, name: i === 1 ? "Bartholomew Kusu" : resultName(i), look: AUDIT_LOOK(i), isBot: i % 10 === 9 })),
    rounds,
    ranking: ids.map((playerId, i) => ({ playerId, place: i + 1 })),
    winnerId: "p1",
  };
}
const resultMock = (id, players, owner) => [{ route: `**/api/results/${id}`, status: 200, body: { result: knockoutResult(id, players), emails: owner ? [{ playerId: "p1", email: "pemenang.turnamen.panjang@example.org" }] : null } }];
const resultState = (state, rest) => ({ screen: "result", state, owner: "O1", as: "visitor", ...rest });
const myResults = (n) => Array.from({ length: n }, (_, i) => {
  const r = knockoutResult(`AuditList${String(i).padStart(4, "0")}AAAAAAAAA`, 16);
  return { id: r.id, arenaName: i === 0 ? r.arenaName : `Arena ${i + 1}`, kind: "private", finishedAt: r.finishedAt - i * 86_400_000, game: 1 + (i % 3), winnerName: resultName(i), winnerLook: AUDIT_LOOK(i), players: 16 + i, rounds: 2 };
});

STATES.push(
  resultState("16", { path: () => `/r/${RESULT_16}`, mock: resultMock(RESULT_16, 16, false), sizes: WITH_OWNER_LAPTOP, steps: [{ wait: '[data-result-page="ready"]' }] }),
  resultState("16-owner", { path: () => `/r/${RESULT_16}`, mock: resultMock(RESULT_16, 16, true), sizes: WITH_OWNER_LAPTOP, steps: [{ wait: "[data-winner-email]" }] }),
  ...["ranking", "history"].map((value) => resultState(`16-${value}`, { path: () => `/r/${RESULT_16}`, mock: resultMock(RESULT_16, 16, false), sizes: PHONE_LAYOUT_SIZES, steps: [{ wait: '[data-result-page="ready"]' }, tab(value)] })),
  resultState("512", { path: () => `/r/${RESULT_512}`, mock: resultMock(RESULT_512, 512, true), sizes: WITH_OWNER_LAPTOP, steps: [{ wait: '[data-result-page="ready"]' }] }),
  ...["ranking", "history"].map((value) => resultState(`512-${value}`, { path: () => `/r/${RESULT_512}`, mock: resultMock(RESULT_512, 512, false), sizes: PHONE_LAYOUT_SIZES, steps: [{ wait: '[data-result-page="ready"]' }, tab(value)] })),
  // The last round of the 512-tank history on a phone: the final, with the winner's crown.
  resultState("512-history-final", { path: () => `/r/${RESULT_512}`, mock: resultMock(RESULT_512, 512, false), sizes: PHONE_LAYOUT_SIZES, steps: [{ wait: '[data-result-page="ready"]' }, tab("history"), { pageToEnd: "[data-history-next]" }] }),
  // On a laptop narrower than the 7 columns, the later rounds are a page away.
  resultState("512-history-later", { path: () => `/r/${RESULT_512}`, mock: resultMock(RESULT_512, 512, false), sizes: ["1000x600", "1280x720"], steps: [{ wait: '[data-result-page="ready"]' }, { click: "[data-history-next]" }] }),
  resultState("not-found", { path: () => `/r/${RESULT_16}`, mock: [{ route: `**/api/results/${RESULT_16}`, status: 404, body: { error: "gone" } }], steps: [{ wait: '[data-result-page="notFound"]' }] }),
  // The arena link of an arena that ended: the stream meets a 404, and the arena answers with its result.
  resultState("ended-arena", { path: () => "/a/ENDED2", mock: [{ route: "**/api/arenas/ENDED2", status: 404, body: { error: "That arena does not exist.", resultId: RESULT_16 } }], steps: [{ wait: "[data-arena-ended]" }] }),
  resultState("my-results", { path: () => "/my-results", as: "creator", mock: [{ route: "**/api/account/results", status: 200, body: { results: myResults(30) } }], steps: [{ wait: '[data-my-results="ready"]' }] }),
  resultState("my-results-empty", { path: () => "/my-results", as: "creator", mock: [{ route: "**/api/account/results", status: 200, body: { results: [] } }], steps: [{ wait: '[data-my-results="ready"]' }] }),
  // The finished views of a live arena: the room's history tab, the presenter's, and the room's at the owner's laptop size.
  { screen: "room", state: "finished-player-history-owner-laptop", owner: "O1", path: (f) => `/a/${f.privateFinished.id}`, as: "player", fixture: "privateFinished", sizes: ["1728x1000"], steps: [tab("history")] },
  { screen: "presenter", state: "finished-history", owner: "O1", path: (f) => `/a/${f.presenterFinished.id}/host`, as: "owner", fixture: "presenterFinished", sizes: WITH_OWNER_LAPTOP, steps: [tab("history")] },
);

STATES.push(
  // O1 (75-organiser-tournament.md): the create form's new settings, a signed-in-only arena (email lines, ready marks
  // and count, the scheduled start, the removal question, the accounts kept out, the join step), the private arena at
  // its new capacity of 64, and the header's Support entry.
  { screen: "create-private", state: "form-owner-laptop", owner: "O1", path: () => "/new/private", as: "creator", sizes: ["1728x1000"], steps: [{ wait: "[data-create-form]" }] },
  // X1 (78-arena-seats.md): "Number of tanks" beside the bots switch on the form's main step, on the small phone, the
  // phone and the owner's laptop; the settings sheets that change it are lobby-owner-settings and presenter/lobby-settings.
  ...["create-private", "create-presenter"].map((screen) => ({
    screen,
    state: "tanks",
    owner: "X1",
    path: () => (screen === "create-private" ? "/new/private" : "/new/presenter"),
    as: "creator",
    sizes: ["360x640", "390x844", "1728x1000"],
    steps: [{ wait: "[data-tank-count]" }, { click: '[data-tank-count] label:has(input[value="64"])' }, { wait: '[data-tank-count] [aria-valuenow="64"]' }],
  })),
  { screen: "create-private", state: "option-join", owner: "O1", path: () => "/new/private", as: "creator", steps: [{ click: '[data-create-option="joinPolicy"]' }, { wait: "[data-step-sheet]" }] },
  { screen: "room", state: "not-joined-sign-in", owner: "O1", path: (f) => `/a/${f.privateAccount.id}`, as: "visitor", fixture: "privateAccount", steps: [{ wait: "[data-sign-in-to-join]" }] },
  { screen: "room", state: "not-joined-email-notice", owner: "O1", path: (f) => `/a/${f.privateAccount.id}`, as: "creator", fixture: "privateAccount", steps: [{ wait: "[data-email-notice]" }] },
  ...[
    ["lobby-owner-scheduled", []],
    ["lobby-owner-scheduled-players", [tab("players"), { wait: "[data-player-email]" }]],
  ].map(([state, more]) => ({
    screen: "room",
    state,
    owner: "O1",
    path: (f) => `/a/${f.privateScheduled.id}`,
    as: "owner",
    fixture: "privateScheduled",
    sizes: WITH_OWNER_LAPTOP,
    steps: [{ ownerFetch: (f) => ({ path: `/api/arenas/${f.privateScheduled.id}/rounds/schedule`, method: "POST", body: { minutes: 5 } }) }, { wait: '[data-start-plan="scheduled"]' }, ...more],
  })),
  { screen: "room", state: "lobby-owner-start-later", owner: "O1", path: (f) => `/a/${f.privateLobby.id}`, as: "owner", fixture: "privateLobby", steps: [{ click: "[data-start-later]" }, { wait: "[data-start-picker]" }] },
  { screen: "room", state: "lobby-player-ready", owner: "O1", path: (f) => `/a/${f.privateAccount.id}`, as: "player", fixture: "privateAccount", steps: [{ wait: '[data-ready-bar="done"]' }] },
  { screen: "room", state: "lobby-owner-remove-ask", owner: "O1", path: (f) => `/a/${f.privateAccount.id}`, as: "owner", fixture: "privateAccount", sizes: WITH_OWNER_LAPTOP, steps: [tab("players"), { pageToEnd: "[data-pager-next]" }, { click: "[data-remove-player]:visible" }, { wait: 'dialog[data-dialog="remove"][open]' }] },
  { screen: "room", state: "lobby-owner-remove-anyone", owner: "O1", path: (f) => `/a/${f.privateLobby.id}`, as: "owner", fixture: "privateLobby", steps: [tab("players"), { pageToEnd: "[data-pager-next]" }, { click: "[data-remove-player]:visible" }, { wait: 'dialog[data-dialog="remove"][open]' }] },
  { screen: "room", state: "lobby-owner-settings-kept-out", owner: "O1", path: (f) => `/a/${f.privateAccount.id}`, as: "owner", fixture: "privateAccount", steps: [{ click: '[data-opens="settings"]' }, { wait: "[data-opens-kept-out]" }] },
  // F1 (82-fit-fixes.md): the worst case of the same panel, with 64 tanks as well as the kept-out button and the chat switch.
  { screen: "room", state: "lobby-owner-settings-kept-out-64", owner: "F1", path: (f) => `/a/${f.privateAccount64.id}`, as: "owner", fixture: "privateAccount64", steps: [{ click: '[data-opens="settings"]' }, { wait: "[data-opens-kept-out]" }] },
  { screen: "room", state: "lobby-owner-kept-out", owner: "O1", path: (f) => `/a/${f.privateAccount.id}`, as: "owner", fixture: "privateAccount", steps: [{ click: '[data-opens="settings"]' }, { click: "[data-opens-kept-out]" }, { wait: "[data-kept-out]" }] },
  ...[
    // The player first: the owner's state schedules the next round, which starts 5 minutes later.
    ["break-player-ready", "player", "", [{ wait: "[data-ready-bar]" }]],
    ["break-owner-scheduled", "owner", "/host", []],
  ].map(([state, as, page, more]) => ({
    screen: as === "owner" ? "presenter" : "room",
    state,
    owner: "O1",
    path: (f) => `/a/${f.presenterBreakReady.id}${page}`,
    as,
    fixture: "presenterBreakReady",
    steps: as === "owner" ? [{ ownerFetch: (f) => ({ path: `/api/arenas/${f.presenterBreakReady.id}/rounds/schedule`, method: "POST", body: { minutes: 5 } }) }, { wait: '[data-start-plan="scheduled"]' }, ...more] : more,
  })),
  { screen: "presenter", state: "lobby-ready-players", owner: "O1", path: (f) => `/a/${f.presenterAccount.id}/host`, as: "owner", fixture: "presenterAccount", steps: [tab("players"), { wait: "[data-player-email]" }] },
  // The private arena at its capacity of 64 (owner's page and player's page): the lobby's paged player list, a running round, the break's ranking.
  ...["owner", "player"].flatMap((as) => [
    { screen: "room", state: `private64-lobby-${as}-players`, owner: "O1", path: (f) => `/a/${f.privateFull.id}`, as, fixture: "privateFull", steps: [tab("players")] },
    { screen: "room", state: `private64-running-${as}-ranking`, owner: "O1", path: (f) => `/a/${f.privateRunning64.id}`, as, fixture: "privateRunning64", steps: [tab("ranking")] },
    { screen: "room", state: `private64-break-${as}-ranking`, owner: "O1", path: (f) => `/a/${f.privateBreak64.id}`, as, fixture: "privateBreak64", steps: [tab("ranking")] },
  ]),
  // A scheduled start that found too few tanks (the owner's notice), and the owner's Players tab in a break (to remove a player there).
  { screen: "presenter", state: "lobby-start-missed", owner: "O1", path: (f) => `/a/${f.presenterMissed.id}/host`, as: "owner", fixture: "presenterMissed", steps: [{ wait: "[data-start-missed]" }] },
  { screen: "presenter", state: "lobby-start-missed-players", owner: "O1", path: (f) => `/a/${f.presenterMissed.id}/host`, as: "owner", fixture: "presenterMissed", steps: [{ wait: "[data-start-missed]" }, tab("players")] },
  { screen: "room", state: "break-owner-players", owner: "O1", path: (f) => `/a/${f.privateBreak.id}`, as: "owner", fixture: "privateBreak", steps: [tab("players")] },
  // A finished game of two rounds, so the round history has two columns in the room, on the presenter page and on the big screen.
  { screen: "room", state: "finished2-player-history", owner: "O1", path: (f) => `/a/${f.presenterFinished2.id}`, as: "player", fixture: "presenterFinished2", sizes: WITH_OWNER_LAPTOP, steps: [tab("history")] },
  { screen: "presenter", state: "finished2-history", owner: "O1", path: (f) => `/a/${f.presenterFinished2.id}/host`, as: "owner", fixture: "presenterFinished2", sizes: WITH_OWNER_LAPTOP, steps: [tab("history")] },
  { screen: "big-screen", state: "finished2", owner: "O1", path: (f) => `/a/${f.presenterFinished2.id}/screen`, as: "visitor", fixture: "presenterFinished2", bigScreen: true },
  // The header's Support entry: the modal at every size, and the header with the entry at 360 px.
  { screen: "support", state: "modal", owner: "O1", path: () => "/join", as: "visitor", steps: [{ click: "[data-support-open]" }, { wait: "dialog[data-support][open]" }] },
  { screen: "support", state: "header-360", owner: "O1", path: (f) => `/a/${f.privateLobby.id}`, as: "player", fixture: "privateLobby", sizes: ["360x640"] },
);

// E1 (76-email-and-sequences.md): the email code steps. The audit server runs without mail settings, so the
// states with mail answer GET /api/auth/capabilities (and the code routes) with mocks; the states without mail
// use the real server.
const MAIL_ON = { route: "**/api/auth/capabilities", status: 200, body: { canSendEmail: true } };
const REGISTERED = { route: "**/api/auth/register", status: 200, body: { account: { id: "audit-new", email: "new.player@example.com", emailVerified: false }, verificationEmail: "sent" } };
const signUpSteps = [tab("register"), { fill: "input[type=email]", value: "new.player@example.com" }, { fill: "input[autocomplete=new-password]", value: "splash-party-2027" }, { click: "form button[type=submit]" }, { wait: "[data-verify-step]" }];
const wrongCodeSteps = [
  { route: "**/api/auth/verify", status: 400, body: { error: "The code is not correct.", code: "code_wrong", triesLeft: 3 } },
  { fill: "input[autocomplete=one-time-code]", value: "123456" },
  { click: "[data-verify-step] button[type=submit]" },
  { wait: "[aria-invalid=true]" },
];
const forgotSteps = [{ click: "[data-forgot]" }, { wait: "[data-reset-form]" }];
const resetCodeSteps = [...forgotSteps, { fill: "input[type=email]", value: "someone@example.com" }, { click: "[data-reset-form] button[type=submit]" }, { wait: '[data-reset-step="code"]' }];
const RESET_SENT = { route: "**/api/auth/reset/send", status: 202, body: { accepted: true } };
const CODE_SENT = { route: "**/api/auth/verify/send", status: 204 };
STATES.push(
  { screen: "sign-in", state: "register-code", owner: "E1", path: () => "/sign-in", as: "visitor", mock: [MAIL_ON, REGISTERED], steps: signUpSteps },
  { screen: "sign-in", state: "register-code-wrong", owner: "E1", path: () => "/sign-in", as: "visitor", mock: [MAIL_ON, REGISTERED], steps: [...signUpSteps, ...wrongCodeSteps] },
  { screen: "sign-in", state: "register-mail-off", owner: "E1", path: () => "/sign-in", as: "visitor", steps: [tab("register"), { wait: "[data-mail-off]" }] },
  { screen: "sign-in", state: "forgot-email", owner: "E1", path: () => "/sign-in", as: "visitor", mock: [MAIL_ON], steps: forgotSteps },
  { screen: "sign-in", state: "forgot-code", owner: "E1", path: () => "/sign-in", as: "visitor", mock: [MAIL_ON, RESET_SENT], steps: resetCodeSteps },
  {
    screen: "sign-in",
    state: "forgot-code-wrong",
    owner: "E1",
    path: () => "/sign-in",
    as: "visitor",
    mock: [MAIL_ON, RESET_SENT, { route: "**/api/auth/reset", status: 400, body: { error: "The code is not correct or no longer works.", code: "code_invalid" } }],
    steps: [...resetCodeSteps, { fill: "input[autocomplete=one-time-code]", value: "123456" }, { fill: "input[autocomplete=new-password]", value: "splash-party-2027" }, { click: "[data-reset-form] button[type=submit]" }, { wait: "[aria-invalid=true]" }],
  },
  { screen: "create-private", state: "signed-out-register-code", owner: "E1", path: () => "/new/private", as: "visitor", mock: [MAIL_ON, REGISTERED], steps: signUpSteps },
  { screen: "create-private", state: "option-join-no-mail", owner: "E1", path: () => "/new/private", as: "creator", steps: [{ click: '[data-create-option="joinPolicy"]' }, { wait: "[data-step-sheet] [data-disabled]" }] },
  { screen: "verify-email", state: "send", owner: "E1", path: () => "/verify-email", as: "creator", mock: [MAIL_ON], steps: [{ wait: "[data-verify-step]" }] },
  { screen: "verify-email", state: "code", owner: "E1", path: () => "/verify-email", as: "creator", mock: [MAIL_ON, CODE_SENT], steps: [{ click: "[data-verify-step] button" }, { wait: "input[autocomplete=one-time-code]" }] },
  {
    screen: "verify-email",
    state: "code-wrong",
    owner: "E1",
    path: () => "/verify-email",
    as: "creator",
    mock: [MAIL_ON, CODE_SENT],
    steps: [{ click: "[data-verify-step] button" }, { wait: "input[autocomplete=one-time-code]" }, ...wrongCodeSteps],
  },
  {
    screen: "verify-email",
    state: "resend-wait",
    owner: "E1",
    path: () => "/verify-email",
    as: "creator",
    mock: [MAIL_ON, { route: "**/api/auth/verify/send", status: 429, body: { error: "Too many attempts.", code: "rate_limited", retryAfterSeconds: 42 } }],
    steps: [{ click: "[data-verify-step] button" }, { wait: "[data-verify-step] [role=alert]" }],
  },
  { screen: "verify-email", state: "mail-off", owner: "E1", path: () => "/verify-email", as: "creator", steps: [{ wait: "[data-verify-page] button" }] },
  { screen: "verify-email", state: "signed-out", owner: "E1", path: () => "/verify-email", as: "visitor", steps: [{ wait: "[data-verify-page] a" }] },
  {
    screen: "room",
    state: "not-joined-verify-first",
    owner: "E1",
    path: (f) => `/a/${f.privateAccount.id}`,
    as: "creator",
    fixture: "privateAccount",
    steps: [
      { wait: "[data-join-form]" },
      { route: "**/api/arenas/*/players", status: 403, body: { error: "This arena is for players whose email is verified.", code: "email_not_verified" } },
      { click: "[data-join-form] button[type=submit]" },
      { wait: "[data-join-form] [data-verify-link]" },
    ],
  },
);

// B1 (80-background-music.md): the header's sound panel open. The click on the button is the first
// gesture, so the music loads and plays; the failed state answers the music file with a 404.
const openSoundPanel = [{ click: "[data-sound-open]" }, { wait: "dialog[data-sound][open]" }];
STATES.push(
  { screen: "sound", state: "panel", owner: "B1", path: () => "/join", as: "visitor", sizes: ["360x640", "390x844", "1728x1000"], steps: [...openSoundPanel, { wait: '[data-sound-open][data-music-state="playing"]' }] },
  { screen: "sound", state: "panel-room", owner: "B1", path: (f) => `/a/${f.privateLobby.id}`, as: "player", fixture: "privateLobby", sizes: ["360x640", "1728x1000"], steps: openSoundPanel },
  {
    screen: "sound",
    state: "panel-failed",
    owner: "B1",
    path: () => "/join",
    as: "visitor",
    sizes: ["360x640", "1728x1000"],
    mock: [{ route: "**/music/**", status: 404, body: { error: "missing" } }],
    steps: [...openSoundPanel, { wait: '[data-sound-open][data-music-state="failed"]' }],
  },
  { screen: "sound", state: "panel-big-screen", owner: "B1", path: (f) => `/a/${f.privateLobby.id}/screen`, as: "visitor", fixture: "privateLobby", sizes: ["1920x1080"], steps: openSoundPanel },
);

// K1 (81-metrics.md): the host's usage numbers. The audit's accounts are not in ADMIN_EMAILS, so the
// answer is a fixed one: 30 made-up days that grow towards today, with every counter filled.
function adminMetricsMock(days) {
  const today = Date.UTC(2026, 10, 14);
  const list = Array.from({ length: days }, (_, i) => {
    const d = days - 1 - i;
    const n = 40 + ((i * 37) % 23) + i * 3;
    const day = new Date(today - d * 86_400_000).toISOString().slice(0, 10);
    const counts = days === 1 ? {} : {
      visitors: n, "pageOpened.home": n * 2, "pageOpened.play": n, "pageOpened.arena": n * 3, "pageOpened.workshop": Math.round(n / 3), "pageOpened.monthly": 9, "pageOpened.champions": 5, "pageOpened.result": 4,
      "arenaCreated.private": 3 + (i % 4), "arenaCreated.practice": 2, "joined.practice": n, "joined.private": 12, "gameStarted.practice": 20 + (i % 9), "gameFinished.practice": 19 + (i % 9),
      "roundPlayed.practice": 30 + (i % 7), "tanksInRounds.practice": 240 + (i % 7) * 8, accountRegistered: 2 + (i % 5), accountVerified: 1 + (i % 4), signedIn: 7 + (i % 6), monthlySeatTaken: 1 + (i % 3), monthlySeatQuit: i % 2,
      chatLine: 30 + (i % 11) * 4, openStreamsPeak: 15 + (i % 8), stepRuleSaved: i % 5, "languageUsed.id": n, "languageUsed.en": Math.round(n / 4),
      "firstTimer.openedHome": 20, "firstTimer.enteredPractice": 15, "firstTimer.watchedFirstRound": 11, "firstTimer.openedRules": 6, "firstTimer.changedRule": 4, "firstTimer.playedSecondRound": 3,
    };
    return { day, counts };
  });
  return [{ route: "**/api/admin/metrics*", status: 200, body: { timeZone: "Asia/Jakarta", today: "2026-11-14", days: list } }];
}
const ADMIN_SIZES = [...APP_SIZE_NAMES, "1728x1000"];
const adminState = (state, extra = {}) => ({ screen: "admin-metrics", state, owner: "K1", path: () => "/admin/metrics", as: "visitor", sizes: ADMIN_SIZES, mock: adminMetricsMock(30), steps: [{ wait: "[data-metrics-part]" }], ...extra });
STATES.push(
  adminState("today"),
  adminState("today-last-page", { steps: [{ wait: "[data-metrics-part]" }, { pageToEnd: '[data-metrics-part="today"] [data-pager-next]' }] }),
  adminState("days", { steps: [{ wait: "[data-metrics-part]" }, tab("days")] }),
  adminState("path", { steps: [{ wait: "[data-metrics-part]" }, tab("path")] }),
  adminState("one-empty-day", { mock: adminMetricsMock(1), steps: [{ wait: "[data-metrics-part]" }, tab("path")] }),
  adminState("not-admin", { mock: [{ route: "**/api/admin/metrics*", status: 404, body: { error: "That route does not exist." } }], steps: [{ wait: "h1" }] }),
);

// M2 (77-monthly-league.md, section 6): the monthly arena's page. The league is one shared thing per server, so its
// states come from the kit harness (/kit?show=monthly, monthly/MonthlyHarness.tsx); the join steps and a visitor's
// page use the real server. The watch page is a presenter view, so it is checked at 1728 x 1000 and 1920 x 1080 too.
const MONTHLY_SIZES = [...APP_SIZE_NAMES, "1728x1000", "1920x1080"];
const monthlyKit = (state, query, extra = {}) => ({ screen: "monthly", state, owner: "M2", path: () => `/kit?show=monthly&${query}`, as: "visitor", sizes: MONTHLY_SIZES, steps: [{ wait: "[data-monthly-page]" }], ...extra });
STATES.push(
  monthlyKit("visitor", "case=visitor"),
  monthlyKit("empty", "case=empty"),
  monthlyKit("one-and-bot", "case=one"),
  monthlyKit("leagues-2", "case=visitor&leagues=2"),
  monthlyKit("leagues-9", "case=visitor&leagues=9"),
  monthlyKit("leagues-9-open", "case=visitor&leagues=9", { perSize: true, steps: [{ wait: "[data-monthly-page]" }, { click: '[data-picker="league"]' }, { wait: "[data-picker-list]" }] }),
  monthlyKit("visitor-ranking", "case=visitor&tab=ranking"),
  monthlyKit("seated", "case=seated&leagues=2"),
  monthlyKit("seated-ranking-month", "case=seated&tab=ranking&side=month"),
  monthlyKit("seated-ranking-month-last-page", "case=seated&tab=ranking&side=month", { steps: [{ wait: "[data-monthly-page]" }, { pageToEnd: "[data-monthly-ranking] [data-pager-next]" }] }),
  monthlyKit("seated-mine", "case=seated&tab=mine&side=mine"),
  monthlyKit("other-league", "case=other&tab=mine&side=mine"),
  monthlyKit("other-league-arena", "case=other"),
  monthlyKit("move", "case=move"),
  monthlyKit("day-done", "case=dayDone"),
  monthlyKit("closing", "case=closing"),
  monthlyKit("failed", "case=failed"),
  monthlyKit("quit", "case=seated&tab=mine&side=mine&quit=1", { steps: [{ wait: "dialog[data-dialog=monthly-quit][open]" }] }),
  { screen: "monthly", state: "page-visitor", owner: "M2", path: () => "/monthly", as: "visitor", sizes: MONTHLY_SIZES, steps: [{ wait: "[data-monthly-board]" }] },
  { screen: "monthly", state: "join-name", owner: "M2", path: () => "/monthly", as: "creator", perSize: true, steps: [{ click: "[data-monthly-join]" }, { wait: "[data-monthly-name]" }] },
  {
    screen: "monthly",
    state: "join-name-taken",
    owner: "M2",
    path: () => "/monthly",
    as: "creator",
    perSize: true,
    steps: [
      { click: "[data-monthly-join]" },
      { fill: "[data-monthly-name] input", value: "Bartholomew Kusu" },
      { click: "[data-monthly-next]" },
      { wait: "[data-monthly-submit]" },
      { route: "**/api/monthly/seat", status: 409, body: { error: "taken", code: "name_taken" } },
      { click: "[data-monthly-submit]" },
      { wait: "[data-monthly-name] [aria-invalid=true]" },
    ],
  },
  {
    screen: "monthly",
    state: "join-name-fixed",
    owner: "M2",
    path: () => "/monthly",
    as: "creator",
    perSize: true,
    mock: [{ route: "**/api/monthly/me", status: 200, body: { seat: null, name: { name: "Bartholomew Kusu", month: "2026-11", canChange: false }, move: null } }],
    steps: [{ click: "[data-monthly-join]" }, { wait: "[data-name-fixed]" }],
  },
  { screen: "monthly", state: "join-tank", owner: "M2", path: () => "/monthly", as: "creator", perSize: true, sizes: [...APP_SIZE_NAMES, "1728x1000"], steps: [{ click: "[data-monthly-join]" }, { click: "[data-monthly-next]" }, { wait: "[data-monthly-submit]" }] },
  {
    screen: "monthly",
    state: "join-tank-problem",
    owner: "M2",
    path: () => "/monthly",
    as: "creator",
    perSize: true,
    steps: [
      { click: "[data-monthly-join]" },
      { click: "[data-monthly-next]" },
      { wait: "[data-monthly-submit]" },
      { route: "**/api/monthly/seat", status: 503, body: { error: "The day round is being recorded." } },
      { click: "[data-monthly-submit]" },
      { wait: "[data-step-sheet] [role=alert]" },
    ],
  },
);

/** Steps that choose an action with the picker: its group (engine order), then the action's id. */
function pickAction(group, id) {
  return [
    { click: '[data-picker="action"]' },
    { click: `[role="listbox"] [data-picker-group="${group}"]` },
    { click: `[role="listbox"] [data-picker-value="${id}"]` },
    { wait: `[data-picker="action"][aria-expanded="false"]` },
  ];
}

/** The built-in play styles, read once from the engine's own table, so the seeded strategies are real ones. */
let seedPresets = [];

/**
 * Puts `count` saved play styles in the browser before the workshop page loads, in the
 * library's stored form (src/workshop/library.ts, LIBRARY_KEY and StoredLibrary). The first
 * has a name of the full 24 characters, and the one at `brokenIndex` (the third unless a state
 * says otherwise with `seedBroken`) has a problem (an empty mode name).
 */
function workshopSeedScript(count, brokenIndex = 2) {
  const base = Date.UTC(2026, 10, 1, 9, 0);
  const styles = Array.from({ length: count }, (_, i) => {
    const preset = seedPresets[i % seedPresets.length];
    const broken = i === brokenIndex;
    const strategy = broken ? { ...preset.strategy, modes: preset.strategy.modes.map((mode, m) => (m === 0 ? { ...mode, name: "" } : mode)) } : preset.strategy;
    return {
      id: `audit-style-${String(i + 1).padStart(4, "0")}`,
      name: i === 0 ? "Sneaky splasher of Bintar" : `${preset.name} ${i + 1}`,
      strategy,
      updatedAt: base - i * 3_600_000,
    };
  });
  return { key: "algotank:workshop:play-styles", value: JSON.stringify({ version: 1, styles, sync: null }) };
}

// --- HTTP set-up ------------------------------------------------------------------------

function httpClient(base) {
  let address = Math.floor(Math.random() * 50000);
  // Registration allows 5 per hour per address, so every scripted client gets its own (TRUST_PROXY=1).
  const nextAddress = () => {
    address += 1;
    return `10.${(address >> 16) & 255}.${(address >> 8) & 255}.${address & 255}`;
  };
  async function api(path, { method = "GET", body, cookie, token } = {}) {
    const headers = { Origin: base, "Content-Type": "application/json", "X-Forwarded-For": nextAddress() };
    if (cookie) headers.Cookie = cookie;
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(base + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    const text = await res.text();
    if (!res.ok) throw new Error(`${method} ${path} answered ${res.status}: ${text.slice(0, 300)}`);
    return { json: text ? JSON.parse(text) : null, res };
  }
  return { api, nextAddress };
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function makeFixtures(base, needed, log) {
  const { api } = httpClient(base);
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  let accounts = 0;
  async function register() {
    accounts += 1;
    const email = `audit-${stamp}-${accounts}@example.com`;
    const { res } = await api("/api/auth/register", { method: "POST", body: { email, password: "splash-party-2026" } });
    const cookie = res.headers.get("set-cookie")?.split(";")[0];
    if (!cookie) throw new Error("registration sent no session cookie");
    return { cookie, email };
  }
  const account = async () => (await register()).cookie;
  /**
   * `humans`: the most people the fixture seats. Each fixture plays as it did before tank counts (78-arena-seats.md),
   * when bots filled to 8 and an arena took the kind's most people: fewer than 8 people get 8 tanks; 8 or more get the
   * kind's most with bots off, because bots never joined them, so only the fixtures built full are full.
   */
  async function arena(cookie, kind, settings, humans) {
    const many = humans >= 8;
    const seats = many ? { tankCount: kind === "presenter" ? 512 : 64, botFill: false } : { tankCount: 8 };
    const full = { name: "Friday water fight", ticksPerRound: 20, tickMs: 100, ruleSetMode: "standard", botFill: true, joinPolicy: "anyone", ...settings, ...seats };
    return (await api("/api/arenas", { method: "POST", cookie, body: { kind, settings: full } })).json.arenaId.toUpperCase();
  }
  // The last name is as long as the name rule allows (16 characters), so lists show their ellipsis.
  const NAMES = ["Ana", "Budi", "Citra", "Dewi", "Eko", "Fajar", "Gita", "Hana", "Irfan", "Bartholomew Kusu"];
  // Names must be unique in an arena, so after the first ten a number follows the name (within the 16 characters of the name rule).
  const nameFor = (i) => (i < NAMES.length ? NAMES[i] : `${NAMES[i % NAMES.length].slice(0, 11)} ${Math.floor(i / NAMES.length) + 1}`);
  const SKINS = ["dots", "stripes", "slants", "checks", "zigzag", "waves", "stars", "hearts", "splashes", "bricks", "scales", "plain"];
  const ICONS = ["star", "heart", "bolt", "drop", "leaf", "sun", "moon", "crown", "fish", "cat", "bird", "flower", "rocket", "key", "bell", "anchor", null];
  /** A different look per player, as players build them; `colour` is 1 to 12. */
  const lookFor = (i, colour) => ({ colour, skin: SKINS[i % SKINS.length], second: (colour % 12) + 1, plate: i % 3 === 0 ? null : ((colour + 5) % 12) + 1, icon: ICONS[i % ICONS.length] });
  async function join(id, name, colour, i = colour) {
    const { json } = await api(`/api/arenas/${id}/players`, { method: "POST", body: { name, look: lookFor(i, colour) } });
    if (json.playerToken === undefined) throw new Error(`join of ${name} refused: ${JSON.stringify(json)}`);
    return { playerId: json.playerId, playerToken: json.playerToken };
  }
  async function phase(id) {
    return (await api(`/api/arenas/${id}`)).json.phase.kind;
  }
  async function waitPhase(id, kind, timeoutMs = 60_000) {
    const end = Date.now() + timeoutMs;
    while (Date.now() < end) {
      if ((await phase(id)) === kind) return;
      await sleep(400);
    }
    throw new Error(`arena ${id} did not reach ${kind} in ${timeoutMs / 1000} s`);
  }
  const start = (id, cookie) => api(`/api/arenas/${id}/rounds`, { method: "POST", cookie });
  /** A join with an account's session, for an arena only signed-in players may join (75-organiser-tournament.md). */
  async function joinSignedIn(id, name, colour, cookie) {
    const { json } = await api(`/api/arenas/${id}/players`, { method: "POST", cookie, body: { name, look: lookFor(colour, colour) } });
    return { playerId: json.playerId, playerToken: json.playerToken };
  }
  const ready = (id, seat) => api(`/api/arenas/${id}/players/me/ready`, { method: "POST", token: seat.playerToken });
  /**
   * A private arena for players with an account: the owner, `people` more accounts (the first `readyCount` ready), and one
   * account removed with a ban, so the settings list someone kept out. The audit's player is a ready one.
   */
  async function accountArena(kind, people, readyCount) {
    const cookie = await account();
    const id = await arena(cookie, kind, { ticksPerRound: 100, tickMs: 900, botFill: kind === "private", joinPolicy: "account" }, people + 2);
    const ownerSeat = kind === "private" ? await joinSignedIn(id, "Ana", 1, cookie) : null;
    const players = [];
    for (let i = 0; i < people; i++) players.push(await joinSignedIn(id, nameFor(i + 1), (i % 11) + 2, await account()));
    for (const seat of players.slice(0, readyCount)) await ready(id, seat);
    const kept = await joinSignedIn(id, "Kept Out", 12, await account());
    await api(`/api/arenas/${id}/players/${kept.playerId}?ban=1`, { method: "DELETE", cookie });
    return { id, cookie, ownerSeat, players, player: players[0] ?? null };
  }

  /** A private arena: the owner plays too, so the owner has a seat as well as the cookie. */
  async function privateArena(settings, extraPlayers) {
    const cookie = await account();
    const id = await arena(cookie, "private", settings, extraPlayers + 1);
    const ownerSeat = await join(id, "Ana", 1);
    const players = [];
    for (let i = 0; i < extraPlayers; i++) players.push(await join(id, nameFor(i + 1), (i % 11) + 2, i + 1));
    return { id, cookie, ownerSeat, players, player: players[players.length - 1] ?? null };
  }
  async function presenterArena(settings, playerCount) {
    const cookie = await account();
    const id = await arena(cookie, "presenter", settings, playerCount);
    const players = [];
    for (let i = 0; i < playerCount; i++) players.push(await join(id, nameFor(i), (i % 12) + 1, i));
    return { id, cookie, ownerSeat: null, players, player: players[players.length - 1] ?? null };
  }
  /** The ids of the players still in the game. */
  async function stillPlaying(id) {
    const arenaNow = (await api(`/api/arenas/${id}`)).json;
    return new Set(arenaNow.players.filter((p) => p.status.kind === "playing" || p.status.kind === "winner").map((p) => p.id));
  }
  /** After a round, "as player" must be someone still in the game, so the break shows a player who plays on. */
  async function pickSurvivor(fixture) {
    const playing = await stillPlaying(fixture.id);
    const survivor = fixture.players.find((seat) => playing.has(seat.playerId));
    if (survivor === undefined) throw new Error(`no joined player of ${fixture.id} is still in the game`);
    return { ...fixture, player: survivor };
  }
  // A long, slow round for "running" (600 turns of 5 s is 50 minutes, longer than a full audit),
  // and 20 turns of 100 ms for break and finished. Break needs more than 8 players.
  const RUNNING = { ticksPerRound: 600, tickMs: 5000 };
  // 10 tanks keep 8 after the first round (survivorCount), so 2 are out. Every joined player
  // plays the same default play style, so the owner is out in about 2 of 10 draws, and 8
  // attempts all fail with a chance of about 0.2^8, or 3 in a million.
  const BREAK_ATTEMPTS = 8;
  /**
   * Posts chat lines in order. `who` is a seat or "host" (the owner's session). A refusal for speed (5 at once per sender,
   * then 1 every 3 s) waits the server's retryAfterMs and tries again, so a long chat takes some seconds to build.
   */
  async function chat(fixture, lines) {
    for (const [who, text] of lines) {
      for (;;) {
        try {
          await api(`/api/arenas/${fixture.id}/chat`, { method: "POST", body: { text }, ...(who === "host" ? { cookie: fixture.cookie } : { token: who.playerToken }) });
          break;
        } catch (error) {
          const wait = /"retryAfterMs":(\d+)/.exec(String(error.message));
          if (wait === null) throw error;
          await sleep(Number(wait[1]) + 50);
        }
      }
    }
    return fixture;
  }
  const chatOff = async (fixture) => {
    await api(`/api/arenas/${fixture.id}/chat`, { method: "PUT", cookie: fixture.cookie, body: { on: false } });
    return fixture;
  };
  const builders = {
    creator: () => register(),
    // The audit's player is the last seat: lines of the owner, two others, the host and the player itself.
    chatFew: async () => {
      const f = await privateArena({ ticksPerRound: 100, tickMs: 900 }, 3);
      const [budi, citra, me] = f.players;
      return chat(f, [[budi, "Halo semua!"], [citra, "Siap main?"], ["host", "Kita mulai lima menit lagi."], [me, "Aku sudah siap dari tadi"], [f.ownerSeat, "Semoga beruntung!"]]);
    },
    chatFull: async () => {
      const f = await privateArena({ ticksPerRound: 100, tickMs: 900 }, 3);
      const seats = [f.ownerSeat, ...f.players];
      return chat(f, Array.from({ length: 30 }, (_, i) => [seats[i % seats.length], i % 3 === 0 ? `Line ${i + 1}: who brings snacks for the tournament later today?` : `Line ${i + 1}`]));
    },
    // "Bartholomew Kusu" is the tenth name, as long as the name rule allows.
    chatLong: async () => {
      const f = await privateArena({ ticksPerRound: 100, tickMs: 900 }, 9);
      const long = f.players[8];
      return chat(f, [
        [long, "Supercalifragilisticexpialidocious".repeat(4)],
        [f.ownerSeat, "https://example.com/a/very/long/address/without/any/spaces/at/all/in/it"],
        [f.players[0], "This is a long sentence, so it folds onto two or three rows on the narrow screen of a phone."],
        // As long as a line may be (200 characters): it shows at most 4 rows.
        [f.players[1], `${"Who brings the snacks and the drinks for the tournament tonight? ".repeat(3)}Tell me soon!`.slice(0, 200)],
      ]);
    },
    chatOff: async () => chatOff(await privateArena({ ticksPerRound: 100, tickMs: 900 }, 3)),
    presenterChat: async () => {
      const f = await presenterArena({ ticksPerRound: 100, tickMs: 900 }, 4);
      return chat(f, [[f.players[0], "Halo!"], ["host", "Welcome, the game starts in five minutes."], [f.players[1], "Ready!"]]);
    },
    presenterChatOff: async () => chatOff(await presenterArena({ ticksPerRound: 100, tickMs: 900 }, 4)),
    privateLobby: () => privateArena({ ticksPerRound: 100, tickMs: 900 }, 3),
    privateRunning: async () => {
      const f = await privateArena(RUNNING, 2);
      await start(f.id, f.cookie);
      await waitPhase(f.id, "running");
      return f;
    },
    // The server draws the round's seed, so some draws knock the owner out. The break states
    // look at the owner's own seat, so such an arena is closed and the round is played again
    // in a new one (see BREAK_ATTEMPTS).
    privateBreak: async () => {
      for (let attempt = 1; attempt <= BREAK_ATTEMPTS; attempt++) {
        const f = await privateArena({}, 9);
        await start(f.id, f.cookie);
        await waitPhase(f.id, "break");
        const survivors = await stillPlaying(f.id);
        if (survivors.has(f.ownerSeat.playerId) && f.players.some((seat) => survivors.has(seat.playerId))) return pickSurvivor(f);
        log(`fixture privateBreak: attempt ${attempt} knocked out the owner or every joined player, so it is played again`);
        await api(`/api/arenas/${f.id}`, { method: "DELETE", cookie: f.cookie });
      }
      throw new Error(`privateBreak: the owner was knocked out in each of ${BREAK_ATTEMPTS} rounds`);
    },
    privateFinished: async () => {
      const f = await privateArena({}, 2);
      await start(f.id, f.cookie);
      await waitPhase(f.id, "finished");
      return f;
    },
    presenterLobby: () => presenterArena({ ticksPerRound: 100, tickMs: 900 }, 10),
    // The arenas at their capacity (private 64, presenter 512), so the Players panes page.
    privateFull: () => privateArena({ ticksPerRound: 100, tickMs: 900 }, 63),
    privateAccount: () => accountArena("private", 4, 2),
    privateAccount64: async () => {
      const f = await accountArena("private", 4, 2);
      await api(`/api/arenas/${f.id}/settings`, { method: "PATCH", cookie: f.cookie, body: { tankCount: 64 } });
      return f;
    },
    privateScheduled: () => accountArena("private", 4, 2),
    presenterAccount: () => accountArena("presenter", 12, 7),
    // A break with ready marks: 3 of the 8 who went through are ready, and the audit's player is not.
    presenterBreakReady: async () => {
      const f = await presenterArena({}, 10);
      await start(f.id, f.cookie);
      await waitPhase(f.id, "break");
      const playing = await stillPlaying(f.id);
      const through = f.players.filter((seat) => playing.has(seat.playerId));
      for (const seat of through.slice(0, 3)) await ready(f.id, seat);
      return { ...f, player: through[through.length - 1] };
    },
    // One of two players leaves after the owner scheduled the start, so the time comes with too few tanks (about 61 s).
    presenterMissed: async () => {
      const f = await presenterArena({ ticksPerRound: 100, tickMs: 900, botFill: false }, 2);
      await api(`/api/arenas/${f.id}/rounds/schedule`, { method: "POST", cookie: f.cookie, body: { minutes: 1 } });
      await api(`/api/arenas/${f.id}/players/me/leave`, { method: "POST", token: f.players[0].playerToken });
      const end = Date.now() + 75_000;
      while (Date.now() < end && (await api(`/api/arenas/${f.id}`)).json.phase.start?.kind !== "missed") await sleep(1000);
      return { ...f, player: f.players[1] };
    },
    presenterFinished2: async () => {
      const f = await presenterArena({}, 10);
      await start(f.id, f.cookie);
      await waitPhase(f.id, "break");
      await start(f.id, f.cookie);
      await waitPhase(f.id, "finished");
      return f;
    },
    privateRunning64: async () => {
      const f = await privateArena(RUNNING, 63);
      await start(f.id, f.cookie);
      await waitPhase(f.id, "running");
      return f;
    },
    privateBreak64: async () => {
      const f = await privateArena({}, 63);
      await start(f.id, f.cookie);
      await waitPhase(f.id, "break", 120_000);
      return pickSurvivor(f);
    },
    presenterFull: () => presenterArena({ ticksPerRound: 100, tickMs: 900 }, 512),
    // 512 tanks: the running round lasts the whole audit; the break waits for the owner, after a short round
    // (the engine takes about a second per turn at 512 today, so the timeout is long).
    presenterRunning512: async () => {
      const f = await presenterArena(RUNNING, 512);
      await start(f.id, f.cookie);
      await waitPhase(f.id, "running");
      return f;
    },
    presenterBreak512: async () => {
      const f = await presenterArena({}, 512);
      await start(f.id, f.cookie);
      await waitPhase(f.id, "break", 300_000);
      return pickSurvivor(f);
    },
    presenterRunning: async () => {
      const f = await presenterArena(RUNNING, 10);
      await start(f.id, f.cookie);
      await waitPhase(f.id, "running");
      return f;
    },
    presenterBreak: async () => {
      const f = await presenterArena({}, 10);
      await start(f.id, f.cookie);
      await waitPhase(f.id, "break");
      return pickSurvivor(f);
    },
    presenterFinished: async () => {
      const f = await presenterArena({}, 3);
      await start(f.id, f.cookie);
      await waitPhase(f.id, "finished");
      return f;
    },
  };
  /** The phase each arena fixture must still be in when a state is measured. */
  const PHASES = {
    privateLobby: "lobby",
    privateRunning: "running",
    privateBreak: "break",
    privateFinished: "finished",
    presenterLobby: "lobby",
    privateFull: "lobby",
    presenterFull: "lobby",
    presenterRunning: "running",
    presenterBreak: "break",
    presenterFinished: "finished",
    presenterRunning512: "running",
    presenterBreak512: "break",
    chatFew: "lobby",
    chatFull: "lobby",
    chatLong: "lobby",
    chatOff: "lobby",
    presenterChat: "lobby",
    presenterChatOff: "lobby",
    privateAccount: "lobby",
    privateAccount64: "lobby",
    presenterAccount: "lobby",
    privateRunning64: "running",
    presenterMissed: "lobby",
    presenterFinished2: "finished",
    privateBreak64: "break",
  };
  const fixtures = {};
  for (const name of needed) {
    const builder = builders[name];
    if (builder === undefined) throw new Error(`no fixture named ${name}`);
    fixtures[name] = { ...(await builder()), expectPhase: PHASES[name] ?? null };
    log(`fixture ${name}: ${fixtures[name].id ?? "account"}`);
  }
  return fixtures;
}

/** Closes the arenas the audit made, so a reused server keeps no open arenas. */
async function closeFixtures(base, fixtures) {
  const { api } = httpClient(base);
  for (const fixture of Object.values(fixtures)) {
    if (fixture.id === undefined) continue;
    await api(`/api/arenas/${fixture.id}`, { method: "DELETE", cookie: fixture.cookie }).catch(() => undefined);
  }
}

// --- The checks (run inside the page) ----------------------------------------------------

/** Runs in the browser. `kind` is "fit" or "fallback". Returns { a, b, c } lists of problems. */
export function measureInPage(kind) {
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const doc = document.documentElement;
  const describe = (el) => {
    const text = (el.getAttribute("aria-label") || el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 40);
    const cls = typeof el.className === "string" ? el.className.split(/\s+/).filter(Boolean).slice(0, 3).join(".") : "";
    return `${el.tagName.toLowerCase()}${cls ? `.${cls}` : ""}${text ? ` "${text}"` : ""}`;
  };
  const exempt = (el) => el.closest("[data-pager-measure]") !== null;
  const a = [];
  if (doc.scrollWidth > viewportWidth + 1) a.push(`document is ${doc.scrollWidth} px wide in a ${viewportWidth} px viewport`);
  if (kind === "fit" && doc.scrollHeight > viewportHeight + 1) a.push(`document is ${doc.scrollHeight} px tall in a ${viewportHeight} px viewport`);

  const b = [];
  const scrolls = (value) => value === "auto" || value === "scroll";
  for (const el of document.body.querySelectorAll("*")) {
    if (el.tagName === "TEXTAREA" || exempt(el)) continue;
    const style = getComputedStyle(el);
    if (scrolls(style.overflowX) && el.scrollWidth > el.clientWidth + 1) b.push(`${describe(el)} scrolls sideways (${el.scrollWidth} > ${el.clientWidth})`);
    if (kind === "fit" && scrolls(style.overflowY) && el.scrollHeight > el.clientHeight + 1) b.push(`${describe(el)} scrolls (${el.scrollHeight} > ${el.clientHeight})`);
  }

  const c = [];
  const CONTROL = 'a[href], button, input, select, textarea, summary, [role="button"], [role="tab"], [role="switch"], [role="radio"], [role="checkbox"], [role="slider"], [role="option"], [role="combobox"]';
  const hides = (value) => value === "hidden" || value === "clip";
  for (const el of document.body.querySelectorAll("*")) {
    const tag = el.tagName.toLowerCase();
    if (el.closest("svg") !== null && tag !== "svg") continue;
    if (exempt(el)) continue;
    const isControl = el.matches(CONTROL);
    const hasText = Array.from(el.childNodes).some((node) => node.nodeType === 3 && node.textContent.trim() !== "");
    if (!isControl && !hasText && tag !== "svg") continue;
    const style = getComputedStyle(el);
    if (style.visibility !== "visible" || style.display === "none") continue;
    const box = el.getBoundingClientRect();
    // Screen-reader-only text is a 1 px box on purpose.
    if (box.width <= 1 || box.height <= 1) continue;
    let problem = null;
    let srOnly = false;
    for (let parent = el.parentElement; parent !== null && parent !== document.body; parent = parent.parentElement) {
      const parentStyle = getComputedStyle(parent);
      const parentBox = parent.getBoundingClientRect();
      if (parentBox.width <= 1 || parentBox.height <= 1) {
        srOnly = true;
        break;
      }
      const clipX = hides(parentStyle.overflowX) && parentStyle.textOverflow !== "ellipsis";
      const clipY = hides(parentStyle.overflowY);
      if (clipX || clipY) {
        const left = parentBox.left + parent.clientLeft;
        const top = parentBox.top + parent.clientTop;
        const right = left + parent.clientWidth;
        const bottom = top + parent.clientHeight;
        if (clipX && (box.left < left - 1 || box.right > right + 1)) problem = `${describe(el)} is cut at the side by ${describe(parent)}`;
        if (clipY && (box.top < top - 1 || box.bottom > bottom + 1)) problem = `${describe(el)} is cut at the ${box.bottom > bottom + 1 ? "bottom" : "top"} by ${describe(parent)}`;
        if (problem !== null) break;
      }
      if (parentStyle.position === "fixed") break;
    }
    if (srOnly) continue;
    if (problem === null && box.right > viewportWidth + 1) problem = `${describe(el)} runs past the right edge of the viewport`;
    if (problem === null && kind === "fit" && (box.bottom > viewportHeight + 1 || box.top < -1)) problem = `${describe(el)} is outside the viewport height`;
    if (problem !== null) c.push(problem);
  }
  const unique = (list) => [...new Set(list)].slice(0, 8);
  return { a: unique(a), b: unique(b), c: unique(c) };
}

/**
 * Runs in the browser: the overlap rule (d). A control is covered when the element at its centre
 * point is neither the control, nor inside it, nor its label. Disabled controls, Pager's measuring
 * copies, controls outside the viewport and controls under an open modal dialog are not checked.
 * A tour's callout or pill may cover a control for its step, except one in the bottom bar.
 */
export function overlapInPage() {
  const describe = (el) => {
    const text = (el.getAttribute("aria-label") || el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 32);
    const hook = [...el.attributes].map((a) => a.name).find((name) => name.startsWith("data-")) ?? "";
    return `${el.tagName.toLowerCase()}${hook ? `[${hook}]` : ""}${text ? ` "${text}"` : ""}`;
  };
  const modal = [...document.querySelectorAll("dialog[open]")].at(-1) ?? null;
  const out = [];
  for (const el of document.body.querySelectorAll("button, a[href], input, select, textarea")) {
    if (el.closest("[data-pager-measure]") !== null) continue;
    if (el.disabled === true || el.getAttribute("aria-disabled") === "true") continue;
    if (modal !== null && !modal.contains(el)) continue;
    if (typeof el.checkVisibility === "function" && !el.checkVisibility({ visibilityProperty: true, opacityProperty: true })) continue;
    const box = el.getBoundingClientRect();
    if (box.width <= 1 || box.height <= 1) continue;
    const x = box.left + box.width / 2;
    const y = box.top + box.height / 2;
    if (x < 0 || y < 0 || x >= window.innerWidth || y >= window.innerHeight) continue;
    const hit = document.elementFromPoint(x, y);
    if (hit === null || hit === el || el.contains(hit)) continue;
    const label = hit.closest("label");
    if (label !== null && (label.control === el || label.contains(el))) continue;
    if (el.labels !== undefined && el.labels !== null && [...el.labels].some((l) => l.contains(hit))) continue;
    if (hit.closest("[data-coach-callout], [data-coach-pill]") !== null && el.closest("[data-shell-bottom]") === null) continue;
    out.push(`${describe(el)} is covered by ${describe(hit)}`);
  }
  return [...new Set(out)].slice(0, 8);
}

/**
 * Runs in the browser: a tour state shows its coach mark (`expect` "callout") or its where-to-go pill ("pill"), the
 * callout leaves its target's ring free, and neither meets a box of `keepClear` (the selector KEEP_CLEAR).
 */
export function tourInPage({ expect, keepClear }) {
  const problems = [];
  const meets = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
  const keepClearProblems = (mark) => {
    const box = mark.getBoundingClientRect();
    const out = [];
    for (const element of document.querySelectorAll(keepClear)) {
      if (mark.contains(element) || element.contains(mark)) continue;
      const other = element.getBoundingClientRect();
      if (other.width <= 1 || other.height <= 1) continue;
      const hook = [...element.attributes].map((a) => a.name).find((name) => name.startsWith("data-")) ?? element.tagName.toLowerCase();
      if (meets(box, other)) out.push(`the ${mark.hasAttribute("data-coach-pill") ? "pill" : "callout"} covers [${hook}]`);
    }
    return out;
  };
  const callout = document.querySelector("[data-coach-callout]");
  if (expect === "pill") {
    const pill = document.querySelector("[data-coach-pill]");
    if (pill === null) problems.push("no where-to-go pill shows");
    else problems.push(...keepClearProblems(pill));
    return problems;
  }
  if (callout === null) return ["no coach callout shows"];
  problems.push(...keepClearProblems(callout));
  const ring = document.querySelector("[data-coach-ring]");
  if (ring === null) return ["the callout shows without its ring"];
  const c = callout.getBoundingClientRect();
  const r = ring.getBoundingClientRect();
  if (c.left < r.right && r.left < c.right && c.top < r.bottom && r.top < c.bottom) problems.push("the callout covers its target");
  if (c.left < 0 || c.top < 0 || c.right > window.innerWidth || c.bottom > window.innerHeight) problems.push("the callout leaves the screen");
  return problems;
}

/** Runs in the browser: rule (f). The last visible element of each selector lies inside the viewport. */
export function inViewInPage(selectors) {
  const problems = [];
  for (const selector of selectors) {
    const shown = [...document.querySelectorAll(selector)].filter((el) => el.closest("[data-pager-measure]") === null && el.getClientRects().length > 0);
    const el = shown.at(-1);
    if (el === undefined) {
      problems.push(`nothing shows for ${selector}`);
      continue;
    }
    const box = el.getBoundingClientRect();
    if (box.top < -1 || box.bottom > window.innerHeight + 1 || box.left < -1 || box.right > window.innerWidth + 1) {
      problems.push(`the last ${selector} is outside the viewport (top ${Math.round(box.top)}, bottom ${Math.round(box.bottom)} of ${window.innerHeight})`);
    }
  }
  return problems;
}

/** Runs in the browser: only horizontal overflow, for the width sweep. */
function horizontalOverflowInPage() {
  return document.documentElement.scrollWidth > window.innerWidth + 1 ? `document is ${document.documentElement.scrollWidth} px wide in ${window.innerWidth}` : null;
}

// --- Running the states ------------------------------------------------------------------

async function prepareContext(browser, base, state, lang, fixtures) {
  const context = await browser.newContext({
    viewport: { width: sizesFor(state)[0].width, height: sizesFor(state)[0].height },
    // Reduced motion: entrance animations start offset (roll-in, rise), which would read as cut off.
    reducedMotion: "reduce",
    extraHTTPHeaders: { "X-Forwarded-For": httpClient(base).nextAddress() },
  });
  const fixture = state.fixture === undefined ? null : fixtures[state.fixture];
  const creator = fixtures.creator ?? null;
  const cookie = state.as === "owner" ? fixture?.cookie : state.as === "creator" ? creator?.cookie : null;
  if (cookie) {
    const [name, ...value] = cookie.split("=");
    await context.addCookies([{ name, value: value.join("="), url: base }]);
  }
  const seat = state.as === "owner" ? fixture?.ownerSeat : state.as === "player" ? fixture?.player : null;
  // Every tour starts finished, so no coach mark covers a screen; a tour state sets its own tours (65-guidance.md).
  const storage = { "algotank:language": lang, "algotank:tours": JSON.stringify({ ...ALL_TOURS_FINISHED, ...(state.tours ?? {}) }) };
  if (state.returning) storage["algotank:finished-game"] = "1";
  if (seat && fixture) storage[`arena:${fixture.id}:player-session`] = JSON.stringify(seat);
  if (state.seedWorkshop) {
    const seed = workshopSeedScript(state.seedWorkshop, state.seedBroken);
    storage[seed.key] = seed.value;
  }
  // Written once per context, so a step that changes storage (a language switch) is not undone by a reload.
  await context.addInitScript((entries) => {
    if (sessionStorage.getItem("audit-storage") !== null) return;
    for (const [key, value] of Object.entries(entries)) localStorage.setItem(key, value);
    sessionStorage.setItem("audit-storage", "1");
  }, storage);
  return context;
}

/** A fixed answer; `body` may be a function of the request's address. */
function mockAnswer(mock, route) {
  const body = typeof mock.body === "function" ? mock.body(route.request().url()) : mock.body;
  return { status: mock.status ?? 200, contentType: "application/json", body: JSON.stringify(body) };
}

async function runSteps(page, steps, fixtures) {
  for (const step of steps ?? []) {
    if (step.route) {
      await page.route(step.route, (route) => route.fulfill(mockAnswer(step, route)));
    } else if (step.click) await page.locator(step.click).first().click({ timeout: 5000 });
    else if (step.fill) await page.locator(step.fill).first().fill(typeof step.value === "function" ? step.value(fixtures) : step.value, { timeout: 5000 });
    else if (step.wait) await page.locator(step.wait).first().waitFor({ timeout: 8000 });
    else if (step.press) await page.keyboard.press(step.press);
    else if (step.ownerFetch) {
      // A request with the page's own session (the owner's cookie), such as a scheduled start the state shows.
      const request = step.ownerFetch(fixtures);
      const status = await page.evaluate(async (r) => (await fetch(r.path, { method: r.method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(r.body) })).status, request);
      if (status >= 400) throw new Error(`${request.method} ${request.path} answered ${status}`);
    }
    else if (step.pageToEnd) {
      // Next until the last page of a Pager. Next is aria-disabled there, which Playwright treats as disabled.
      const next = page.locator(step.pageToEnd).first();
      for (let i = 0; i < 40 && (await next.count()) > 0 && (await next.getAttribute("aria-disabled")) !== "true"; i++) await next.click({ timeout: 5000 });
    }
    await sleep(150);
  }
}

async function settle(page) {
  await page.evaluate(() => document.fonts.ready);
  // Two frames for ResizeObserver work (Pager, useFitDetail) to finish.
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await sleep(250);
}

const fileName = (state, lang, size) => `${state.screen}--${state.state}--${lang}--${size}.png`.replace(/[^a-z0-9.\-]/gi, "_");

async function auditState(browser, base, out, state, fixtures, log) {
  const results = [];
  for (const lang of LANGUAGES) {
    const context = await prepareContext(browser, base, state, lang, fixtures);
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    let unreachable = null;
    const fixture = state.fixture === undefined ? null : fixtures[state.fixture];
    if (fixture?.expectPhase) {
      // A fixture that moved on (a round that ended, an arena that closed) would measure the wrong screen.
      const now = await httpClient(base).api(`/api/arenas/${fixture.id}`).then((r) => r.json.phase.kind, (error) => `gone (${error.message})`);
      if (now !== fixture.expectPhase) unreachable = `arena ${fixture.id} is in phase ${now}, expected ${fixture.expectPhase}`;
    }
    try {
      if (unreachable !== null) throw new Error(unreachable);
      for (const mock of state.mock ?? []) await page.route(mock.route, (route) => route.fulfill(mockAnswer(mock, route)));
      await page.goto(base + state.path(fixtures), { waitUntil: "load" });
      await settle(page);
      await runSteps(page, state.steps, fixtures);
    } catch (error) {
      unreachable = String(error.message).split("\n")[0];
    }
    for (const [sizeIndex, size] of sizesFor(state).entries()) {
      await page.setViewportSize({ width: size.width, height: size.height });
      if (state.perSize && sizeIndex > 0 && unreachable === null) {
        // An open picker belongs to the layout it was opened in: a screen that swaps its panes at the laptop width
        // unmounts it. Such a state is reached again at every size.
        try {
          await page.goto(base + state.path(fixtures), { waitUntil: "load" });
          await settle(page);
          await runSteps(page, state.steps, fixtures);
        } catch (error) {
          unreachable = String(error.message).split("\n")[0];
        }
      }
      await settle(page);
      const shot = join(out, fileName(state, lang, size.name));
      await page.screenshot({ path: shot, fullPage: true });
      const found = unreachable === null ? await page.evaluate(measureInPage, size.kind) : { a: [], b: [], c: [] };
      const overlap = unreachable === null && size.kind === "fit" ? await page.evaluate(overlapInPage) : [];
      const tour = unreachable === null && state.tour !== undefined ? await page.evaluate(tourInPage, { expect: state.tour, keepClear: KEEP_CLEAR }) : [];
      const inView = unreachable === null && state.inView !== undefined ? await page.evaluate(inViewInPage, state.inView) : [];
      const failures = [];
      if (unreachable !== null) failures.push(`unreachable: ${unreachable}`);
      for (const rule of ["a", "b", "c"]) for (const problem of found[rule]) failures.push(`(${rule}) ${problem}`);
      for (const problem of overlap) failures.push(`(d) ${problem}`);
      for (const problem of tour) failures.push(`(e) ${problem}`);
      for (const problem of inView) failures.push(`(f) ${problem}`);
      results.push({ screen: state.screen, state: state.state, owner: state.owner, lang, size: size.name, pass: failures.length === 0, failures, shot });
    }
    if (state.sweep && unreachable === null) {
      const sweepFailures = [];
      for (let width = SWEEP.from; width <= SWEEP.to; width += SWEEP.step) {
        await page.setViewportSize({ width, height: SWEEP.height });
        await settle(page);
        const problem = await page.evaluate(horizontalOverflowInPage);
        if (problem !== null) sweepFailures.push(`(sweep ${width}px) ${problem}`);
      }
      results.push({ screen: state.screen, state: state.state, owner: state.owner, lang, size: "sweep", pass: sweepFailures.length === 0, failures: sweepFailures, shot: null });
    }
    if (errors.length > 0) log(`  page errors in ${state.screen}/${state.state} ${lang}: ${errors.slice(0, 3).join(" | ")}`);
    await context.close();
  }
  const failed = results.filter((r) => !r.pass).length;
  log(`${failed === 0 ? "pass" : "FAIL"} ${state.owner} ${state.screen}/${state.state} (${results.length - failed}/${results.length})`);
  return results;
}

// K2 (81-metrics.md): the player's statistics card. After a round and a game in the room's "My tank" pane (the
// room harness, and a real private arena whose round the fixture played, so the card comes from the server's stream);
// after a Try it match; in the monthly league's "Your tank"; and the account's totals on "My tank". The owner's laptop
// size is checked too. The card's pane is a tab on a phone and the side column's switch (a radio) on a laptop.
const statsTab = { click: '[data-tab="mytank"], label:has(> input[type="radio"][value="mytank"])' };
const STATS_SIZES = [...APP_SIZE_NAMES, "1728x1000"];
const statsState = (state, rest) => ({ screen: "stats", state, owner: "K2", as: "visitor", sizes: STATS_SIZES, ...rest });
const ACCOUNT_STATS = {
  stats: {
    total: { games: 14, rounds: 41, wins: 3, shots: 512, hits: 187 },
    months: ["2026-06", "2026-07", "2026-08", "2026-09", "2026-10", "2026-11"].map((month, i) => ({ month, games: i + 1, rounds: [3, 5, 9, 4, 12, 8][i], wins: i % 2, shots: 40 + i * 10, hits: 15 + i * 3 })),
  },
};
STATES.push(
  ...[
    ["break-card", "kind=tournament&phase=break&stats=1"],
    ["break-card-quiet", "kind=tournament&phase=break&stats=quiet"],
    ["break-out-card", "kind=tournament&phase=break&status=out&stats=1"],
    ["result-card", "kind=practice&phase=finished&stats=quiet"],
    ["tournament-result-card", "kind=tournament&phase=finished&stats=1"],
  ].map(([state, query]) => statsState(state, { path: () => `/kit?show=room&${query}`, perSize: true, steps: [{ wait: "[data-room-pane]" }, statsTab, { wait: "[data-stats-card]" }] })),
  statsState("break-card-ranking", { path: () => "/kit?show=room&kind=tournament&phase=break&stats=1", steps: [{ wait: "[data-room-pane]" }] }),
  statsState("room-break-real", { path: (f) => `/a/${f.privateBreak.id}`, as: "player", fixture: "privateBreak", perSize: true, steps: [{ wait: "[data-room-pane]" }, statsTab, { wait: "[data-stats-card]" }] }),
  statsState("room-break-owner", { path: (f) => `/a/${f.privateBreak.id}`, as: "owner", fixture: "privateBreak", perSize: true, steps: [{ wait: "[data-room-pane]" }, statsTab, { wait: "[data-stats-card]" }] }),
  statsState("room-break-owner-result", { path: (f) => `/a/${f.privateBreak.id}`, as: "owner", fixture: "privateBreak", steps: [{ wait: "[data-room-pane]" }] }),
  statsState("account-tank-part", { path: () => "/my-tank", as: "creator", steps: [{ wait: "[data-mytank-part]" }] }),
  statsState("room-finished-real", { path: (f) => `/a/${f.privateFinished.id}`, as: "player", fixture: "privateFinished", perSize: true, steps: [{ wait: "[data-room-pane]" }, statsTab, { wait: "[data-stats-card]" }] }),
  statsState("try-it-card", {
    path: () => "/kit?show=board&pane=test&rules=quiet",
    steps: [{ click: "[data-test-run]" }, { click: "[data-test-show-result]" }, { wait: "[data-test-result]" }, { click: '[data-test-result] label:has(> input[type="radio"][value="stats"])' }, { wait: "[data-test-stats] [data-stats-card]" }],
  }),
  statsState("monthly-card", {
    path: () => "/kit?show=monthly&case=seated&tab=mine&side=mine",
    sizes: MONTHLY_SIZES,
    perSize: true,
    steps: [{ wait: "[data-monthly-page]" }, { click: '[data-own-part] label:has(> input[type="radio"][value="stats"])' }, { wait: "[data-stats-card]" }],
  }),
  statsState("account", {
    path: () => "/my-tank",
    as: "creator",
    mock: [{ route: "**/api/account/stats", status: 200, body: ACCOUNT_STATS }],
    steps: [{ click: '[data-mytank-part] label:has(> input[type="radio"][value="stats"])' }, { wait: "[data-account-stats]" }],
  }),
  statsState("account-empty", {
    path: () => "/my-tank",
    as: "creator",
    steps: [{ click: '[data-mytank-part] label:has(> input[type="radio"][value="stats"])' }, { wait: "[data-account-stats]" }],
  }),
);

function table(results) {
  const columns = [...new Set(results.map((r) => `${r.size} ${r.lang}`))];
  const rows = new Map();
  for (const r of results) {
    const key = `${r.owner} | ${r.screen}/${r.state}`;
    if (!rows.has(key)) rows.set(key, {});
    rows.get(key)[`${r.size} ${r.lang}`] = r.pass ? "pass" : "FAIL";
  }
  const header = `| owner | state | ${columns.join(" | ")} |`;
  const line = `|---|---|${columns.map(() => "---").join("|")}|`;
  const body = [...rows].map(([key, cells]) => `| ${key} | ${columns.map((c) => cells[c] ?? "").join(" | ")} |`);
  return [header, line, ...body].join("\n");
}

/** The "screen/state" names that more than one state uses. */
export function duplicateStateNames(states) {
  const seen = new Set();
  const twice = new Set();
  for (const state of states) {
    const name = `${state.screen}/${state.state}`;
    if (seen.has(name)) twice.add(name);
    seen.add(name);
  }
  return [...twice];
}

async function main() {
  const [base, out, filter] = process.argv.slice(2);
  if (!base || !out) {
    console.error("Usage: bun run audit -- <base-url> <output-folder> [screen or screen/state, ...]   (in apps/web; PLAYWRIGHT=<path to @playwright/test/index.mjs> uses another Playwright)");
    process.exit(2);
  }
  // apps/web's own dev dependency by default; PLAYWRIGHT points at another installation, for example one whose browsers are already downloaded.
  const playwrightPath = process.env.PLAYWRIGHT || "@playwright/test";
  const duplicates = duplicateStateNames(STATES);
  if (duplicates.length > 0) {
    console.error(`Each state needs its own name, so its screenshots and results are not mixed up. Defined more than once: ${duplicates.join(", ")}`);
    process.exit(2);
  }
  // A name is a screen ("room") or one state of it ("room/lobby-owner-players").
  const names = filter ? new Set(filter.split(",").map((s) => s.trim()).filter(Boolean)) : null;
  const states = STATES.filter((s) => names === null || names.has(s.screen) || names.has(`${s.screen}/${s.state}`));
  if (states.length === 0) {
    console.error(`No state matches "${filter}". Screens: ${[...new Set(STATES.map((s) => s.screen))].join(", ")}`);
    process.exit(2);
  }
  mkdirSync(out, { recursive: true });
  const log = (line) => console.log(line);
  const { chromium } = await import(playwrightPath);
  const baseUrl = base.replace(/\/$/, "");
  const needed = new Set(states.map((s) => s.fixture).filter((f) => f !== undefined));
  if (states.some((s) => s.as === "creator")) needed.add("creator");
  const fixtures = await makeFixtures(baseUrl, [...needed], log);
  // Node strips the types of the engine's TypeScript file itself (Node 23.6 and later).
  if (states.some((s) => s.seedWorkshop)) seedPresets = (await import(new URL("../../../packages/engine/src/strategy/presets.ts", import.meta.url).href)).PRESETS;
  const browser = await chromium.launch();
  const results = [];
  try {
    for (const state of states) results.push(...(await auditState(browser, baseUrl, out, state, fixtures, log)));
  } finally {
    await browser.close();
    await closeFixtures(baseUrl, fixtures);
  }
  const markdown = table(results);
  const failures = results.filter((r) => !r.pass);
  const details = failures.map((r) => `- ${r.screen}/${r.state} ${r.lang} ${r.size}: ${r.failures.join("; ")}`).join("\n");
  writeFileSync(join(out, "results.json"), JSON.stringify(results, null, 2));
  writeFileSync(join(out, "results.md"), `${markdown}\n\n## Failures\n\n${details || "None."}\n`);
  console.log(`\n${markdown}\n`);
  console.log(`${results.length - failures.length} of ${results.length} checks pass. Details: ${join(out, "results.md")}`);
  process.exitCode = failures.length === 0 ? 0 : 1;
}

// Importing the file (for SIZES or STATES) does not start an audit.
if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
