/// <reference types="bun" />
import { plainTankLook } from "@game/arena";
import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { ruleSet } from "@game/engine";
import type { BotState, Snapshot, ThrowEvent } from "@game/engine";
import { I18nProvider } from "../i18n/I18nProvider.tsx";
import { createLanguageStore } from "../i18n/language.ts";
import { ArenaBoard } from "./ArenaBoard.tsx";
import { botLabels } from "./botLabels.ts";
import { Scoreboard } from "./Scoreboard.tsx";

const standard = ruleSet("standard");

function bot(i: number, over: Partial<BotState> = {}): BotState {
  return {
    id: `p${i}`,
    x: i % 4,
    y: Math.floor(i / 4) * 2,
    direction: "E",
    score: 10 - i,
    wasHit: false,
    lastHitBy: null,
    ticksSinceHit: null,
    lastMove: null,
    modeId: "m",
    build: {},
    ticksInMode: 0,
    water: standard.waterCapacity,
    hitsLanded: 0,
    hitsTaken: 0,
    ticksSinceLandedHit: null,
    item: null,
    itemUses: 0,
    effect: null,
    ...over,
  };
}

const snapshot: Snapshot = {
  width: 8,
  height: 6,
  tick: 3,
  ticksTotal: 40,
  survivorsAfterRound: 4,
  ruleSetId: "standard",
  bots: Array.from({ length: 8 }, (_, i) => bot(i)),
  items: [],
};
const names = Object.fromEntries(snapshot.bots.map((b, i) => [b.id, `Player ${i}`]));
const throws: ThrowEvent[] = [
  { throwerId: "p0", outcome: "hit", targetId: "p1", distance: 1, hitChance: 90 },
  { throwerId: "p2", outcome: "miss", targetId: "p3", distance: 1, hitChance: 90 },
  { throwerId: "p4", outcome: "empty" },
  { throwerId: "p6", outcome: "dry", targetId: "p7", distance: 1 },
];
const count = (html: string, pattern: string) => html.split(pattern).length - 1;

