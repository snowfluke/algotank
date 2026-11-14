/// <reference types="bun" />
// The time budget of the timed public phases (docs/specs/revamp/73-after-first-timer-test.md,
// row 7), like the tours' budget in guide/tours.test.ts: the sentences a phase shows must be
// readable before it ends. Reading takes 4 s plus 0.5 s per word, and a phase keeps 5 s free,
// so a phase of S seconds holds at most 2 * (S - 9) words.
//
// What counts: the sentences (p, h1, h2) of the status line, of the pane a phone opens on
// (the result after a game or a round; in a lobby the Tank pane, which stays in every phase,
// is preparation and not counted), and of the bottom bar's action. Labels are not sentences
// and are not counted: the clock's label ("Next game"), a list's heading ("Top three") and
// the rows of a ranking (names and numbers). The name of an action is not a sentence either and
// is not counted: the "I'm ready" button, and the "Other arenas" link that every public result
// shows in the status line (publicplay/OtherArenasLink.tsx). The player reads such a name when
// they look for the action, not as part of what the phase tells them, so its words never go in a
// p, h1 or h2; the last test checks that the link is there on every result and nowhere else. The server render draws every optional
// detail (useFitDetail's level 0), so this is the most a phase can show. A laptop adds only
// the ranking pane's heading beside the result. Phase lengths: apps/server/src/public-kinds.ts.
//
// | Phase                         | Seconds | Words at most |
// |-------------------------------|---------|---------------|
// | practice and monthly lobby    | 30      | 42            |
// | tournament lobby              | 60      | 102           |
// | tournament break              | 20      | 22            |
// | practice and monthly result   | 20      | 22            |
// | tournament result             | 30      | 42            |
//
// The round (54 or 81 s) is left out: the harness has no running phase, and its sentences are
// the first-round tour's, which guide/tours.test.ts budgets.

import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { PHASE_MARGIN_SECONDS, PUBLIC_PHASE_SECONDS, readingSeconds } from "../guide/tours.ts";
import { I18nProvider } from "../i18n/I18nProvider.tsx";
import { createLanguageStore, type Language } from "../i18n/language.ts";
import { ToastProvider } from "../ui/Toast.tsx";
import { HarnessRoom, type HarnessOptions } from "./RoomHarness.tsx";

const VOID = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"]);
const SENTENCE_TAGS = new Set(["p", "h1", "h2"]);
const TOKEN = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)([^>]*?)(\/?)>|([^<]+)/g;
const ENTITIES: Readonly<Record<string, string>> = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#x27;": "'", "&nbsp;": " " };

interface Frame {
  readonly tag: string;
  /** Inside a region this test reads. */
  readonly region: boolean;
  /** Inside something a person does not see: aria-hidden, sr-only, a drawing. */
  readonly hidden: boolean;
  /** The text of the sentence element this frame opened, or null. */
  readonly sentence: string[] | null;
}

