/// <reference types="bun" />
import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { DEFAULT_PRESET_ID, PRESETS } from "@game/engine";
import { LegendDialog } from "../board/BoardLegend.tsx";
import { I18nProvider } from "../i18n/I18nProvider.tsx";
import { createLanguageStore } from "../i18n/language.ts";
import { en, id } from "./messages.ts";
import { Practice } from "./Practice.tsx";
import { ReplayControls } from "./ReplayControls.tsx";
import { TestOptions } from "./TestOptions.tsx";

const preset = PRESETS.find((candidate) => candidate.id === DEFAULT_PRESET_ID);
if (preset === undefined) throw new Error("no default play style");
const count = (html: string, pattern: string) => html.split(pattern).length - 1;

function inIndonesian(node: React.ReactNode): string {
  return renderToStaticMarkup(<I18nProvider store={createLanguageStore({ store: null, initial: "id" })}>{node}</I18nProvider>);
}

describe("Practice", () => {
  const html = renderToStaticMarkup(<Practice strategy={preset.strategy} name="Ayu" defaultRuleSetId="dry-spell" />);

  test("one run button and one options button, and the options themselves wait behind it", () => {
    expect(count(html, ">Run a test match<")).toBe(1);
    expect(count(html, "data-test-run")).toBe(1);
    expect(html).toContain(`>${en.options}<`);
    expect(html).not.toContain(en.botCount);
  });

  test("the pane fills the box it is given", () => {
    expect(html).toMatch(/class="@container flex min-h-0 min-w-0 flex-1 flex-col/);
  });

  test("a strategy with problems disables the button and says why", () => {
    const broken = renderToStaticMarkup(<Practice strategy={{ modes: [], build: {} }} name="Ayu" defaultRuleSetId="standard" />);
    expect(broken).toContain("rules need a fix before a test match can run.");
    expect(broken).toContain("disabled");
  });

  test("reads in Indonesian", () => {
    const idHtml = inIndonesian(<Practice strategy={preset.strategy} name="Ayu" defaultRuleSetId="standard" />);
    expect(idHtml).toContain(id.run);
    expect(idHtml).toContain(id.options);
  });
});

describe("TestOptions", () => {
  const choices = { opponents: 5, mix: { kind: "eachOnce" } as const, length: "normal" as const, ruleSetId: null };
  const html = renderToStaticMarkup(<TestOptions choices={choices} defaultRuleSetId="dry-spell" onChoices={() => {}} onBack={() => {}} />);

  test("is a step with Back, the bot count, the bot styles, the length and the round rules", () => {
    expect(html).toContain("data-step-sheet");
    expect(html).toContain(en.botCount);
    expect(html).toContain(en.botStyles);
    for (const label of Object.values(en.lengths)) expect(html).toContain(`>${label}<`);
  });

  test("the round rules follow the announced set until the player picks another, and open as a second step", () => {
    expect(html).toContain(">Dry spell<");
    expect(html).toContain("data-test-rules");
    expect(count(html, 'checked=""')).toBe(1); // the "Normal" length
  });
});

describe("ReplayControls", () => {
  const props = { frame: 3, lastFrame: 80, speedId: "normal" as const, onPlay() {}, onPause() {}, onSeek() {}, onSpeed() {} };

  test("the scrubber has a name and states the turn, and play and speed are named", () => {
    const html = renderToStaticMarkup(<ReplayControls {...props} playing={false} />);
    expect(html).toContain('aria-label="Turn"');
    expect(html).toContain('aria-valuetext="Turn 3 of 80"');
    expect(html).toContain(">Play<");
    expect(html).toContain(">Speed<");
  });

  test("playing shows pause, and the end offers to play again", () => {
    expect(renderToStaticMarkup(<ReplayControls {...props} playing />)).toContain(">Pause<");
    expect(renderToStaticMarkup(<ReplayControls {...props} frame={80} playing={false} />)).toContain(">Play again<");
  });
});

describe("LegendDialog", () => {
  test("names the six marks of the board and the items with their two effects, with a picture each, in both languages", () => {
    const html = renderToStaticMarkup(<LegendDialog onClose={() => {}} />);
    expect(count(html, "data-legend-term")).toBe(13);
    // One picture per entry, plus the close icon.
    expect(count(html, "<svg")).toBe(14);
    expect(html).toContain("Water gauge");
    expect(html).toContain("Umbrella");
    expect(html).toContain('aria-label="Close"');
    const idHtml = inIndonesian(<LegendDialog onClose={() => {}} />);
    expect(idHtml).toContain("Takaran air");
    expect(idHtml).toContain("Mahkota");
    expect(idHtml).toContain("Bola lumpur");
  });
});