describe("ArenaBoard", () => {
  const html = renderToStaticMarkup(
    <ArenaBoard snapshot={snapshot} throws={throws} names={names} highlightId="p5" tickMs={300} />,
  );

  test("has an accessible name that says where the viewer's tank is, and a wall around the grid", () => {
    expect(html).toContain('aria-label="Arena with 8 tanks, turn 3 of 40. Your tank has the orange ring."');
    expect(html).toContain('viewBox="-3 -3 86 66"');
  });

  test("draws one tank per player and marks the highlighted one", () => {
    expect(count(html, 'data-bot-id="')).toBe(8);
    expect(count(html, 'data-self="true"')).toBe(1);
    for (const label of botLabels(names).values()) expect(html).toContain(`>${label}</text>`);
  });

  test("each shot kind has its own shape: a jet with a splash, a lob with a puff, a short jet, and drops", () => {
    expect(count(html, 'data-throw="hit"')).toBe(1);
    expect(count(html, 'data-throw="miss"')).toBe(1);
    expect(count(html, 'data-throw="empty"')).toBe(1);
    expect(count(html, 'data-throw="dry"')).toBe(1);
    expect(count(html, 'data-mark="hit"')).toBe(1);
    expect(count(html, 'data-mark="miss"')).toBe(1);
    expect(count(html, 'data-mark="empty"')).toBe(1);
  });

  test("a hit shakes the target, a shot pushes the shooter back, and the shooter gets a +1", () => {
    const tank = (id: string) => html.slice(html.indexOf(`data-bot-id="${id}"`), html.indexOf("</g></g></g>", html.indexOf(`data-bot-id="${id}"`)));
    expect(tank("p1")).toContain("ab-wobble");
    expect(tank("p0")).toContain("ab-recoil");
    expect(tank("p4")).toContain("ab-recoil");
    // A dry shot sends no water, so the tank does not recoil.
    expect(tank("p6")).not.toContain("ab-recoil");
    expect(count(html, ">+1</text>")).toBe(1);
  });

  describe("items (84-items.md)", () => {
    const withItems: Snapshot = {
      ...snapshot,
      bots: snapshot.bots.map((b) =>
        b.id === "p2" ? { ...b, item: "umbrella" } : b.id === "p3" ? { ...b, effect: { kind: "dizzy", turnsLeft: 2 } } : b.id === "p4" ? { ...b, effect: { kind: "stuck", turnsLeft: 1 } } : b,
      ),
      items: [
        { kind: "bucket", x: 5, y: 5, turnsLeft: 20 },
        { kind: "pinwheel", x: 6, y: 1, turnsLeft: 4 },
      ],
    };
    const itemThrows: ThrowEvent[] = [
      { throwerId: "p0", outcome: "blocked", targetId: "p1", distance: 1, hitChance: 90 },
      { throwerId: "p6", outcome: "hit", targetId: "p7", distance: 1, hitChance: 90, bucket: true },
    ];
    const itemHtml = renderToStaticMarkup(<ArenaBoard snapshot={withItems} throws={itemThrows} names={names} highlightId="p5" tickMs={300} />);
    const tank = (id: string) => itemHtml.slice(itemHtml.indexOf(`data-bot-id="${id}"`), itemHtml.indexOf(`data-bot-id="p${Number(id.slice(1)) + 1}"`));

    test("each item lies on its square, and one in its last turns is marked as fading", () => {
      expect(count(itemHtml, 'data-item="')).toBe(2);
      expect(itemHtml).toContain('transform="translate(55 55)" data-item="bucket">');
      expect(itemHtml).toContain('transform="translate(65 15)" data-item="pinwheel" data-fading="true"');
    });

    test("a tank shows the item it holds and its effect", () => {
      expect(tank("p2")).toContain('data-held="umbrella"');
      expect(tank("p3")).toContain('data-effect="dizzy"');
      expect(tank("p4")).toContain('data-effect="stuck"');
      expect(count(itemHtml, "data-held=")).toBe(1);
    });

    test("a blocked throw opens the umbrella, and nobody wobbles or gets a point for it", () => {
      expect(count(itemHtml, 'data-mark="blocked"')).toBe(1);
      expect(tank("p1")).not.toContain("ab-wobble");
      expect(tank("p0")).toContain("ab-recoil");
      expect(count(itemHtml, ">+1</text>")).toBe(0);
    });

    test("a hit with a bucket pops +2", () => {
      expect(count(itemHtml, ">+2</text>")).toBe(1);
      expect(tank("p7")).toContain("ab-wobble");
    });
  });

  test("a live board animates, a paused board shows the turn as a still picture", () => {
    expect(html).toContain('min-w-0 ab-live"');
    const paused = renderToStaticMarkup(
      <ArenaBoard snapshot={snapshot} throws={throws} names={names} highlightId="p5" tickMs={300} paused />,
    );
    expect(paused).not.toContain('min-w-0 ab-live"');
    expect(count(paused, 'data-mark="hit"')).toBe(1);
  });

  test("the one leader wears the crown, and a tie shows none", () => {
    expect(count(html, 'data-leader="true"')).toBe(1);
    expect(html).toContain("Player 0 leads");
    const tied: Snapshot = { ...snapshot, bots: snapshot.bots.map((b) => ({ ...b, score: 2 })) };
    const tiedHtml = renderToStaticMarkup(<ArenaBoard snapshot={tied} throws={[]} names={names} highlightId={null} tickMs={300} />);
    expect(count(tiedHtml, 'data-leader="true"')).toBe(0);
  });

  test("a chosen look paints the hull, the plate and the icon, and others are plain in the order of the tanks", () => {
    const look = { colour: 6, skin: "dots", second: 3, plate: 9, icon: "cat", flag: null } as const;
    const coloured = renderToStaticMarkup(
      <ArenaBoard snapshot={snapshot} throws={[]} names={names} highlightId={null} tickMs={300} tanks={new Map([["p0", { look }]])} />,
    );
    const first = coloured.slice(coloured.indexOf('data-bot-id="p0"'), coloured.indexOf('data-bot-id="p1"'));
    expect(first).toContain("var(--color-tank-6)");
    // The plate is drawn before the turning tank, so it lies on the square and does not turn.
    expect(first.indexOf("var(--color-tank-9)")).toBeLessThan(first.indexOf("ab-move"));
    // The icon (filled with the second colour) replaces the letters on the hatch.
    expect(first).toContain("var(--color-tank-3)");
    expect(first).not.toContain("</text>");
    const second = coloured.slice(coloured.indexOf('data-bot-id="p1"'), coloured.indexOf('data-bot-id="p2"'));
    expect(second).toContain("var(--color-tank-2)");
  });

  test("the countdown shows the number and points out the viewer's tank", () => {
    const counting = renderToStaticMarkup(
      <ArenaBoard snapshot={snapshot} throws={[]} names={names} highlightId="p5" tickMs={300} countdown={3} />,
    );
    expect(counting).toContain("Starts in 3 seconds");
    expect(count(counting, 'data-you-marker="true"')).toBe(1);
    expect(counting).toContain(">You</text>");
    expect(count(html, 'data-you-marker="true"')).toBe(0);
    const spectator = renderToStaticMarkup(
      <ArenaBoard snapshot={snapshot} throws={[]} names={names} highlightId={null} tickMs={300} countdown={3} />,
    );
    expect(count(spectator, 'data-you-marker="true"')).toBe(0);
  });

  test("every tank shows its water, and a tank with too little to shoot is marked", () => {
    const tanks = [standard.waterCapacity, standard.waterPerThrow, standard.waterPerThrow - 1, 0];
    const lowSnapshot: Snapshot = {
      ...snapshot,
      bots: snapshot.bots.map((b, i) => ({ ...b, water: tanks[i % tanks.length] ?? 0 })),
    };
    const low = renderToStaticMarkup(
      <ArenaBoard snapshot={lowSnapshot} throws={[]} names={names} highlightId={null} tickMs={300} />,
    );
    expect(count(low, "data-water=")).toBe(8);
    expect(count(low, 'data-can-throw="false"')).toBe(4);
    expect(low).toContain("Player 3, 0 of 9 water, too little to shoot");
    expect(low).toContain("Player 0, 9 of 9 water</title>");
  });

  test("a non-standard set sets the maximum of the water text and the point where a tank cannot shoot", () => {
    const lowSnapshot: Snapshot = {
      ...snapshot,
      ruleSetId: "downpour",
      bots: snapshot.bots.map((b, i) => ({ ...b, water: i === 0 ? 2 : i === 1 ? 1 : 12 })),
    };
    const html = renderToStaticMarkup(
      <ArenaBoard snapshot={lowSnapshot} throws={[]} names={names} highlightId={null} tickMs={300} />,
    );
    // 2 water pays for one shot in Downpour, and 1 water does not. Under the standard set both would be dry.
    expect(html).toContain("Player 0, 2 of 12 water</title>");
    expect(html).toContain("Player 1, 1 of 12 water, too little to shoot");
    expect(count(html, 'data-can-throw="false"')).toBe(1);
  });

  test("moves tanks over tickMs and has a reduced-motion rule", () => {
    expect(html).toContain("--tick-ms:300ms");
    expect(html).toContain("prefers-reduced-motion");
  });

  test("speaks Indonesian when the page does", () => {
    const id = renderToStaticMarkup(
      <I18nProvider store={createLanguageStore({ store: null, initial: "id" })}>
        <ArenaBoard snapshot={snapshot} throws={[]} names={names} highlightId="p5" tickMs={300} countdown={2} />
      </I18nProvider>,
    );
    expect(id).toContain("Arena dengan 8 tank, giliran 3 dari 40");
    expect(id).toContain(">Kamu</text>");
  });
});

