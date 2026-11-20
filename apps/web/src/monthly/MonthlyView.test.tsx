/// <reference types="bun" />
// The page's states as the phone (and a server render) draws them, in both languages.
import { describe, expect, test } from "bun:test";
import { ULTIMATES_FROM } from "@game/arena";
import { ARENA_LAYOUT_IDS, arenaSize, ruleSet } from "@game/engine";
import { renderToStaticMarkup } from "react-dom/server";
import { boardAspect } from "../board/FittedBoard.tsx";
import { I18nProvider } from "../i18n/I18nProvider.tsx";
import { createLanguageStore } from "../i18n/language.ts";
import type { StrategyHandle } from "../prep/useStrategySession.ts";
import { ToastProvider } from "../ui/Toast.tsx";
import { TankStep } from "./JoinSteps.tsx";
import { FIXTURE_MOVE, fixtureActivity, fixtureDays, fixtureLeagues, fixtureLive, fixtureLoad, fixtureRanking, fixtureSeat, OWN_SEAT } from "./monthlyFixtures.ts";
import { MonthlyPhoneBar, MonthlyView, type MonthlyViewProps } from "./MonthlyView.tsx";
import { en } from "./messages.ts";

const NOW = 1_000_000;

function props(over: Partial<MonthlyViewProps> = {}, tanks = 5): MonthlyViewProps {
  const live = fixtureLive(1, tanks);
  return {
    league: 1,
    leagues: fixtureLeagues(1, tanks),
    onLeague: () => undefined,
    load: fixtureLoad(live, NOW),
    connection: "open",
    onRetry: () => undefined,
    now: NOW,
    ranking: fixtureRanking(live),
    days: fixtureDays(1),
    seat: null,
    move: null,
    onMoveSeen: () => undefined,
    onJoin: () => undefined,
    dayChange: null,
    reshuffled: false,
    weatherChanged: false,
    onQuit: () => undefined,
    onChangeRules: () => undefined,
    onChangeLook: () => undefined,
    tab: "arena",
    onTab: () => undefined,
    side: "today",
    onSide: () => undefined,
    ...over,
  };
}

const render = (p: MonthlyViewProps, language: "en" | "id" = "en") =>
  renderToStaticMarkup(
    <I18nProvider store={createLanguageStore({ store: null, initial: language })}>
      <MonthlyView {...p} />
      <MonthlyPhoneBar seat={p.seat} onJoin={p.onJoin} tab={p.tab} onTab={p.onTab} />
    </I18nProvider>,
  );

