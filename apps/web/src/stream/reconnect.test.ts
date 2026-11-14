/// <reference types="bun" />
import { describe, expect, test } from "bun:test";
import { nextRetryDelayMs, RETRY_FIRST_MS, RETRY_MAX_MS, streamErrorPlan } from "./reconnect.ts";

describe("nextRetryDelayMs", () => {
  test("doubles and stops at the maximum", () => {
    const waits = [RETRY_FIRST_MS];
    for (let i = 0; i < 8; i += 1) waits.push(nextRetryDelayMs(waits[i] ?? 0));
    expect(waits.slice(0, 4)).toEqual([1000, 2000, 4000, 8000]);
    expect(waits.at(-1)).toBe(RETRY_MAX_MS);
    expect(Math.max(...waits)).toBe(RETRY_MAX_MS);
  });
});

describe("streamErrorPlan", () => {
  test("a stream that never opened asks about the arena at once and does not say the connection dropped", () => {
    expect(streamErrorPlan(false, true, RETRY_FIRST_MS)).toEqual({ sayReconnecting: false, checkArenaInMs: 0, reopenAfterCheckMs: RETRY_FIRST_MS });
  });

  test("a stream that never opened while the browser retries (no network) says the connection dropped", () => {
    expect(streamErrorPlan(false, false, RETRY_FIRST_MS)).toEqual({ sayReconnecting: true, checkArenaInMs: null, reopenAfterCheckMs: 0 });
  });

  test("a stream that was open says the connection dropped and waits before it asks", () => {
    expect(streamErrorPlan(true, true, 4000)).toEqual({ sayReconnecting: true, checkArenaInMs: 4000, reopenAfterCheckMs: 0 });
  });

  test("while the browser retries by itself the page only reports", () => {
    expect(streamErrorPlan(true, false, 4000)).toEqual({ sayReconnecting: true, checkArenaInMs: null, reopenAfterCheckMs: 0 });
  });
});
