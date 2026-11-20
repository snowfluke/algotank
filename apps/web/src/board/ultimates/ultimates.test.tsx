import { describe, expect, test } from "bun:test";
import type { PublicSnapshot, PublicTick } from "@game/arena";
import { ULTIMATE_IDS, type UltimateId, type WaitingItems } from "@game/engine";
import { renderToStaticMarkup } from "react-dom/server";
import { sceneNames } from "../../catalogue/scenes.ts";
import { I18nProvider } from "../../i18n/I18nProvider.tsx";
import { createLanguageStore } from "../../i18n/language.ts";
import { ArenaBoard } from "../ArenaBoard.tsx";
import { LegendDialog } from "../BoardLegend.tsx";
import { rotateSnapshot } from "../boardOrientation.ts";
import { rotateFires } from "./boardUltimates.ts";
import { ultimateTickFixture } from "./fixtures.ts";

const MARKS: Readonly<Record<UltimateId, readonly string[]>> = {
  dash: ['data-ultimate-path=""', 'data-ultimate-ram="hit"', 'data-ultimate-target="a"', 'data-throw="miss"', '>+2</text>'],
  smoke: ['data-ultimate-active="smoke"'],
  splash: ['data-ultimate-splash="hit"'],
  fullTank: ['data-ultimate-refill=""', 'data-ultimate-active="fullTank"', 'data-ultimate-free-shots="3"'],
  mudBomb: ['data-ultimate-lob=""', 'data-ultimate-area="mudBomb"', 'data-ultimate-caught="a"', 'data-effect="stuck"', '>+3</text>'],
  whirlwind: ['data-ultimate-wind=""', 'data-ultimate-area="whirlwind"', 'data-ultimate-caught="c"', 'data-effect="dizzy"', '>+1</text>'],
  // The catalogue opens the umbrella on a turn of its own; the blocked shot comes a turn later (scenes.ts).
  bigUmbrella: ['data-ultimate-active="bigUmbrella"', 'data-ultimate-blocks="3"'],
  magnet: ['data-ultimate-pull="umbrella"', 'data-ultimate-pull="pinwheel"', 'data-ultimate-drop="bucket"', 'data-held="bucket"', 'data-ultimate-stack=""', 'data-waiting-item="umbrella"', 'data-waiting-item="pinwheel"'],
};

function renderBoard({ snapshot, throws, fires }: Pick<PublicTick, "snapshot" | "throws" | "fires">): string {
  return renderToStaticMarkup(<ArenaBoard snapshot={snapshot} throws={throws} fires={fires ?? []} names={sceneNames()} highlightId="you" tickMs={200} paused />);
}

