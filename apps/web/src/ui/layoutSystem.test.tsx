/// <reference types="bun" />
// The no-scroll layout system: the paging rules, and what each component renders
// without a DOM (a server render is also what the scrolling fallback shows).
import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { I18nProvider } from "../i18n/I18nProvider.tsx";
import { createLanguageStore } from "../i18n/language.ts";
import { AppShell } from "./AppShell.tsx";
import { BottomTabs, tabPanelProps } from "./BottomTabs.tsx";
import { Carousel } from "./Carousel.tsx";
import { Pager } from "./Pager.tsx";
import { clampPage, fitsWithoutPaging, keyStep, pageOf, planPages, planPagesFromEnd, swipeStep } from "./paging.ts";
import { StepSheet } from "./StepSheet.tsx";
import { measuredLevel, nextDetailLevel } from "./useFitDetail.ts";

const count = (html: string, pattern: string) => html.split(pattern).length - 1;
const indonesian = () => createLanguageStore({ store: null, initial: "id" });

describe("planPages", () => {
  test("fills each page with as many items as fit, counting the gaps between them", () => {
    // 3 rows of 40 with gaps of 8 need 136 px, so a 130 px page holds 2 of them.
    expect(planPages([40, 40, 40, 40, 40], 130, 8, null)).toEqual([
      { items: [0, 1], kept: null },
      { items: [2, 3], kept: null },
      { items: [4], kept: null },
    ]);
  });

  test("keeps rows of different heights in order and gives a too-tall row its own page", () => {
    expect(planPages([30, 90, 200, 30], 120, 0, null).map((page) => page.items)).toEqual([[0, 1], [2], [3]]);
  });

  test("a kept row shows at the end of every page that does not hold it, and the pages leave room for it", () => {
    // 100 px minus the kept row (20) and a gap (0) leaves 80: four rows of 20 per page.
    const pages = planPages(Array.from({ length: 10 }, () => 20), 100, 0, 7);
    expect(pages).toEqual([
      { items: [0, 1, 2, 3], kept: 7 },
      { items: [4, 5, 6, 7], kept: null },
      { items: [8, 9], kept: 7 },
    ]);
  });

  test("an empty list is one empty page, and a kept index outside the list is ignored", () => {
    expect(planPages([], 100, 8, null)).toEqual([{ items: [], kept: null }]);
    expect(planPages([10, 10], 100, 8, 5)).toEqual([{ items: [0, 1], kept: null }]);
  });

  test("read from the end, the last page holds the newest items that fit and the first page what is left", () => {
    expect(planPagesFromEnd([40, 40, 40, 40, 40], 130, 8)).toEqual([
      { items: [0], kept: null },
      { items: [1, 2], kept: null },
      { items: [3, 4], kept: null },
    ]);
    expect(planPagesFromEnd([30, 90, 200, 30], 120, 0).map((page) => page.items)).toEqual([[0, 1], [2], [3]]);
    expect(planPagesFromEnd([], 100, 8)).toEqual([{ items: [], kept: null }]);
  });

  test("everything fits without controls only when the rows and gaps fit the height", () => {
    expect(fitsWithoutPaging([40, 40, 40], 136, 8)).toBe(true);
    expect(fitsWithoutPaging([40, 40, 40], 135, 8)).toBe(false);
  });

  test("a page number stays inside the pages", () => {
    expect(clampPage(5, 3)).toBe(2);
    expect(clampPage(-1, 3)).toBe(0);
    expect(clampPage(0, 0)).toBe(0);
  });
});

describe("nextDetailLevel", () => {
  test("leaves out one more detail while the content is taller than its box, and stops at the last level", () => {
    expect(nextDetailLevel(0, 3, 600, 500)).toBe(1);
    expect(nextDetailLevel(1, 3, 501, 500)).toBe(1);
    expect(nextDetailLevel(2, 3, 900, 500)).toBe(2);
  });
});

