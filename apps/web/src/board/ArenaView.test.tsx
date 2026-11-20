/// <reference types="bun" />
import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { engineRound, snapshotAt } from "../stream/fixtures.ts";
import { ArenaCameraSwitch, ArenaView } from "./ArenaView.tsx";

const props = { throws: [], names: {}, highlightId: null, tickMs: 300 } as const;

describe("ArenaView", () => {
  test("offers follow when it draws larger squares, even on a roomy laptop", () => {
    const fixedBox = { width: 800, height: 450 };
    const snapshot = { ...snapshotAt(10), width: 15, height: 11 };
    const html = renderToStaticMarkup(<ArenaView {...props} snapshot={snapshot} fixedBox={fixedBox} />);
    expect(html).toContain("data-camera-switch");
    expect(html).toContain(">Leader<");
    expect(html).toContain('data-camera="whole"');

    const small = { ...snapshot, width: 8, height: 6 };
    expect(renderToStaticMarkup(<ArenaView {...props} snapshot={small} fixedBox={fixedBox} />)).not.toContain("data-camera-switch");
  });

  test("every board has the focus mode button in its corner, off at first (owner, 2026-11-20)", () => {
    const snapshot = { ...snapshotAt(10), width: 15, height: 11 };
    const html = renderToStaticMarkup(<ArenaView {...props} snapshot={snapshot} fixedBox={{ width: 800, height: 450 }} wholeOnly />);
    expect(html).toMatch(/aria-label="(Focus mode|Mode fokus)"[^>]*aria-pressed="false"[^>]*data-board-focus=""/);
    expect(html).not.toContain('aria-modal="true"');
  });

  test("turns a whole-only board to fit a tall box and leaves out the zoom switch", () => {
    const snapshot = { ...snapshotAt(10), width: 15, height: 11 };
    const html = renderToStaticMarkup(<ArenaView {...props} snapshot={snapshot} fixedBox={{ width: 300, height: 450 }} wholeOnly />);
    expect(html).toContain('data-orientation="upright"');
    expect(html).toContain('data-camera="whole"');
    expect(html).not.toContain("data-camera-switch");
  });

  test("the zoomed window turns upright with the arena, with no corner map (owner, 2026-11-19)", () => {
    const snapshot = { ...engineRound(2, 8).spawn, width: 15, height: 11 };
    const out = renderToStaticMarkup(
      <ArenaView {...props} snapshot={snapshot} fixedBox={{ width: 300, height: 450 }} highlightId="p1" defaultChoice="follow" />,
    );
    expect(out).toContain('data-orientation="upright"');
    expect(out).toContain('data-camera="mine"');
    expect(out).not.toContain("data-overview-map");
  });
});

test("the follow segment shows the followed tank's short name", () => {
  const html = renderToStaticMarkup(
    <ArenaCameraSwitch choice="follow" ownTank followedName="Captain Ripple" wholeLabel={undefined} onChoice={() => {}} onReturn={() => {}} />,
  );
  expect(html).toContain('data-follows-other="true"');
  expect(html).toContain(">Captain R…<");
  expect(html).not.toContain(">My tank<");
});