describe("ultimate fires on the board (85-ultimates.md)", () => {
  test.each(ULTIMATE_IDS)("%s draws its compact turn at the board's speed", (id) => {
    const html = renderBoard(ultimateTickFixture(id));
    expect(html).toContain(`data-ultimate-fire="${id}"`);
    expect(html).toContain("--step:200ms");
    for (const mark of MARKS[id]) expect(html).toContain(mark);
    if (id === "splash") {
      expect(html.match(/data-ultimate-splash="hit"/g)).toHaveLength(8);
      expect(html.match(/>\+2<\/text>/g)).toHaveLength(8);
    }
    if (id === "magnet") expect(html).not.toContain('data-ultimate-pull="bucket"');
    // The ram is a contact effect, so the board does not draw its wire throw as a water jet.
    if (id === "dash") expect(html).not.toContain('data-throw="hit"');
  });

  test("Magnet drops the bucket into the first free slot and animates only the new badges", () => {
    const tick = ultimateTickFixture("magnet");
    const fire = tick.fires?.[0];
    if (fire?.kind !== "magnet") throw new Error("Missing Magnet fire");
    expect(fire.items[0]).toEqual({ kind: "bucket" });
    expect(tick.snapshot.bots.find((bot) => bot.id === fire.botId)).toMatchObject({ item: "bucket", itemsWaiting: ["umbrella", "pinwheel"] });

    const emptyHand = renderBoard(tick);
    expect(emptyHand).toContain('data-ultimate-drop="bucket" transform="translate(21.5 11.7)"');
    expect(emptyHand).toContain('data-held="bucket"><g class="ue-held"');
    expect(emptyHand).toContain('class="ue-held" data-waiting-item="umbrella"');
    expect(emptyHand).toContain('class="ue-held" data-waiting-item="pinwheel"');

    const renderWithHand = (itemsWaiting: WaitingItems, items: typeof fire.items) => renderBoard({
      ...tick,
      snapshot: { ...tick.snapshot, bots: tick.snapshot.bots.map((bot) => bot.id === fire.botId
        ? { ...bot, item: "mudBall", itemsWaiting }
        : bot) },
      fires: [{ ...fire, items }],
    });
    const oneItem = renderWithHand(["bucket", "pinwheel"], [{ kind: "bucket" }, { kind: "pinwheel", from: { x: 4, y: 2 } }]);
    expect(oneItem).toContain('data-ultimate-drop="bucket" transform="translate(21.3 14.8)"');
    expect(oneItem).toContain('data-held="mudBall"><g class="ab-anim ab-item-in"');
    expect(oneItem).toContain('class="ue-held" data-waiting-item="bucket"');
    expect(oneItem).toContain('class="ue-held" data-waiting-item="pinwheel"');

    const twoItems = renderWithHand(["umbrella", "bucket"], [{ kind: "bucket" }]);
    expect(twoItems).toContain('data-ultimate-drop="bucket" transform="translate(21.3 17.6)"');
    expect(twoItems).toContain('data-held="mudBall"><g class="ab-anim ab-item-in"');
    expect(twoItems).toContain('<g data-waiting-item="umbrella"');
    expect(twoItems).toContain('class="ue-held" data-waiting-item="bucket"');
  });

  test("splash distinguishes every result carried by the fire", () => {
    const tick = ultimateTickFixture("splash");
    const fire = tick.fires?.[0];
    if (fire?.kind !== "splash") throw new Error("Missing splash fire");
    const outcomes = ["miss", "blocked", "dodged"] as const;
    const html = renderBoard({
      ...tick,
      fires: [{
        ...fire,
        squares: fire.squares.map((square, index) => {
          const outcome = outcomes[index - 1];
          if (index === 0) return { x: square.x, y: square.y, outcome: "empty" };
          return square.outcome === "empty" || outcome === undefined ? square : { ...square, outcome };
        }),
      }],
    });
    for (const outcome of ["empty", ...outcomes, "hit"]) expect(html).toContain(`data-ultimate-splash="${outcome}"`);
    expect(html.match(/>\+2<\/text>/g)).toHaveLength(4);
  });

  test("the ready glow follows the ready tank only, and charging tanks stay quiet", () => {
    const source = ultimateTickFixture("dash").snapshot;
    const snapshot: PublicSnapshot = {
      ...source,
      bots: source.bots.map((bot) => ({
        ...bot,
        ultimate: bot.id === "a" ? { kind: "ready", id: "smoke" } : { kind: "charging", id: "dash", turnsLeft: 40, turnsTotal: 40 },
      })),
    };
    const html = renderBoard({ snapshot, throws: [] });
    expect(html).toContain('data-ultimate-tank="a"><g data-ultimate-ready=""');
    expect(html.match(/data-ultimate-ready=/g)).toHaveLength(1);
    expect(html).not.toContain('data-ultimate-tank="you"');
  });

  test("smoke, the umbrella and a full tank stay after the fire and disappear when their active state ends", () => {
    for (const id of ["smoke", "bigUmbrella", "fullTank"] as const) {
      const { snapshot } = ultimateTickFixture(id);
      expect(renderBoard({ snapshot, throws: [] })).toContain(`data-ultimate-active="${id}"`);
      const ended = { ...snapshot, bots: snapshot.bots.map((bot) => ({ ...bot, ultimateEffect: null })) };
      expect(renderBoard({ snapshot: ended, throws: [] })).not.toContain("data-ultimate-active");
    }
  });

  test("an old tick renders byte for byte the same with or without an empty fires prop", () => {
    const { snapshot: current } = ultimateTickFixture("dash");
    const snapshot = { ...current, bots: current.bots.map(({ ultimate: _ultimate, ultimateEffect: _active, ...bot }) => bot) };
    const props = { snapshot, throws: [], names: sceneNames(), highlightId: "you", tickMs: 200 };
    const html = renderToStaticMarkup(<ArenaBoard {...props} />);
    expect(renderToStaticMarkup(<ArenaBoard {...props} fires={[]} />)).toBe(html);
    expect(html).not.toContain("data-ultimate-");
    expect(html).not.toContain("--step");
  });

  test.each(ULTIMATE_IDS)("the monthly quarter-turn rotates %s fire squares with the tanks", (id) => {
    const tick = ultimateTickFixture(id);
    const { snapshot, fires = [] } = tick;
    const rotated = rotateFires(fires, snapshot.height);
    const original = fires[0];
    expect(rotated[0]?.at).toEqual({ x: snapshot.height - 1 - original!.at.y, y: original!.at.x });
    const html = renderBoard({ ...tick, snapshot: rotateSnapshot(snapshot), fires: rotated });
    for (const mark of MARKS[id]) expect(html).toContain(mark);
    let width = snapshot.height;
    let height = snapshot.width;
    let returned = rotated;
    for (let turns = 0; turns < 3; turns++) {
      returned = rotateFires(returned, height);
      [width, height] = [height, width];
    }
    expect(returned).toEqual(fires);
  });
});

test("the legend links to ultimates only in a round with ultimates on", () => {
  for (const language of ["en", "id"] as const) {
    const render = (ultimates: boolean) => renderToStaticMarkup(
      <I18nProvider store={createLanguageStore({ store: null, initial: language })}>
        <LegendDialog ultimates={ultimates} onClose={() => {}} />
      </I18nProvider>,
    );
    const on = render(true);
    expect(on).toContain("data-legend-ultimate");
    expect(on).toContain(language === "en" ? "A gold glow means it is ready." : "Cahaya emas berarti jurusnya siap.");
    expect(on).toContain("/catalogue?section=ultimates");
    const off = render(false);
    expect(off).not.toContain("data-legend-ultimate");
    expect(off).toContain("/catalogue?section=items");
  }
});
