/// <reference types="bun" />
import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { CATALOGS } from "../i18n/catalog.ts";
import { I18nProvider } from "../i18n/I18nProvider.tsx";
import { createLanguageStore } from "../i18n/language.ts";
import { en } from "./messages.ts";
import { EntryCard } from "./EntryCard.tsx";
import { HomePage, monthlyLiveLine } from "./HomePage.tsx";
import { joinProblemSentence } from "./JoinPage.tsx";

describe("HomePage", () => {
  test("offers Play now and the workshop as the two main tiles, then the other three ways in", () => {
    const html = renderToStaticMarkup(<HomePage />);
    const order = ['href="/play"', 'href="/workshop"', 'href="/monthly"', 'href="/join"', 'href="/new/private"', 'href="/new/presenter"'].map((h) => html.indexOf(h));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(html.split("Sign-in needed").length - 1).toBe(2);
    // The workshop needs no account, and every card keeps its sentence until the page measures that it is short.
    expect(html).toContain("Tank workshop");
    expect(html).toContain("then use it in any arena.");
    // The workshop tile is the guide's tile, and the cue points at it.
    expect(html).toMatch(/data-coach="home-workshop"[^>]*bg-guide/);
  });

  test("the monthly arena's entry keeps its live line when the page is short", () => {
    const html = renderToStaticMarkup(<EntryCard detail="brief" href="/monthly" title="Watch the monthly arena" body="See the tanks." live="12 tanks in the monthly arena now." art={null} />);
    expect(html).not.toContain("See the tanks.");
    expect(html).toContain("12 tanks in the monthly arena now.");
    expect(renderToStaticMarkup(<I18nProvider store={createLanguageStore({ store: null, initial: "id" })}><HomePage /></I18nProvider>)).toContain("Tonton arena bulanan");
  });

  test("the cards leave out their sentence only when told the page is short", () => {
    const brief = renderToStaticMarkup(<EntryCard detail="brief" href="/join" title="Join with a code" body="Type the code." art={null} />);
    expect(brief).not.toContain("Type the code.");
    const main = renderToStaticMarkup(<EntryCard tone="water" href="/play" title="Play now" body="Jump in." art={null} />);
    expect(main).toContain("Jump in.");
  });

  test("in the compact form the monthly line is one short line, and none when no tank plays", () => {
    const id = CATALOGS.id;
    expect(monthlyLiveLine(12, true, id)).toBe("12 tank main sekarang");
    expect(monthlyLiveLine(0, true, id)).toBeNull();
    expect(monthlyLiveLine(1, true, CATALOGS.en)).toBe("1 tank playing now");
    expect(monthlyLiveLine(0, false, CATALOGS.en)).toBe("No tank plays in the monthly arena yet.");
  });

  test("a compact row keeps its drawing, title and sign-in note", () => {
    const html = renderToStaticMarkup(<EntryCard detail="compact" href="/new/private" title="Create a private arena" body="Play with friends." note="Sign-in needed" art={<svg data-art="" />} />);
    expect(html).not.toContain("Play with friends.");
    expect(html).toContain("data-art");
    expect(html).toContain("Create a private arena");
    expect(html).toContain("Sign-in needed");
  });

  test("speaks Indonesian when that language is chosen", () => {
    const store = createLanguageStore({ store: null, initial: "id" });
    const html = renderToStaticMarkup(<I18nProvider store={store}><HomePage /></I18nProvider>);
    expect(html).toContain("Main sekarang");
    expect(html).toContain("Gabung pakai kode");
    expect(html).toContain("Bengkel tank");
  });
});

describe("joinProblemSentence", () => {
  test("names the code that was not found", () => {
    expect(joinProblemSentence({ kind: "notFound", code: "K7M2QX" }, en.join)).toContain("K7M2QX");
  });
});