describe("the monthly page", () => {
  test("a visitor sees the board, the day's clock and one action to join", () => {
    const html = render(props());
    expect(html).toContain("data-monthly-board");
    expect(html).toContain("05:12:44 left");
    expect(html.match(/data-monthly-join/g)?.length).toBe(1);
    expect(html).toMatch(/data-monthly-join=""[^>]*>Join the monthly arena<\/button>[\s\S]*data-bottom-tabs="monthly"/);
    const id = render(props(), "id");
    expect(id).toContain("Sisa 05:12:44");
    expect(id.match(/data-monthly-join/g)?.length).toBe(1);
    expect(id).toMatch(/data-monthly-join=""[^>]*>Ikut arena bulanan<\/button>[\s\S]*data-bottom-tabs="monthly"/);
    for (const visitor of [html, id]) {
      expect(Array.from(visitor.matchAll(/data-tab="([^"]+)"/g), ([, tab]) => tab)).toEqual(["arena", "ranking", "activity"]);
      expect(visitor).not.toMatch(/data-change-(rules|look)/);
    }
  });

  test("an empty league shows the empty board and invites the first tank", () => {
    const html = render(props({}, 0));
    expect(html).toContain("data-league-empty");
    expect(html).toContain("Your tank can be the first one on this board.");
    expect(render(props({}, 0), "id")).toContain("Belum ada tank yang main di liga ini.");
    // An owner looking at an empty league is not invited.
    expect(render(props({ seat: fixtureSeat(2), onJoin: null }, 0))).not.toContain("can be the first");
  });

  test("the Activity tab is available to visitors and players, and an empty log leaves it blank", () => {
    const visitor = render(props({ tab: "activity" }));
    expect(visitor).toMatch(/aria-selected="true"[^>]+data-tab="activity"/);
    expect(visitor).toContain(">Activity</span>");
    expect(visitor).toContain('data-tab-panel="activity"');
    expect(visitor).not.toContain("data-monthly-activity");
    const seated = render(props({ tab: "activity", seat: fixtureSeat(1), onJoin: null }), "id");
    expect(seated).toContain(">Aktivitas</span>");
    expect(seated).toContain('data-tab="mine"');
  });

  test("activity draws the four events, newest first, with their tank and relative time in both languages", () => {
    const live = { ...fixtureLive(1, 5), activity: fixtureActivity(NOW, 4) };
    const input = props({ tab: "activity", load: fixtureLoad(live, NOW) });
    const english = render(input);
    const list = english.match(/<ol data-monthly-activity=""[^>]*>(.*?)<\/ol>/)?.[1] ?? "";
    expect(Array.from(list.matchAll(/<p[^>]*>([^<]+)<\/p>/g), ([, sentence]) => sentence)).toEqual([
      "Bima changed its look.", "Bartholomew Kusu changed its rules.", "Citra left the arena.", "Dewi joined the arena.",
    ]);
    expect(Array.from(list.matchAll(/<time[^>]*>([^<]+)<\/time>/g), ([, time]) => time)).toEqual([
      "Just now", "1 minute ago", "2 minutes ago", "3 minutes ago",
    ]);
    expect(list.match(/<svg /g)?.length).toBe(4);
    const indonesian = render(input, "id");
    for (const sentence of ["Bima mengganti tampilannya.", "Bartholomew Kusu mengganti aturannya.", "Citra keluar dari arena.", "Dewi masuk ke arena.", "Baru saja", "1 menit yang lalu"]) {
      expect(indonesian).toContain(sentence);
    }
  });

  test("the league switch: none for one league, buttons for two, a list for nine with the own league named", () => {
    expect(render(props())).not.toContain("data-league-switch");
    expect(render(props({ leagues: fixtureLeagues(2, 20) }))).toContain('data-league-switch="row"');
    const nine = render(props({ leagues: fixtureLeagues(9, 140), seat: fixtureSeat(4), onJoin: null }), "id");
    expect(nine).toContain('data-league-switch="list"');
  });

  test("a seated owner's tank is ringed on the board and kept in the ranking; the own pane counts its days", () => {
    const seat = fixtureSeat(1);
    const ranking = render(props({ seat, onJoin: null, tab: "ranking" }, 16));
    expect(ranking).toMatch(new RegExp(`aria-current="true"[^>]*data-player-id="${OWN_SEAT}"`));
    expect(ranking).not.toContain("data-monthly-join");
    const mine = render(props({ seat, onJoin: null, tab: "mine" }, 16), "id");
    expect(mine).toContain("Tank kamu masuk peringkat pada hari pertama yang ia mainkan sejak tengah malam.");
    expect(mine).toContain("Hari ini masuk hitungan nilai bulananmu.");
    // The own pane counts down to the next arena draw (monthlyParts.test.ts checks the arithmetic).
    expect(mine).toMatch(/Arena berikutnya diundi dalam \d\d:\d\d\./);
    expect(mine).toContain("Keluar dari arena bulanan");
    expect(render(props({ seat, onJoin: null, tab: "mine" }, 16))).toContain("Your tank gets a place on its first day played from midnight.");
  });

  test("Your tank shows the seat's own ultimate even when its rules match a different play style", () => {
    const original = fixtureSeat(1);
    const seat = { ...original, strategy: { ...original.strategy, ultimate: "bigUmbrella" as const } };
    const input = props({ seat, onJoin: null, tab: "mine", now: ULTIMATES_FROM - 1 });
    const html = render(input, "id");
    expect(html).toMatch(/data-own-pane.*?data-ultimate-link="bigUmbrella" href="\/catalogue\?section=ultimates&amp;card=bigUmbrella"/);
    expect(html).toContain(">Payung besar<");
    expect(html).toContain(">Segera hadir<");
    expect(html).not.toContain(`data-ultimate-link="${original.strategy.ultimate}"`);
    expect(render({ ...input, now: ULTIMATES_FROM }, "id")).not.toContain(">Segera hadir<");
  });

  test("the help button opens a list that says the tank plays without the page, in both languages", () => {
    const html = render(props());
    expect(html).toContain("data-monthly-about-open");
    expect(html).toContain("so you can close this page and come back any time.");
    expect(html).toContain("Your month rating adds up your best 2 of every 3 days.");
    expect(render(props(), "id")).toContain("jadi kamu boleh menutup halaman ini dan kembali kapan saja.");
  });

  test("the title names the league and how many players sit in it, in both languages", () => {
    expect(render(props())).toMatch(/data-monthly-players=""[^>]*>League 1 · \d+ players</);
    expect(render(props(), "id")).toMatch(/data-monthly-players=""[^>]*>Liga 1 · \d+ peserta</);
  });

  test("the quit question says the points and the name stay, and that a return the same day goes on from them", () => {
    expect(en.quit.bodyNotCounted).toContain("Points from earlier days stay saved, and your name stays the same. You can join again later.");
    expect(en.quit.bodyCounted(4)).toContain("all your points stay saved, including today's 4 points. If you join again today, your tank goes on from those points.");
  });

  test("the board legend's button sits beside the information button, and the list points to it for the items", () => {
    const html = render(props());
    expect(html).toContain("data-legend-open");
    expect(html).toContain("Items appear on the board, and Help says what each one does.");
    expect(render(props(), "id")).toContain("tombol Bantuan menjelaskan gunanya");
  });

  test("a seated owner is told the tank plays without the page beside the own league", () => {
    const seat = fixtureSeat(1);
    expect(render(props({ seat, onJoin: null, tab: "mine" }, 16))).toContain("Your tank plays every round by itself, so you can close this page and come back any time.");
    expect(render(props({ seat, onJoin: null, tab: "mine" }, 16), "id")).toContain("jadi kamu boleh menutup halaman ini");
    // Beside another league the pane spends that room on the way back; the help dialog still says it.
    expect(render(props({ seat: fixtureSeat(2), onJoin: null, leagues: fixtureLeagues(2, 20), tab: "mine" }, 16))).not.toContain("data-own-plays-alone");
    // A visitor without a tank gets no such line.
    expect(render(props({ tab: "mine" }, 16))).not.toContain("data-own-plays-alone");
  });

  test("the own pane shows one tunnel line in each language, only for the viewer's tank", () => {
    const live = fixtureLive(1, 5);
    const load = fixtureLoad(live, NOW);
    if (load.kind !== "ready") throw new Error("expected a board");
    const withFresh = { ...load, board: { ...load.board, ownFreshStart: { id: OWN_SEAT, tick: 5 } } };
    const input = props({ seat: fixtureSeat(1), onJoin: null, tab: "mine", load: withFresh });
    const en = render(input);
    const id = render(input, "id");
    expect(en.match(/Your tank went through a tunnel and came out on another square with full water\./g)).toHaveLength(1);
    expect(id.match(/Tank kamu masuk terowongan dan keluar di petak lain dengan air penuh\./g)).toHaveLength(1);
    expect(render({ ...input, seat: null })).not.toContain("data-own-fresh-start");
    expect(render({ ...input, seat: fixtureSeat(2) })).not.toContain("data-own-fresh-start");
  });

  test("an owner whose tank plays in another league is told where, with the way back", () => {
    const html = render(props({ seat: fixtureSeat(2), onJoin: null, leagues: fixtureLeagues(2, 20) }, 16), "id");
    expect(html).toContain("Tank kamu main di Liga 2.");
    expect(html).toContain("Lihat Liga 2");
  });

  test("this month's ranking lists the tanks without a place after a line", () => {
    const html = render(props({ tab: "ranking", side: "month" }, 16));
    expect(html).toContain("Not ranked yet");
  });

  test("the month close's notice, the finished day at midnight, and yesterday's winner", () => {
    expect(render(props({ seat: fixtureSeat(1), onJoin: null, move: FIXTURE_MOVE }, 16), "id")).toContain("Tank kamu naik ke Liga 1.");
    const done = render(props({ dayChange: { kind: "done", day: "2026-11-13", winner: fixtureDays(1)[0] ?? null } }), "id");
    expect(done).toContain("Ronde 13 November 2026 sudah selesai.");
    expect(done).toContain("Ronde baru sudah mulai, dan semua tank mulai lagi dari 0 poin.");
    expect(render(props())).toContain("Citra won yesterday&#x27;s round with 31 points.");
  });

  test("the day's end and a refused stream are said in words", () => {
    const live = fixtureLive(1, 5);
    expect(render(props({ load: fixtureLoad({ ...live, dayEndsInMs: 0 }, NOW) }), "id")).toContain("Ronde ditutup");
    const failed = render(props({ load: { kind: "connecting" }, connection: "failed" }));
    expect(failed).toContain("The page cannot show this league right now, so try again.");
    expect(failed).toContain("Try again");
  });
});

describe("the arena condition", () => {
  test("names the round's rules beside the clock as a button with its note, and the reshuffle names the new one", () => {
    expect(render(props())).toMatch(/<button[^>]*data-arena-condition="standard"[^>]*>[\s\S]*?Arena condition: Standard</);
    const id = render(props(), "id");
    expect(id).toContain(">Kondisi arena: Standar<");
    expect(id).toMatch(/data-arena-condition-note[\s\S]*Tembakan sampai 3 petak[\s\S]*Kondisi arena diundi saat ronde dimulai dan setiap beberapa menit/);
    expect(render(props({ reshuffled: true }), "id")).toMatch(/data-reshuffled[\s\S]*>Diacak ulang<[\s\S]*>Kondisi arena: Standar</);
  });

  test("each hybrid board draws the named conditions and its weather notice in both languages", () => {
    const expected = {
      fourQuarters: { en: "Four quarters", id: "Empat penjuru", areas: ["standard", "dry-spell", "downpour", "arms-length"] },
      eyeOfStorm: { en: "Eye of the storm", id: "Mata badai", areas: ["standard", "dry-spell", "downpour"] },
      rainFront: { en: "Rain front", id: "Front hujan", areas: ["standard", "downpour"] },
      hills: { en: "Hills", id: "Bukit", areas: ["standard", "sharp-eyes"] },
    };
    for (const layout of ARENA_LAYOUT_IDS) {
      const story = expected[layout];
      const live = fixtureLive(1, 5, layout);
      const changed = props({ load: fixtureLoad(live, NOW), weatherChanged: true });
      const english = render(changed);
      const indonesian = render(changed, "id");
      expect(english).toContain(`data-arena-layout="${layout}"`);
      expect([...new Set(Array.from(english.matchAll(/data-arena-area="([^"]+)"/g), ([, area]) => area))]).toEqual(story.areas);
      expect(english).toContain("data-area-edge");
      expect(english).toContain(`Arena condition: ${story.en}`);
      expect(english).toContain(`The arena condition changed to ${story.en}.`);
      expect(indonesian).toContain(`Kondisi arena: ${story.id}`);
      expect(indonesian).toContain(`Kondisi arena berubah menjadi ${story.id}.`);
    }
  });

  test("weather names the new condition in both languages and fits the board to its new size", () => {
    const live = fixtureLive(1, 16, "open-field");
    const { width, height } = arenaSize(16, ruleSet("open-field"));
    const changed = props({ load: fixtureLoad(live, NOW), weatherChanged: true });
    const en = render(changed);
    const id = render(changed, "id");
    expect(en).toMatch(/data-weather-changed[^>]*>The arena condition changed to Open field\.</);
    expect(id).toMatch(/data-weather-changed[^>]*>Kondisi arena berubah menjadi Lapangan luas\.</);
    expect(id).toMatch(/data-arena-condition="open-field"[^>]*>[\s\S]*?Kondisi arena: Lapangan luas</);
    expect(en).toContain(`aspect-ratio:${boardAspect(width, height)}`);
    expect(en).toContain(`viewBox="-3 -3 ${width * 10 + 6} ${height * 10 + 6}"`);
    expect(id).not.toContain("data-reshuffled");
    expect(render({ ...changed, weatherChanged: false })).not.toContain("data-weather-changed");
  });
});

describe("a reshuffle", () => {
  test("says Reshuffled over the board in both languages, and nothing without one", () => {
    expect(render(props({ reshuffled: true }))).toContain(">Reshuffled<");
    expect(render(props({ reshuffled: true }), "id")).toContain(">Diacak ulang<");
    expect(render(props())).not.toContain("data-reshuffled");
  });

  test("a fresh start reaches the SVG without showing the rebuild notice", () => {
    const live = fixtureLive(1, 5);
    const load = fixtureLoad(live, NOW);
    const from = live.board.bots[0];
    if (load.kind !== "ready" || from === undefined) throw new Error("expected a tank on the board");
    const snapshot = { ...live.board, bots: [{ ...from, x: from.x + 1 }, ...live.board.bots.slice(1)] };
    const html = render(props({ load: { ...load, board: { ...load.board, snapshot, tunnels: [{ kind: "through", from }] } } }), "id");
    expect(html).toContain(`data-tunnel-from="${from.id}"`);
    expect(html).toContain(`data-tunnel-to="${from.id}"`);
    expect(html).not.toContain("data-reshuffled");
  });
});

describe("a tank that quit today", () => {
  test("keeps its row in today's ranking with Left after its name, in both languages", () => {
    const html = render(props({ tab: "ranking", side: "today" }, 16));
    expect(html).toMatch(/data-player-id="seat-left"[\s\S]*?>Rangga<\/span><span[^>]*>Left</);
    expect(render(props({ tab: "ranking", side: "today" }, 16), "id")).toMatch(/>Rangga<\/span><span[^>]*>Keluar</);
    // A seated tank has no tag.
    expect(html).not.toMatch(/>Bima<\/span><span[^>]*>Left</);
  });
});

describe("the seated player's phone layout", () => {
  const seat = fixtureSeat(1);
  const words = {
    en: { tabs: ["Arena", "Ranking", "Your tank", "Activity"], rules: "Change rules", look: "Change look" },
    id: { tabs: ["Arena", "Peringkat", "Tank kamu", "Aktivitas"], rules: "Ubah aturan", look: "Ubah tampilan" },
  } as const;

  for (const language of ["en", "id"] as const) {
    test(`the bar has only four tabs in ${language} and both change actions are in the tank pane`, () => {
      const labels = words[language];
      const bar = renderToStaticMarkup(
        <I18nProvider store={createLanguageStore({ store: null, initial: language })}>
          <MonthlyPhoneBar seat={seat} onJoin={null} tab="arena" onTab={() => undefined} />
        </I18nProvider>,
      );
      expect(bar.match(/<button /g)?.length).toBe(4);
      expect(Array.from(bar.matchAll(/data-tab="([^"]+)"/g), ([, tab]) => tab)).toEqual(["arena", "ranking", "mine", "activity"]);
      for (const label of labels.tabs) expect(bar).toContain(`>${label}</span>`);

      const html = render(props({ seat, onJoin: null, tab: "mine" }, 16), language);
      const pane = html.match(/<section data-own-pane=""[\s\S]*?<\/section>/)?.[0] ?? "";
      expect(pane).toMatch(new RegExp(`data-change-rules=""[^>]*><span[^>]*>${labels.rules}</span>`));
      expect(pane).toMatch(new RegExp(`data-change-look=""[^>]*><span[^>]*>${labels.look}</span>`));
      for (const tab of ["arena", "ranking", "activity"] as const) {
        expect(render(props({ seat, onJoin: null, tab }, 16), language)).not.toMatch(/data-change-(rules|look)/);
      }
    });
  }
});

describe("the ultimate in the monthly tank step", () => {
  const noop = () => undefined;
  const done = async () => undefined;
  const seat = fixtureSeat(1);
  const draft = { ...seat.strategy, ultimate: "whirlwind" as const };
  const strategy: StrategyHandle = {
    load: { kind: "ready", saved: seat.strategy, draft },
    save: { kind: "idle" },
    dirty: true,
    pending: false,
    valid: true,
    setDraft: noop,
    saveDraft: done,
    saveStrategy: done,
    refreshSaved: async () => null,
    clearSaveError: noop,
    reload: noop,
  };

  test("joining shows the ultimate in the draft that will take the seat", () => {
    const html = renderToStaticMarkup(
      <ToastProvider>
        <TankStep strategy={strategy} look={seat.look} playerName={seat.name} submitting={false} problem={null}
          purpose={{ kind: "join" }} nowMs={ULTIMATES_FROM} onBack={noop} onSubmit={noop} />
      </ToastProvider>,
    );
    expect(html).toMatch(/data-monthly-tank-action[^>]*><a data-ultimate-link="whirlwind" href="\/catalogue\?section=ultimates&amp;card=whirlwind"/);
    expect(html).not.toContain("Coming soon");
  });

  test("editing rules shows the new ultimate alongside the update action", () => {
    const html = renderToStaticMarkup(
      <ToastProvider>
        <TankStep strategy={strategy} look={seat.look} playerName={seat.name} submitting={false} problem={null}
          purpose={{ kind: "changeRules" }} nowMs={ULTIMATES_FROM} onBack={noop} onSubmit={noop} />
      </ToastProvider>,
    );
    expect(html.match(/data-monthly-tank-action[^>]*><a data-ultimate-link="([^"]+)"/)?.[1]).toBe(draft.ultimate);
  });
});
