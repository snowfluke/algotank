/// <reference types="bun" />
import { plainTankLook } from "@game/arena";
import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { ArenaPhase, PublicArena, PublicSnapshot, RuleSetMode } from "@game/arena";
import { I18nProvider } from "../i18n/I18nProvider.tsx";
import { createLanguageStore } from "../i18n/language.ts";
import { arenaIn, snapshotAt } from "../stream/fixtures.ts";
import { LiveRound } from "./LiveRound.tsx";

const phase = {
  kind: "running",
  round: 2,
  isFinal: false,
  seed: 1,
  ruleSetId: "dry-spell",
  playerIds: ["a", "b", "c"],
  survivorsAfterRound: 2,
} as const satisfies ArenaPhase;

const bot = (id: string, score: number) => ({
  id,
  x: 0,
  y: 0,
  direction: "N" as const,
  score,
  wasHit: false,
  build: { reach: 0, aim: 0, dodge: 0 },
  hitsLanded: 0,
  hitsTaken: 0,
  water: 6,
});

function arena(mode: RuleSetMode): PublicArena {
  return {
    ...arenaIn(phase, mode),
    players: [
      { id: "a", name: "Ana", status: { kind: "playing" }, isBot: false, ready: false, look: plainTankLook(1) },
      { id: "b", name: "Bo", status: { kind: "playing" }, isBot: false, ready: false, look: plainTankLook(2) },
      { id: "c", name: "Cy", status: { kind: "playing" }, isBot: true, ready: false, look: plainTankLook(3) },
    ],
  };
}

const snapshot: PublicSnapshot = { ...snapshotAt(10), ruleSetId: "dry-spell", survivorsAfterRound: 2, bots: [bot("a", 1), bot("b", 4), bot("c", 2)] };

function render(mode: RuleSetMode, options: { isFinal?: boolean; language?: "en" | "id"; snap?: PublicSnapshot | null } = {}): string {
  const tree = (
    <LiveRound
      arena={arena(mode)}
      phase={{ ...phase, isFinal: options.isFinal ?? false }}
      snapshot={options.snap === undefined ? snapshot : options.snap}
      throws={[]}
      layout="narrow"
    />
  );
  return renderToStaticMarkup(
    options.language === "id" ? <I18nProvider store={createLanguageStore({ store: null, initial: "id" })}>{tree}</I18nProvider> : tree,
  );
}

const heading = (html: string) => /<h1[^>]*>([^<]*)<\/h1>/.exec(html)?.[1] ?? "";

describe("LiveRound", () => {
  test("the heading names the round, and the rules only in an arena that changes them", () => {
    expect(heading(render("announced"))).toBe("Round 2: Dry spell");
    expect(heading(render("standard"))).toBe("Round 2");
    expect(heading(render("standard", { isFinal: true }))).toBe("Final");
  });

  test("the big screen has no tank of its own, so it shows no own status and marks no row", () => {
    const html = render("standard");
    expect(html).not.toContain("You are");
    expect(html).not.toContain('aria-current="true"');
  });

  test("the ranking labels the cut line in words and marks bots", () => {
    const html = render("standard");
    expect(html).toContain("Top 2 go through");
    expect(html).toContain(">Bot<");
    expect(html).not.toContain("border-l-");
  });

  test("Indonesian text in Indonesian", () => {
    const html = render("standard", { language: "id" });
    expect(heading(html)).toBe("Ronde 2");
    expect(html).toContain("2 teratas lolos");
  });

  test("before the first snapshot it says the round is about to start", () => {
    expect(render("standard", { snap: null })).toContain("The round is about to start.");
  });
});
