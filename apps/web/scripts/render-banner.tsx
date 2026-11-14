// Renders the README banner: docs/assets/banner.html, then docs/assets/banner.png (1280 x 640).
//
//   bun apps/web/scripts/render-banner.tsx
//
// The tanks are the web app's own drawing (src/tank/TankShape.tsx) and the colours are the app's
// tokens from src/index.css, so the banner changes when the game's look changes. It needs
// `bun install` (Fredoka and Playwright come from apps/web's dependencies) and Playwright's
// Chromium (`bunx playwright install chromium` in apps/web).

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { renderToStaticMarkup } from "react-dom/server";
import { chromium } from "@playwright/test";
import type { TankLook } from "@game/arena";
import { TankShape } from "../src/tank/TankShape.tsx";

const WIDTH = 1280;
const HEIGHT = 640;
const ROOT = new URL("../../../", import.meta.url);
const OUT_HTML = new URL("docs/assets/banner.html", ROOT);
const OUT_PNG = new URL("docs/assets/banner.png", ROOT);
// Relative to docs/assets/, so the HTML file holds no machine path and opens after `bun install`.
const FONT_URL = "../../apps/web/node_modules/@fontsource-variable/fredoka/files/fredoka-latin-wght-normal.woff2";

// Every "--color-...: value;" line of the @theme block, so the banner uses the app's exact colours.
const TOKEN_LINE = /^\s*(--color-[a-z0-9-]+):\s*([^;]+);/;

function colourTokens(): string {
  const css = readFileSync(new URL("../src/index.css", import.meta.url), "utf8");
  const tokens = css
    .split("\n")
    .map((line) => TOKEN_LINE.exec(line))
    .filter((match) => match !== null)
    .map(([, name, value]) => `${name}: ${value};`);
  if (tokens.length === 0) throw new Error("No --color-* tokens found in apps/web/src/index.css.");
  return tokens.join(" ");
}

// The board: 6 by 4 squares of CELL px. A tank is a 10-unit drawing, scaled to fill most of a square.
const COLS = 6;
const ROWS = 4;
const CELL = 84;
const TANK_SCALE = (CELL * 0.8) / 10;

interface PlacedTank {
  readonly col: number;
  readonly row: number;
  /** Degrees clockwise from east, as TankShape takes it. */
  readonly angle: number;
  readonly look: TankLook;
}

const TANKS: readonly PlacedTank[] = [
  { col: 1, row: 2, angle: 0, look: { colour: 1, skin: "plain", second: 7, plate: null, icon: "star" } },
  { col: 4, row: 2, angle: 180, look: { colour: 2, skin: "stripes", second: 3, plate: null, icon: "heart" } },
  { col: 2, row: 0, angle: 90, look: { colour: 4, skin: "dots", second: 3, plate: null, icon: "bolt" } },
  { col: 5, row: 0, angle: 135, look: { colour: 5, skin: "plain", second: 6, plate: null, icon: "fish" } },
  { col: 0, row: 3, angle: 270, look: { colour: 3, skin: "dots", second: 9, plate: null, icon: "rocket" } },
];

const centre = (index: number) => index * CELL + CELL / 2;

function tankSvg(tank: PlacedTank): string {
  return renderToStaticMarkup(
    <g transform={`translate(${centre(tank.col)} ${centre(tank.row)}) scale(${TANK_SCALE})`}>
      <TankShape look={tank.look} angle={tank.angle} />
    </g>,
  );
}

/** A water shot from the first tank's nozzle to the second tank: a hit moves 1 point to the shooter. */
function shotSvg(): string {
  const [from, to] = TANKS;
  if (from === undefined || to === undefined) throw new Error("The shot needs two tanks.");
  const x1 = centre(from.col) + 5 * TANK_SCALE;
  const x2 = centre(to.col) - 4 * TANK_SCALE;
  const y = centre(from.row);
  return `<line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}" stroke-width="10" stroke-linecap="round" style="stroke: var(--color-water)"/>
    <line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}" stroke-width="4" stroke-linecap="round" style="stroke: var(--color-water-light)"/>`;
}

function boardSvg(): string {
  const width = COLS * CELL;
  const height = ROWS * CELL;
  const lines = [
    ...Array.from({ length: COLS - 1 }, (_, i) => `<line x1="${(i + 1) * CELL}" y1="0" x2="${(i + 1) * CELL}" y2="${height}"/>`),
    ...Array.from({ length: ROWS - 1 }, (_, i) => `<line x1="0" y1="${(i + 1) * CELL}" x2="${width}" y2="${(i + 1) * CELL}"/>`),
  ].join("");
  return `<svg viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="Five toy tanks on a grid; the blue tank shoots water at the red tank">
    <rect width="${width}" height="${height}" rx="14" style="fill: var(--color-arena-floor)"/>
    <g stroke-width="3" style="stroke: var(--color-arena-grid)">${lines}</g>
    ${shotSvg()}
    ${TANKS.map(tankSvg).join("\n    ")}
  </svg>`;
}

function page(): string {
  return `<!doctype html>
<!-- Made by apps/web/scripts/render-banner.tsx; edit the script, not this file. -->
<html lang="en"><head><meta charset="utf-8"><title>AlgoTank banner</title>
<style>
  @font-face { font-family: "Fredoka Variable"; font-weight: 300 700; src: url("${FONT_URL}") format("woff2-variations"); }
  :root { ${colourTokens()} }
  html, body { margin: 0; background: var(--color-ground); }
  body { width: ${WIDTH}px; height: ${HEIGHT}px; overflow: hidden; color: var(--color-ink); font-family: "Fredoka Variable", ui-rounded, system-ui, sans-serif; }
  .wrap { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 48px; align-items: center; height: 100%; padding: 0 64px; box-sizing: border-box; }
  h1 { margin: 0 0 20px; font-size: 104px; font-weight: 700; line-height: 1; }
  p { margin: 0; max-width: 520px; font-size: 32px; font-weight: 500; line-height: 1.3; color: var(--color-muted); }
  .board { padding: 14px; border-radius: 26px; background: var(--color-line-strong); }
  .board svg { display: block; }
</style></head>
<body><div class="wrap">
  <div>
    <h1>AlgoTank</h1>
    <p>Build rules for a toy tank, then watch it play a water fight by itself.</p>
  </div>
  <div class="board">${boardSvg()}</div>
</div></body></html>
`;
}

writeFileSync(OUT_HTML, page());
const browser = await chromium.launch();
try {
  const browserPage = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT }, deviceScaleFactor: 1 });
  await browserPage.goto(OUT_HTML.href);
  const fontLoaded = await browserPage.evaluate(async () => {
    await document.fonts.ready;
    return document.fonts.check('700 104px "Fredoka Variable"');
  });
  if (!fontLoaded) throw new Error(`Fredoka did not load from ${FONT_URL}. Run bun install first.`);
  await browserPage.screenshot({ path: fileURLToPath(OUT_PNG), clip: { x: 0, y: 0, width: WIDTH, height: HEIGHT } });
} finally {
  await browser.close();
}
console.log(`Wrote ${fileURLToPath(OUT_HTML)} and ${fileURLToPath(OUT_PNG)}.`);