describe("measuredLevel: a box that changes while a fuller level is drawn (row 12 of 73-after-first-timer-test.md)", () => {
  /**
   * The commits of useFitDetail after its box changed: the reset queues level 0 and the measurement of the page as
   * drawn runs in the same commit; React draws again only when the queued level differs from the one drawn.
   * `heights` is the content's height at each level, in the new box.
   */
  function settle(drawn: number, heights: readonly number[], box: number, rule: (queued: number, drawn: number, contentHeight: number) => number): number {
    let queued = rule(0, drawn, heights[drawn] ?? 0);
    while (queued !== drawn) {
      drawn = queued;
      queued = rule(queued, drawn, heights[drawn] ?? 0);
    }
    return drawn;
  }
  // The upgrade bench in the 22rem column: level 1 at 768 x 1024, then the window becomes 1000 x 600 (a 338 px box).
  const heights = [900, 616, 560, 450, 330, 300];

  test("ends on the first level that fits, even when the page still shows level 1 as the reset queues level 0", () => {
    expect(settle(1, heights, 338, (queued, drawn, h) => measuredLevel(queued, drawn, heights.length, h, 338))).toBe(4);
    expect(settle(0, heights, 338, (queued, drawn, h) => measuredLevel(queued, drawn, heights.length, h, 338))).toBe(4);
  });

  test("applying the measurement to the queued level stops on level 1, whose content overflows: the bug it replaces", () => {
    expect(settle(1, heights, 338, (queued, _drawn, h) => nextDetailLevel(queued, heights.length, h, 338))).toBe(1);
  });
});

describe("page gestures", () => {
  test("Page Down and the right arrow go forward, Page Up and the left arrow go back", () => {
    expect([keyStep("PageDown"), keyStep("ArrowRight"), keyStep("PageUp"), keyStep("ArrowLeft"), keyStep("Enter")]).toEqual([1, 1, -1, -1, null]);
  });

  test("a sideways swipe of 48 px turns the page; a short or mostly vertical drag does not", () => {
    expect(swipeStep(-60, 10)).toBe(1);
    expect(swipeStep(60, 0)).toBe(-1);
    expect(swipeStep(-40, 0)).toBeNull();
    expect(swipeStep(-60, 50)).toBeNull();
  });
});

describe("Pager", () => {
  const players = ["Ana", "Budi", "Citra"];
  test("before it can measure, it lists every item in order and shows no page controls", () => {
    const html = renderToStaticMarkup(<Pager label="Players" items={players} itemKey={(name) => name} renderItem={(name) => <span>{name}</span>} />);
    expect(html).toContain('<ol aria-label="Players"');
    expect(count(html, "data-pager-item")).toBe(3);
    expect(html.indexOf("Ana")).toBeLessThan(html.indexOf("Citra"));
    expect(html).not.toContain("data-pager-controls");
  });

  test("an unordered list when the order means nothing", () => {
    const html = renderToStaticMarkup(<Pager label="Rules" ordered={false} items={players} itemKey={(name) => name} renderItem={(name) => name} />);
    expect(html).toContain('<ul aria-label="Rules"');
  });
});

describe("Carousel", () => {
  const styles = ["Splasher", "Dodger", "Collector"];
  const carousel = (index: number) => (
    <Carousel label="Play styles" items={styles} itemKey={(s) => s} renderItem={(s) => <h3>{s}</h3>} index={index} onIndexChange={() => undefined} />
  );

  test("shows one item, names its position, and cannot go back from the first", () => {
    const html = renderToStaticMarkup(carousel(0));
    expect(html).toContain("Splasher");
    expect(html).not.toContain("Dodger</h3>");
    expect(html).toContain('aria-label="1 of 3"');
    // aria-disabled rather than disabled, so a keyboard user's focus stays on the button at the end.
    expect(html).toMatch(/aria-label="Previous"[^>]*aria-disabled="true"/);
    expect(html).toMatch(/aria-label="Next"[^>]*aria-disabled="false"/);
  });

  test("an index past the end shows the last item, and the position reads in Indonesian", () => {
    const html = renderToStaticMarkup(<I18nProvider store={indonesian()}>{carousel(9)}</I18nProvider>);
    expect(html).toContain("Collector");
    expect(html).toContain('aria-label="3 dari 3"');
    expect(html).toContain('aria-label="Berikutnya"');
  });
});

