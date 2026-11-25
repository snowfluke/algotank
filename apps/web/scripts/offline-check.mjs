// The acceptance check of the offline build (src/offline/target.ts, scripts/pack-offline.sh).
//
//   cd apps/web && node scripts/offline-check.mjs [folder, default dist-offline]
//
// It serves the folder under /portal/game-1/ (404 everywhere else, as a game portal would), then plays the
// workshop in headless Chromium: a new play style, a test match to its result, the catalogue and the rules
// guide, My tank, a reload; and once more inside <iframe sandbox="allow-scripts">, where storage is blocked.
// It fails on a request outside the folder, a failed or 4xx/5xx answer, a console error or warning, a page
// error, or a change of the address. The server sends Access-Control-Allow-Origin, because a sandboxed
// iframe has the origin "null" and a module script needs CORS; a portal that hosts Vite games does the same.
// PLAYWRIGHT=/path/to/@playwright/test/index.mjs imports another installation, as in no-scroll-audit.mjs.

import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";

const ROOT = resolve(process.argv[2] ?? new URL("../dist-offline", import.meta.url).pathname);
const PREFIX = "/portal/game-1/";
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".mp3": "audio/mpeg", ".woff2": "font/woff2" };
const FRAME_PAGE = "/frame.html";

const server = createServer(async (req, res) => {
  const path = decodeURIComponent(new URL(req.url ?? "/", "http://local").pathname);
  if (path === FRAME_PAGE) {
    res.writeHead(200, { "content-type": "text/html" });
    res.end(`<!doctype html><iframe id="game" sandbox="allow-scripts" src="${PREFIX}index.html" style="width:1200px;height:800px;border:0"></iframe>`);
    return;
  }
  const file = normalize(join(ROOT, path.slice(PREFIX.length) || "index.html"));
  if (!path.startsWith(PREFIX) || !file.startsWith(ROOT)) {
    res.writeHead(404).end();
    return;
  }
  try {
    if (!(await stat(file)).isFile()) throw new Error(`${file} is a folder`);
    res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream", "access-control-allow-origin": "*" });
    res.end(await readFile(file));
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((done) => server.listen(0, "127.0.0.1", done));
const address = server.address();
if (address === null || typeof address === "string") throw new Error("The check's server has no port.");
const ORIGIN = `http://127.0.0.1:${address.port}`;
const BASE = `${ORIGIN}${PREFIX}`;
const START = `${BASE}index.html`;

const { chromium } = await import(process.env.PLAYWRIGHT || "@playwright/test");
const browser = await chromium.launch();
const problems = [];

function watch(page, label) {
  page.on("request", (r) => {
    const url = r.url();
    if (url.startsWith("data:") || url.startsWith("blob:") || url === `${ORIGIN}${FRAME_PAGE}`) return;
    if (!url.startsWith(BASE)) problems.push(`${label}: a request outside the folder: ${url}`);
  });
  page.on("requestfailed", (r) => problems.push(`${label}: failed: ${r.url()} ${r.failure()?.errorText}`));
  page.on("response", (r) => {
    if (r.status() >= 400) problems.push(`${label}: ${r.status()} for ${r.url()}`);
  });
  page.on("console", (m) => {
    if (m.type() === "error" || m.type() === "warning") problems.push(`${label}: console ${m.type()}: ${m.text()}`);
  });
  page.on("pageerror", (e) => problems.push(`${label}: page error: ${e.message}`));
}

function expect(ok, what) {
  if (ok) console.log(`ok: ${what}`);
  else problems.push(`not true: ${what}`);
}

// The steps work in both languages, because the sandboxed frame cannot store the language choice.
const NEW_STYLE = /^(New play style|Gaya main baru)$/;
const TRY_IT = /^(Try it|Coba)$/;
const RUN_TEST = /^(Run a test match|Mulai uji coba)$/;

/** The name of the one play style in this browser's workshop library (workshop/library.ts LIBRARY_KEY). */
async function storedStyleName(page) {
  return page.evaluate(() => {
    const raw = localStorage.getItem("algotank:workshop:play-styles");
    const found = raw === null ? null : /"name":"([^"]+)"/.exec(raw);
    return found === null ? null : found[1];
  });
}

async function buildAndTest(scope) {
  await scope.getByRole("button", { name: NEW_STYLE }).first().click({ timeout: 10000 });
  await scope.locator("[data-style-choose]").first().click();
  await scope.locator("[data-ultimate-save]").click();
  await scope.getByRole("tab", { name: TRY_IT }).click();
  await scope.getByRole("button", { name: RUN_TEST }).click();
  await scope.locator("[data-test-show-result]").click({ timeout: 20000 });
  await scope.locator("[data-test-result]").first().waitFor();
}

try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  watch(page, "page");
  await page.goto(START);
  await page.getByText("English", { exact: true }).first().click();
  await page.getByRole("button", { name: "Sound" }).click();
  await page.getByRole("button", { name: "Close" }).click();
  await buildAndTest(page);
  expect(true, "a test match reaches its result");
  await page.getByRole("button", { name: "Back to my play styles" }).click();
  const savedName = await storedStyleName(page);
  expect(savedName !== null && (await page.getByText(savedName, { exact: true }).count()) > 0, `the list shows the saved style (${savedName})`);
  await page.getByRole("button", { name: "Skip the tour" }).click();
  await page.getByRole("link", { name: "Catalogue" }).click();
  await page.locator("[data-catalogue-rules]").click();
  await page.getByRole("button", { name: "Back" }).first().click();
  await page.locator("[data-catalogue-back]").click();
  expect((await page.getByRole("button", { name: NEW_STYLE }).count()) > 0, "back from the rules and the catalogue returns to the workshop");
  await page.getByRole("link", { name: /My tank/ }).click();
  await page.getByText("Flag", { exact: true }).click();
  await page.getByRole("button", { name: "Done" }).click();
  await page.getByRole("link", { name: /AlgoTank/ }).click();
  expect((await page.getByRole("button", { name: NEW_STYLE }).count()) > 0, "the wordmark opens the workshop");
  expect(page.url() === START, `the address stays ${START} (it is ${page.url()})`);
  await page.reload();
  await page.getByRole("button", { name: NEW_STYLE }).first().waitFor();
  expect(savedName !== null && (await page.getByText(savedName, { exact: true }).count()) > 0, "the list still shows the style after a reload");
  await page.close();

  const framed = await browser.newPage({ viewport: { width: 1280, height: 860 } });
  watch(framed, "sandboxed iframe");
  await framed.goto(`${ORIGIN}${FRAME_PAGE}`);
  await buildAndTest(framed.frameLocator("#game"));
  expect(true, "a test match reaches its result inside a sandboxed iframe");
  await framed.close();
} catch (error) {
  problems.push(`a step failed: ${error instanceof Error ? error.message.split("\n").slice(0, 3).join(" ") : String(error)}`);
} finally {
  await browser.close();
  server.close();
}

if (problems.length > 0) {
  console.error(`PROBLEMS:\n${problems.join("\n")}`);
  process.exit(1);
}
console.log("The offline build passed.");
