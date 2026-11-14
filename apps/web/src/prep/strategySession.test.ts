/// <reference types="bun" />
import { describe, expect, test } from "bun:test";
import { DEFAULT_PRESET_ID, PRESETS } from "@game/engine";
import type { StrategyInput } from "@game/engine";
import type { Clock } from "../ui/timer.ts";
import { AUTO_SAVE_MS, OFFLINE_RETRY_FIRST_MS, StrategySession, isDirty, type SaveFailure, type SourceResult, type StrategySource } from "./strategySession.ts";

const start = PRESETS.find((preset) => preset.id === DEFAULT_PRESET_ID)!.strategy as StrategyInput;
const edited: StrategyInput = { ...start, build: { reach: 0, aim: 2, dodge: 3 } };
const editedAgain: StrategyInput = { ...start, build: { reach: 0, aim: 1, dodge: 3 } };
const invalid: StrategyInput = { ...start, modes: [{ ...start.modes[0]!, name: "" }, ...start.modes.slice(1)] };

/** A clock whose time moves only when the test says so. */
function fakeClock() {
  let now = 0;
  let timers: { at: number; run: () => void; handle: number }[] = [];
  let next = 1;
  const clock: Clock = {
    now: () => now,
    setTimeout: (run, ms) => {
      timers.push({ at: now + ms, run, handle: next });
      return next++;
    },
    clearTimeout: (handle) => {
      timers = timers.filter((timer) => timer.handle !== handle);
    },
  };
  return {
    clock,
    advance(ms: number) {
      now += ms;
      const due = timers.filter((timer) => timer.at <= now);
      timers = timers.filter((timer) => timer.at > now);
      for (const timer of due) timer.run();
    },
  };
}

const ROUND_RUNNING: SaveFailure = { reason: "roundRunning", describe: () => ({ sentence: "A round is running.", details: [] }) };