describe("BottomTabs", () => {
  test("is a tab list whose chosen tab points at the panel that tabPanelProps labels", () => {
    const html = renderToStaticMarkup(
      <>
        <BottomTabs
          idBase="room"
          label="Arena parts"
          value="players"
          onChange={() => undefined}
          tabs={[
            { value: "tank", label: "Tank", icon: null },
            { value: "players", label: "Players", icon: null },
          ]}
        />
        <div {...tabPanelProps("room", "players")} />
      </>,
    );
    expect(html).toContain('role="tablist" aria-label="Arena parts"');
    expect(html).toMatch(/id="room-tab-players" aria-selected="true" aria-controls="room-panel-players" tabindex="0"/);
    expect(html).toMatch(/id="room-tab-tank" aria-selected="false" aria-controls="room-panel-tank" tabindex="-1"/);
    expect(html).toContain('role="tabpanel" id="room-panel-players" aria-labelledby="room-tab-players" data-tab-panel="players"');
  });
});

describe("StepSheet", () => {
  test("has a named Back button, the title as its heading, the body and the action", () => {
    const html = renderToStaticMarkup(
      <StepSheet title="Round speed" onBack={() => undefined} action={<button type="button">Done</button>}>
        <p>Body</p>
      </StepSheet>,
    );
    expect(html).toContain('aria-label="Back"');
    expect(html).toMatch(/<h2[^>]*>Round speed<\/h2>/);
    expect(html.indexOf("Body")).toBeLessThan(html.indexOf("Done"));
  });

  test("the Back button reads in Indonesian unless the screen names it", () => {
    const store = indonesian();
    expect(renderToStaticMarkup(<I18nProvider store={store}><StepSheet title="x" onBack={() => undefined}>y</StepSheet></I18nProvider>)).toContain('aria-label="Kembali"');
    expect(renderToStaticMarkup(<StepSheet title="x" backLabel="Back to the form" onBack={() => undefined}>y</StepSheet>)).toContain('aria-label="Back to the form"');
  });
});

describe("AppShell", () => {
  test("puts the header, one main area and the bottom bar in order, and leaves the bar out when there is none", () => {
    const html = renderToStaticMarkup(
      <AppShell header={<header>Top</header>} bottom={<button type="button">Start</button>}>
        <p>Pane</p>
      </AppShell>,
    );
    expect(count(html, "<main")).toBe(1);
    expect(html.indexOf("Top")).toBeLessThan(html.indexOf("Pane"));
    expect(html.indexOf("Pane")).toBeLessThan(html.indexOf("Start"));
    expect(html).toContain("data-shell-bottom");
    expect(renderToStaticMarkup(<AppShell header={null}>x</AppShell>)).not.toContain("data-shell-bottom");
  });

  test("the fixed viewport height applies only inside the fit query, so the fallback scrolls", () => {
    const html = renderToStaticMarkup(<AppShell header={null}>x</AppShell>);
    expect(html).toContain("fit:h-dvh");
    expect(html).toContain("min-h-dvh");
    const classes = [...html.matchAll(/class="([^"]*)"/g)].flatMap((match) => (match[1] ?? "").split(/\s+/));
    expect(classes).not.toContain("h-dvh");
    expect(classes).not.toContain("overflow-hidden");
  });
});

describe("pageOf", () => {
  test("finds the page that holds an item, not a page that only keeps it in view", () => {
    // Ten rows of 40 px on pages of 130 px, with row 9 kept: two rows and the kept row per page.
    const plan = planPages(Array.from({ length: 10 }, () => 40), 130, 0, 9);
    expect(pageOf(plan, 0)).toBe(0);
    expect(pageOf(plan, 5)).toBe(2);
    expect(pageOf(plan, 9)).toBe(plan.length - 1);
    expect(pageOf(plan, 42)).toBe(-1);
  });
});
