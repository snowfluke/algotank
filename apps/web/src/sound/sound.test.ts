/// <reference types="bun" />
import { describe, expect, test } from "bun:test";
import { PREFERENCE_KEYS } from "../app/preferences.ts";
import { createSoundPlayer, REPEAT_WINDOW_MS, type SoundPlayerDeps } from "./player.ts";
import { createSoundSettings, parseSoundSettings } from "./setting.ts";
import type { SoundName } from "./sounds.ts";

// The player hands the context to the synth and never reads it, so a marker object stands in.
const fakeContext = {} as AudioContext;

function harness(overrides: Partial<SoundPlayerDeps> = {}) {
  const played: SoundName[] = [];
  let time = 1000;
  const play = createSoundPlayer({
    getContext: () => fakeContext,
    isMuted: () => false,
    hasGesture: () => true,
    now: () => time,
    synth: (_ctx, name) => played.push(name),
    ...overrides,
  });
  return { play, played, advance: (ms: number) => (time += ms) };
}

describe("playSound", () => {
  test("plays when sound is on after a gesture", () => {
    const h = harness();
    expect(h.play("shot")).toBe(true);
    expect(h.played).toEqual(["shot"]);
  });

  test("is silent when muted", () => {
    const h = harness({ isMuted: () => true });
    expect(h.play("shot")).toBe(false);
    expect(h.played).toEqual([]);
  });

  test("is silent before the first gesture", () => {
    const h = harness({ hasGesture: () => false });
    expect(h.play("win")).toBe(false);
    expect(h.played).toEqual([]);
  });

  test("is silent without the Web Audio API", () => {
    const h = harness({ getContext: () => null });
    expect(h.play("splash")).toBe(false);
    expect(h.played).toEqual([]);
  });

  test("drops a repeat of the same effect within the window, but not a different effect", () => {
    const h = harness();
    h.play("splash");
    h.advance(REPEAT_WINDOW_MS - 1);
    expect(h.play("splash")).toBe(false);
    expect(h.play("shot")).toBe(true);
    h.advance(1);
    expect(h.play("splash")).toBe(true);
    expect(h.played).toEqual(["splash", "shot", "splash"]);
  });

  test("a dropped call does not extend the window", () => {
    const h = harness();
    h.play("tap");
    h.advance(40);
    h.play("tap");
    h.advance(20);
    expect(h.play("tap")).toBe(true);
  });
});

function memoryStore(initial: Record<string, string> = {}) {
  const data: Record<string, string> = { ...initial };
  return { data, store: { getItem: (k: string) => data[k] ?? null, setItem: (k: string, v: string) => void (data[k] = v), removeItem: (k: string) => void delete data[k] } };
}

describe("sound settings", () => {
  test("default to music and effects on, and remember each switch", () => {
    const { data, store } = memoryStore();
    const settings = createSoundSettings(store);
    expect(settings.get()).toEqual({ music: true, effects: true, musicVolume: 1, effectsVolume: 1 });
    settings.set({ music: false });
    expect(createSoundSettings(store).get()).toEqual({ music: false, effects: true, musicVolume: 1, effectsVolume: 1 });
    settings.set({ effects: false });
    expect(JSON.parse(data[PREFERENCE_KEYS.sound] ?? "")).toEqual({ music: false, effects: false, musicVolume: 1, effectsVolume: 1 });
  });

  test("read the single switch of earlier versions: off turns both off, on keeps both on", () => {
    expect(createSoundSettings(memoryStore({ [PREFERENCE_KEYS.sound]: "off" }).store).get()).toEqual({ music: false, effects: false, musicVolume: 1, effectsVolume: 1 });
    expect(createSoundSettings(memoryStore({ [PREFERENCE_KEYS.sound]: "on" }).store).get()).toEqual({ music: true, effects: true, musicVolume: 1, effectsVolume: 1 });
  });

  test("write the new shape after a change to a migrated value", () => {
    const { data, store } = memoryStore({ [PREFERENCE_KEYS.sound]: "off" });
    createSoundSettings(store).set({ effects: true });
    expect(JSON.parse(data[PREFERENCE_KEYS.sound] ?? "")).toEqual({ music: false, effects: true, musicVolume: 1, effectsVolume: 1 });
  });

  test("fall back to the defaults for a value they cannot read, field by field", () => {
    expect(parseSoundSettings("{broken")).toEqual({ music: true, effects: true, musicVolume: 1, effectsVolume: 1 });
    expect(parseSoundSettings("42")).toEqual({ music: true, effects: true, musicVolume: 1, effectsVolume: 1 });
    expect(parseSoundSettings('{"music":false,"effects":"yes"}')).toEqual({ music: false, effects: true, musicVolume: 1, effectsVolume: 1 });
  });

  test("remember each level from 0 to 1, and read a missing or broken level as full", () => {
    const { data, store } = memoryStore();
    createSoundSettings(store).set({ musicVolume: 0.4, effectsVolume: 0.7 });
    expect(createSoundSettings(store).get()).toEqual({ music: true, effects: true, musicVolume: 0.4, effectsVolume: 0.7 });
    expect(JSON.parse(data[PREFERENCE_KEYS.sound] ?? "")).toMatchObject({ musicVolume: 0.4, effectsVolume: 0.7 });
    expect(parseSoundSettings('{"music":true,"effects":true,"musicVolume":3,"effectsVolume":"loud"}')).toMatchObject({ musicVolume: 1, effectsVolume: 1 });
    expect(parseSoundSettings('{"music":true,"effects":true,"musicVolume":-1}').musicVolume).toBe(0);
  });

  test("tell listeners about a change, and not about a repeat of the same value", () => {
    const settings = createSoundSettings(null);
    let calls = 0;
    settings.subscribe(() => calls++);
    settings.set({ music: false });
    settings.set({ music: false });
    expect(calls).toBe(1);
  });
});
