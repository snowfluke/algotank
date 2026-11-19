// The two sound switches, music and effects, each with its own level. Default: both on, at full level. The browser remembers them
// under the key the single sound switch used before (`algotank:sound`), now as JSON.
// Versions before the music wrote "on" or "off"; "off" turns both off, because a person
// who muted the game did not ask for music to start.

import { useSyncExternalStore } from "react";
import { PREFERENCE_KEYS, readPreference, writePreference } from "../app/preferences.ts";
import { browserStore, type KeyValueStore } from "../session/storage.ts";

export interface SoundSettings {
  readonly music: boolean;
  readonly effects: boolean;
  /** 0 to 1, the person's own level for each (owner, 2026-11-19: "a slider for player to choose their liking on sound level"). */
  readonly musicVolume: number;
  readonly effectsVolume: number;
}

const DEFAULT_SOUND_SETTINGS: SoundSettings = { music: true, effects: true, musicVolume: 1, effectsVolume: 1 };

/** A stored level: a number from 0 to 1, or the default. */
function volumeOf(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : fallback;
}

export interface SoundSettingsStore {
  get(): SoundSettings;
  set(next: Partial<SoundSettings>): void;
  subscribe(onChange: () => void): () => void;
}

/** Reads the stored value. Anything that is not a known shape gives the defaults, because the store is outside the app's control. */
export function parseSoundSettings(stored: string | null): SoundSettings {
  if (stored === null || stored === "on") return DEFAULT_SOUND_SETTINGS;
  if (stored === "off") return { ...DEFAULT_SOUND_SETTINGS, music: false, effects: false };
  let value: unknown;
  try {
    value = JSON.parse(stored);
  } catch {
    return DEFAULT_SOUND_SETTINGS; // a value written by hand or by a broken version
  }
  if (typeof value !== "object" || value === null) return DEFAULT_SOUND_SETTINGS;
  const record = value as Record<string, unknown>;
  return {
    music: typeof record.music === "boolean" ? record.music : DEFAULT_SOUND_SETTINGS.music,
    effects: typeof record.effects === "boolean" ? record.effects : DEFAULT_SOUND_SETTINGS.effects,
    musicVolume: volumeOf(record.musicVolume, DEFAULT_SOUND_SETTINGS.musicVolume),
    effectsVolume: volumeOf(record.effectsVolume, DEFAULT_SOUND_SETTINGS.effectsVolume),
  };
}

export function createSoundSettings(store: KeyValueStore | null): SoundSettingsStore {
  let settings = parseSoundSettings(readPreference(store, PREFERENCE_KEYS.sound));
  const listeners = new Set<() => void>();
  return {
    get: () => settings,
    set(next) {
      const merged = { ...settings, ...next };
      if (merged.music === settings.music && merged.effects === settings.effects && merged.musicVolume === settings.musicVolume && merged.effectsVolume === settings.effectsVolume) return;
      settings = merged;
      writePreference(store, PREFERENCE_KEYS.sound, JSON.stringify(settings));
      for (const listener of listeners) listener();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

export const soundSettings: SoundSettingsStore = createSoundSettings(browserStore());

/** `[settings, set]` for the sound panel and anything that shows whether sound is on. */
export function useSoundSettings(): readonly [SoundSettings, (next: Partial<SoundSettings>) => void] {
  const settings = useSyncExternalStore(soundSettings.subscribe, soundSettings.get, soundSettings.get);
  return [settings, soundSettings.set] as const;
}
