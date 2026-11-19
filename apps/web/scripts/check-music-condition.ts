// Browser check for the real React effects and Web Audio playback, using local files.
// Run with bun apps/web/scripts/check-music-condition.ts after installing Playwright Chromium.
import { chromium } from "@playwright/test";
import { DEFAULT_TRACK, MUSIC_TRACKS, type MusicTrack } from "../src/sound/musicTracks.ts";

const dry = MUSIC_TRACKS["dry-spell"];
const rain = MUSIC_TRACKS.downpour;
const files = Object.fromEntries(await Promise.all([dry, rain, DEFAULT_TRACK].map(async ({ url }) => {
  const file = Bun.file(new URL(`../public${url}`, import.meta.url));
  return [url, Buffer.from(await file.arrayBuffer()).toString("base64")];
})));
const bundle = await Bun.build({
  entrypoints: [new URL("./music-condition.fixture.tsx", import.meta.url).pathname],
  target: "browser",
});
const script = bundle.outputs[0];
if (script === undefined) throw new Error("The monthly music fixture did not build.");

// Chromium can run this single page in a restricted macOS workspace without child renderers.
const browser = await chromium.launch({ args: process.platform === "darwin" ? ["--single-process"] : [] });
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.setContent('<div id="app"></div>');
  await page.evaluate((tracks) => {
    const browserWindow: Window = window;
    browserWindow.fetch = async (input) => {
      const content = tracks[String(input)];
      return content === undefined ? new Response(null, { status: 404 }) : new Response(Uint8Array.fromBase64(content));
    };
    const start = AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start = function (when, offset, duration) {
      start.call(this, when, offset, duration);
      if (this.loop) document.body.dataset["musicLoopEnd"] = String(this.loopEnd);
    };
  }, files);
  await page.addScriptTag({ content: await script.text() });
  const playing = ({ loopEnd }: MusicTrack) => page.locator(`body[data-music-loop-end="${loopEnd}"]`).waitFor({ timeout: 5_000 });

  await page.getByRole("button", { name: "Leave monthly" }).waitFor({ timeout: 5_000 });
  await page.keyboard.press("Shift");
  await playing(dry);
  await page.getByRole("button", { name: "Change weather" }).click();
  await page.locator("[data-weather-changed]").waitFor({ timeout: 5_000 });
  await playing(rain);
  await page.getByRole("button", { name: "Leave monthly" }).click();
  await playing(DEFAULT_TRACK);
  console.log("Monthly weather changes the music, and leaving restores Standard.");
} finally {
  await browser.close();
}