/** A server in memory whose next answers the test sets. */
function memorySource() {
  let server: StrategyInput = start;
  let draft: StrategyInput | null = null;
  const answers: SourceResult<void>[] = [];
  const sent: StrategyInput[] = [];
  const source: StrategySource = {
    load: async () => ({ ok: true, data: server }),
    save: async (strategy) => {
      sent.push(strategy);
      const answer = answers.shift() ?? { ok: true, data: undefined };
      if (answer.ok) server = strategy;
      return answer;
    },
    readDraft: () => draft,
    writeDraft: (next) => {
      draft = next;
    },
  };
  return { source, sent, answers, kept: () => draft, server: () => server };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

async function ready() {
  const time = fakeClock();
  const memory = memorySource();
  const session = new StrategySession(memory.source, time.clock, () => undefined);
  session.start();
  await settle();
  return { time, memory, session };
}

describe("automatic save", () => {
  test("saves once, a moment after the last of several edits", async () => {
    const { time, memory, session } = await ready();
    session.setDraft(edited);
    time.advance(AUTO_SAVE_MS - 100);
    session.setDraft(editedAgain);
    time.advance(AUTO_SAVE_MS - 100);
    expect(memory.sent).toHaveLength(0);
    expect(session.getSnapshot().pending).toBe(true);
    time.advance(100);
    await settle();
    expect(memory.sent).toEqual([editedAgain]);
    expect(isDirty(session.getSnapshot().load)).toBe(false);
    expect(session.getSnapshot().pending).toBe(false);
  });

  test("an invalid draft is never sent and is kept in the browser", async () => {
    const { time, memory, session } = await ready();
    session.setDraft(invalid);
    time.advance(AUTO_SAVE_MS * 5);
    await settle();
    expect(memory.sent).toHaveLength(0);
    expect(session.getSnapshot().valid).toBe(false);
    expect(memory.kept()).toEqual(invalid);
  });

  test("hiding the tab saves at once", async () => {
    const { memory, session } = await ready();
    session.setDraft(edited);
    session.flush();
    await settle();
    expect(memory.sent).toEqual([edited]);
  });
});

describe("a failed save", () => {
  test("shows the reason, waits, and Retry saves the kept draft", async () => {
    const { time, memory, session } = await ready();
    memory.answers.push({ ok: false, failure: { reason: "offline", describe: () => ({ sentence: "No connection.", details: [] }) } });
    session.setDraft(edited);
    time.advance(AUTO_SAVE_MS);
    await settle();
    const failed = session.getSnapshot().save;
    expect(failed.kind === "failed" && failed.reason).toBe("offline");
    expect(memory.kept()).toEqual(edited);
    await session.saveDraft();
    expect(memory.sent).toHaveLength(2);
    expect(session.getSnapshot().save.kind).toBe("idle");
    expect(memory.server()).toEqual(edited);
    expect(memory.kept()).toBeNull();
  });

  test("without a connection the clock tries again, waiting longer each time", async () => {
    const { time, memory, session } = await ready();
    const offline: SourceResult<void> = { ok: false, failure: { reason: "offline", describe: () => ({ sentence: "No connection.", details: [] }) } };
    memory.answers.push(offline, offline);
    session.setDraft(edited);
    time.advance(AUTO_SAVE_MS);
    await settle();
    const retryAfter = async (ms: number) => {
      time.advance(ms);
      time.advance(AUTO_SAVE_MS);
      await settle();
    };
    await retryAfter(OFFLINE_RETRY_FIRST_MS);
    expect(memory.sent).toHaveLength(2);
    // The second wait is twice as long, so the first delay alone sends nothing.
    await retryAfter(OFFLINE_RETRY_FIRST_MS);
    expect(memory.sent).toHaveLength(2);
    await retryAfter(OFFLINE_RETRY_FIRST_MS);
    expect(memory.server()).toEqual(edited);
  });

  test("an offline failure is tried again when the browser is online", async () => {
    const { time, memory, session } = await ready();
    memory.answers.push({ ok: false, failure: { reason: "offline", describe: () => ({ sentence: "No connection.", details: [] }) } });
    session.setDraft(edited);
    time.advance(AUTO_SAVE_MS);
    await settle();
    session.online();
    time.advance(AUTO_SAVE_MS);
    await settle();
    expect(memory.server()).toEqual(edited);
  });
});

describe("a change made during a round", () => {
  test("is refused, kept, and saved after the page reports a new phase", async () => {
    const { time, memory, session } = await ready();
    memory.answers.push({ ok: false, failure: ROUND_RUNNING });
    session.setDraft(edited);
    time.advance(AUTO_SAVE_MS);
    await settle();
    const failed = session.getSnapshot().save;
    expect(failed.kind === "failed" && failed.reason).toBe("roundRunning");
    // The round goes on: no request until something changes.
    time.advance(AUTO_SAVE_MS * 10);
    expect(memory.sent).toHaveLength(1);
    // The break starts. PlayerPage calls clearSaveError on each phase change.
    session.clearSaveError();
    time.advance(AUTO_SAVE_MS);
    await settle();
    expect(memory.server()).toEqual(edited);
    expect(session.getSnapshot().save.kind).toBe("idle");
  });

  test("an edit made while a save runs is saved after it", async () => {
    const { time, memory, session } = await ready();
    session.setDraft(edited);
    time.advance(AUTO_SAVE_MS);
    session.setDraft(editedAgain);
    await settle();
    expect(isDirty(session.getSnapshot().load)).toBe(true);
    time.advance(AUTO_SAVE_MS);
    await settle();
    expect(memory.sent).toEqual([edited, editedAgain]);
    expect(isDirty(session.getSnapshot().load)).toBe(false);
  });
});

describe("loading", () => {
  test("a draft kept from an earlier visit is restored and saved", async () => {
    const time = fakeClock();
    const memory = memorySource();
    memory.source.writeDraft(edited);
    const session = new StrategySession(memory.source, time.clock, () => undefined);
    session.start();
    await settle();
    const load = session.getSnapshot().load;
    expect(load.kind === "ready" && load.draft).toEqual(edited);
    time.advance(AUTO_SAVE_MS);
    await settle();
    expect(memory.server()).toEqual(edited);
  });

  test("a refused token calls back, so the page can drop the stored place", async () => {
    let refused = 0;
    const memory = memorySource();
    const source: StrategySource = { ...memory.source, load: async () => ({ ok: false, failure: { reason: "refused", describe: () => ({ sentence: "No.", details: [] }) } }) };
    const session = new StrategySession(source, fakeClock().clock, () => (refused += 1));
    session.start();
    await settle();
    expect(refused).toBe(1);
    expect(session.getSnapshot().load.kind).toBe("failed");
  });
});