/** Sentences and headings inside the elements that carry one of `regions` (an attribute name), as a person sees them. */
function shownSentences(html: string, regions: readonly string[]): string[] {
  const out: string[] = [];
  const stack: Frame[] = [{ tag: "", region: false, hidden: false, sentence: null }];
  for (const match of html.matchAll(TOKEN)) {
    const [, closing, rawTag, attributes = "", selfClosing, text] = match;
    const top = stack[stack.length - 1]!;
    if (text !== undefined) {
      if (top.region && !top.hidden) {
        const open = [...stack].reverse().find((frame) => frame.sentence !== null);
        open?.sentence?.push(text.replace(/&[#a-z0-9]+;/gi, (entity) => ENTITIES[entity] ?? entity));
      }
      continue;
    }
    const tag = (rawTag ?? "").toLowerCase();
    if (closing === "/") {
      const frame = stack.pop();
      const words = frame?.sentence?.join("").trim();
      if (words !== undefined && words !== "") out.push(words.replace(/\s+/g, " "));
      continue;
    }
    if (VOID.has(tag) || selfClosing === "/") continue;
    const region = top.region || regions.some((name) => new RegExp(`\\s${name}=`).test(attributes));
    // The clock is a label and a time, read at a glance, not a sentence.
    const hidden = top.hidden || tag === "svg" || /aria-hidden="true"/.test(attributes) || /class="[^"]*\bsr-only\b/.test(attributes) || /\sdata-countdown-clock=/.test(attributes);
    stack.push({ tag, region, hidden, sentence: region && !hidden && SENTENCE_TAGS.has(tag) && !stack.some((frame) => frame.sentence !== null) ? [] : null });
  }
  return out;
}

function render(language: Language, options: HarnessOptions): string {
  return renderToStaticMarkup(
    <I18nProvider store={createLanguageStore({ store: null, initial: language })}>
      <ToastProvider>
        <HarnessRoom options={options} firstResult={false} />
      </ToastProvider>
    </I18nProvider>,
  );
}

interface PhaseCase {
  readonly name: string;
  readonly seconds: number;
  readonly options: HarnessOptions;
  /** The pane a phone opens on, whose sentences count. */
  readonly pane: "result" | null;
}

const base = { humans: 5, ready: false, out: false, winner: "person" } as const;
const P = PUBLIC_PHASE_SECONDS;
const CASES: readonly PhaseCase[] = [
  { name: "practice lobby", seconds: P.practice.lobby, options: { ...base, kind: "practice", phase: "lobby" }, pane: null },
  { name: "practice lobby, ready", seconds: P.practice.lobby, options: { ...base, kind: "practice", phase: "lobby", ready: true }, pane: null },
  { name: "tournament lobby", seconds: P.tournament.lobby, options: { ...base, kind: "tournament", phase: "lobby", humans: 20 }, pane: null },
  { name: "tournament break, through", seconds: P.tournament.break, options: { ...base, kind: "tournament", phase: "break", humans: 20 }, pane: "result" },
  { name: "tournament break, out", seconds: P.tournament.break, options: { ...base, kind: "tournament", phase: "break", humans: 20, out: true }, pane: "result" },
  { name: "practice result", seconds: P.practice.result, options: { ...base, kind: "practice", phase: "finished" }, pane: "result" },
  { name: "practice result, ready", seconds: P.practice.result, options: { ...base, kind: "practice", phase: "finished", ready: true }, pane: "result" },
  { name: "practice result, won", seconds: P.practice.result, options: { ...base, kind: "practice", phase: "finished", winner: "me" }, pane: "result" },
  { name: "tournament result, a bot won", seconds: P.tournament.result, options: { ...base, kind: "tournament", phase: "finished", winner: "bot" }, pane: "result" },
  { name: "tournament result, won", seconds: P.tournament.result, options: { ...base, kind: "tournament", phase: "finished", humans: 20, winner: "me" }, pane: "result" },
  { name: "tournament result", seconds: P.tournament.result, options: { ...base, kind: "tournament", phase: "finished", humans: 20 }, pane: "result" },
];

/** What the phase shows, as one text: one 4 s start per phase, then half a second per word. */
function phaseText(language: Language, phase: PhaseCase): string[] {
  const regions = ["data-status-line", "data-ready-bar", ...(phase.pane === null ? [] : [`data-result-pane`])];
  return shownSentences(render(language, phase.options), regions);
}

describe("the text of a timed public phase fits its length minus 5 s (4 s plus 0.5 s per word)", () => {
  test("the reader finds the sentences of a region and skips what a person does not see", () => {
    const html = '<div data-status-line=""><h2>Two words</h2><p>Three <b>more</b> words<span class="sr-only">hidden</span></p><h3>Label</h3><p data-countdown-clock=""><span>Next game</span></p><svg><text>no</text></svg></div><p>outside</p>';
    expect(shownSentences(html, ["data-status-line"])).toEqual(["Two words", "Three more words"]);
  });

  test('every public result has the "Other arenas" link in its status line, and a lobby or a break has none', () => {
    for (const phase of CASES) {
      const html = render("en", phase.options);
      expect({ phase: phase.name, link: html.includes("data-other-arenas") }).toEqual({ phase: phase.name, link: phase.options.phase === "finished" });
    }
  });

  for (const language of ["en", "id"] as const) {
    for (const phase of CASES) {
      test(`${language}: ${phase.name} (${phase.seconds} s)`, () => {
        const sentences = phaseText(language, phase);
        expect(sentences.length).toBeGreaterThan(0);
        const seconds = readingSeconds(sentences.join(" "));
        expect({ sentences, seconds: seconds <= phase.seconds - PHASE_MARGIN_SECONDS }).toEqual({ sentences, seconds: true });
      });
    }
  }
});