describe("Scoreboard", () => {
  test("shows one row per bot and one cut divider", () => {
    const html = renderToStaticMarkup(<Scoreboard snapshot={snapshot} names={names} highlightId="p5" />);
    expect(count(html, "<li ")).toBe(9);
    expect(count(html, 'data-cut-line="true"')).toBe(1);
    expect(count(html, 'aria-current="true"')).toBe(1);
  });

  test("each row shows the tank in its look", () => {
    const html = renderToStaticMarkup(<Scoreboard snapshot={snapshot} names={names} highlightId="p5" tanks={new Map([["p2", { look: plainTankLook(7) }]])} />);
    expect(count(html, "<svg")).toBe(8);
    expect(html).toContain("var(--color-tank-7)");
  });

  test("the viewer's own row states its water against the round's maximum", () => {
    const dry: Snapshot = {
      ...snapshot,
      ruleSetId: "dry-spell",
      bots: snapshot.bots.map((b) => ({ ...b, water: 5 })),
    };
    const html = renderToStaticMarkup(<Scoreboard snapshot={dry} names={names} highlightId="p5" />);
    expect(html).toContain("Water: 5 of 6");
  });

  test("keeps the highlighted row when maxRows hides others", () => {
    const html = renderToStaticMarkup(<Scoreboard snapshot={snapshot} names={names} highlightId="p7" maxRows={3} />);
    expect(html).toContain("Player 7");
    expect(html).not.toContain("Player 4");
    // Hidden rows sit on both sides of the cut, so no line is drawn.
    expect(count(html, "<li ")).toBe(3);
    expect(count(html, 'data-cut-line="true"')).toBe(0);
  });
});

describe("ArenaBoard with a camera window", () => {
  // The window starts at square (4.5, 2) and is 2 by 2 squares; with the margin of 2 it draws squares 2 to 8 across and 0 to 5 down.
  const view = { x: 4.5, y: 2, width: 2, height: 2 };
  const windowed = renderToStaticMarkup(<ArenaBoard snapshot={snapshot} throws={throws} names={names} highlightId="p5" tickMs={300} camera={view} countdown={3} />);

  test("draws only the tanks in the window and its margin, and their shots", () => {
    // Tanks stand at x 0 to 3 in rows 0 and 2, so p2, p3, p6 and p7 (x 2 and 3) are near enough.
    expect(count(windowed, 'data-bot-id="')).toBe(4);
    for (const id of ["p2", "p3", "p6", "p7"]) expect(windowed).toContain(`data-bot-id="${id}"`);
    // p0's hit and p4's short jet come from outside; p2's miss (a jet) and p6's dry drops are drawn.
    expect(count(windowed, "data-throw=")).toBe(2);
    expect(windowed).toContain('data-throw="miss"');
    expect(windowed).toContain('data-throw="dry"');
  });

  test("shows the window at the size of its squares and glides it with the tanks", () => {
    expect(windowed).toContain('viewBox="0 0 20 20"');
    expect(windowed).toContain("translate(-45px, -20px)");
    // The "You" marker is drawn with the viewer's tank, which is outside this window.
    expect(count(windowed, 'data-you-marker="true"')).toBe(1);
  });
});
