// Builds the landing page into apps/web/landing/dist: index.html (Indonesian),
// en/index.html (English) and assets/ (the demo's script and data, fonts, images).
//
//   bun run build:landing
//
// The output is plain static files with relative links, so any static host serves it,
// also under a sub-path; Cloudflare Pages serves it (.github/workflows/landing.yml). Every
// button links into the game at GAME_URL. The page reuses the game's drawings,
// tokens, fonts, copy and engine; the build records the demo rounds and fails when
// they stop showing that the order of the rules matters (demo-round.ts).

import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { renderToStaticMarkup } from "react-dom/server";
import { ARENA_MOTION_CSS } from "../src/board/arenaMotion.ts";
import { TankShape } from "../src/tank/TankShape.tsx";
import { YOU_LOOK, demoData, floorMarkup } from "./board-markup.tsx";
import { LANDING_COPY, type LandingLanguage } from "./copy.ts";
import { recordDemo } from "./demo-round.ts";
import { renderPage } from "./page.tsx";

/** The game's public address, with no slash at the end. */
const GAME_URL = "https://algotank.awala.my.id";

const here = (path: string) => fileURLToPath(new URL(path, import.meta.url));
const OUT = here("./dist/");
const ASSETS = `${OUT}assets/`;
const FONTS = here("../node_modules/@fontsource-variable/");

/** Every token line ("--name: value;") of the @theme block in the game's stylesheet, without the animation shorthands. */
const TOKEN_LINE = /^\s*(--[a-z0-9-]+):\s*([^;]+);/;

function themeTokens(): string {
  const css = readFileSync(here("../src/index.css"), "utf8");
  const start = css.indexOf("@theme static {");
  const end = css.indexOf("@keyframes", start);
  if (start < 0 || end < 0) throw new Error("apps/web/src/index.css has no @theme static block with keyframes after its tokens.");
  const tokens = css
    .slice(start, end)
    .split("\n")
    .map((line) => TOKEN_LINE.exec(line))
    .filter((match) => match !== null)
    .filter(([, name]) => !name?.startsWith("--animate-"))
    .map(([, name, value]) => `${name}: ${value};`);
  if (tokens.length === 0) throw new Error("No tokens found in apps/web/src/index.css.");
  return `:root { ${tokens.join(" ")} }`;
}

function bundleClient(): Promise<void> {
  return Bun.build({ entrypoints: [here("./client.ts")], outdir: ASSETS, naming: "demo.js", minify: true, target: "browser" }).then((result) => {
    if (!result.success) throw new AggregateError(result.logs, "The landing page's script did not build.");
  });
}

const PAGES: readonly { language: LandingLanguage; dir: string; base: string; other: string }[] = [
  { language: "id", dir: OUT, base: "", other: "en/" },
  { language: "en", dir: `${OUT}en/`, base: "../", other: "../" },
];

async function build(): Promise<void> {
  const recording = recordDemo();
  const data = demoData(recording);
  const { width, height, cell, wall } = data.board;
  const viewBox = `${-wall} ${-wall} ${width * cell + 2 * wall} ${height * cell + 2 * wall}`;
  const markerTank = renderToStaticMarkup(<TankShape look={YOU_LOOK} self />);
  const pageCss = `${themeTokens()}\n${readFileSync(here("./styles.css"), "utf8")}\n${ARENA_MOTION_CSS}`;

  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(`${OUT}en/`, { recursive: true });
  mkdirSync(ASSETS, { recursive: true });
  await bundleClient();
  writeFileSync(`${ASSETS}demo.json`, JSON.stringify(data));
  copyFileSync(`${FONTS}fredoka/files/fredoka-latin-wght-normal.woff2`, `${ASSETS}fredoka.woff2`);
  copyFileSync(`${FONTS}figtree/files/figtree-latin-wght-normal.woff2`, `${ASSETS}figtree.woff2`);
  copyFileSync(here("../public/favicon.svg"), `${ASSETS}favicon.svg`);
  copyFileSync(here("../../../docs/assets/screenshot-tournament-result.png"), `${ASSETS}tournament-result.png`);

  for (const page of PAGES) {
    const html = renderPage({
      copy: LANDING_COPY[page.language],
      gameUrl: GAME_URL,
      base: page.base,
      otherLanguageHref: page.other,
      css: pageCss.replaceAll("FONT_BASE", `${page.base}assets`),
      floor: floorMarkup(width, height),
      viewBox,
      markerTank,
    });
    writeFileSync(`${page.dir}index.html`, html);
  }
  console.log(`Landing page built in ${OUT} (demo seed ${recording.seed}, places ${recording.rounds.map((round) => round.rank).join(", ")}).`);
}

await build();
