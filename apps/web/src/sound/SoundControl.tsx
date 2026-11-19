// The sound button in every page header and on the big screen. It opens a small panel with two
// switches, "Music" and "Sound effects"; the button shows a crossed speaker when both are off.
// The panel is a modal dialog placed under the button: focus moves into it, Escape and a tap
// outside close it, and focus returns to the button. Its width follows the body text size, so
// the big screen's larger type gets a wider panel.

import { Volume2, VolumeX, X } from "lucide-react";
import { useEffect, useId, useRef, useState, type CSSProperties } from "react";
import { useMessages } from "../i18n/I18nProvider.tsx";
import { IconButton } from "../ui/IconButton.tsx";
import { Switch } from "../ui/Switch.tsx";
import { useMusicState, useMusicSwitch } from "./music.ts";
import type { MusicState } from "./musicMachine.ts";
import { playSound } from "./player.ts";
import { useSoundSettings } from "./setting.ts";

/**
 * The switches carry no sentence under them (owner, 2026-11-19: "no need for description on the audio
 * settings"). Only a failed load gets one, because the switch alone cannot say the music is missing.
 */
export function musicLine(on: boolean, state: MusicState): "musicFailed" | undefined {
  return on && state === "failed" ? "musicFailed" : undefined;
}

/** 8px under the button, its right edge on the button's right edge, and never closer than 8px to either side of the viewport. */
function placeUnder(button: HTMLElement): CSSProperties {
  const box = button.getBoundingClientRect();
  const right = Math.max(8, window.innerWidth - box.right);
  return { top: box.bottom + 8, right, maxWidth: `calc(100vw - ${right + 8}px)` };
}

export function SoundControl() {
  const m = useMessages().sound;
  const [settings, setSettings] = useSoundSettings();
  const music = useMusicSwitch();
  const musicState = useMusicState();
  const [open, setOpen] = useState(false);
  const [place, setPlace] = useState<CSSProperties>({});
  const dialog = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const allOff = !music.on && !settings.effects;

  useEffect(() => {
    const element = dialog.current;
    if (element === null) return;
    if (open && !element.open) element.showModal();
    if (!open && element.open) element.close();
    if (!open) return;
    const follow = () => {
      if (opener.current !== null) setPlace(placeUnder(opener.current));
    };
    window.addEventListener("resize", follow);
    return () => window.removeEventListener("resize", follow);
  }, [open]);

  function show(): void {
    playSound("tap");
    if (opener.current !== null) setPlace(placeUnder(opener.current));
    setOpen(true);
  }

  function close(): void {
    setOpen(false);
    requestAnimationFrame(() => opener.current?.focus());
  }

  return (
    <>
      <button
        ref={opener}
        type="button"
        aria-label={m.label}
        title={m.label}
        aria-haspopup="dialog"
        aria-expanded={open}
        data-sound-open=""
        data-music-state={musicState}
        onClick={show}
        className={`press inline-flex size-11 min-w-11 shrink-0 items-center justify-center rounded-[var(--radius-control)] border-2 border-b-4 border-line bg-panel hover:border-line-strong active:bg-ground ${allOff ? "text-muted" : "text-ink"}`}
      >
        {allOff ? <VolumeX aria-hidden size={22} /> : <Volume2 aria-hidden size={22} />}
      </button>
      <dialog
        ref={dialog}
        aria-labelledby={titleId}
        data-sound=""
        style={place}
        onCancel={(event) => {
          event.preventDefault();
          close();
        }}
        onClick={(event) => {
          if (event.target === event.currentTarget) close();
        }}
        className="fixed m-0 w-[min(calc(var(--text-body,1rem)*20),calc(100vw-1rem))] max-h-[calc(100dvh-5rem)] rounded-[var(--radius-card)] border-0 bg-panel p-0 text-ink shadow-[var(--shadow-raised)] [inset:auto] backdrop:bg-ink/20"
      >
        {open ? (
          <div className="flex flex-col gap-2 p-4">
            <div className="flex min-w-0 items-center gap-3">
              <h2 id={titleId} className="min-w-0 flex-1 font-display text-lead font-semibold [overflow-wrap:anywhere]">
                {m.label}
              </h2>
              <IconButton label={m.close} icon={<X aria-hidden size={22} />} variant="quiet" data-sound-close="" onClick={close} />
            </div>
            <Switch label={m.music} {...(musicLine(music.on, musicState) === undefined ? {} : { description: m.musicFailed })} on={music.on} onChange={music.set} />
            <VolumeSlider label={m.musicVolume} value={settings.musicVolume} disabled={!music.on} onChange={(musicVolume) => setSettings({ musicVolume })} />
            <Switch
              label={m.effects}
              on={settings.effects}
              onChange={(on) => {
                setSettings({ effects: on });
                // Turning effects on answers with a sound, so the person hears that it works.
                if (on) playSound("tap");
              }}
            />
            {/* Letting go of the effects slider plays a tap at the new level, so the person hears where it is. */}
            <VolumeSlider label={m.effectsVolume} value={settings.effectsVolume} disabled={!settings.effects} onChange={(effectsVolume) => setSettings({ effectsVolume })} onRelease={() => playSound("tap")} />
          </div>
        ) : null}
      </dialog>
    </>
  );
}

/**
 * One level, 0 to 100 percent, under its switch (owner, 2026-11-19: "a slider for player to choose their liking on
 * sound level"). The switch above names it, so the slider shows no words of its own; its accessible name says which
 * level it is. A native range input, so keys, touch and screen readers work without extra code.
 */
function VolumeSlider({ label, value, disabled, onChange, onRelease }: {
  readonly label: string;
  readonly value: number;
  readonly disabled: boolean;
  onChange(volume: number): void;
  onRelease?: () => void;
}) {
  const percent = Math.round(value * 100);
  return (
    <input
      type="range"
      min={0}
      max={100}
      step={5}
      value={percent}
      aria-label={label}
      aria-valuetext={`${percent}%`}
      disabled={disabled}
      data-volume-slider=""
      onChange={(event) => onChange(Number(event.currentTarget.value) / 100)}
      {...(onRelease === undefined ? {} : { onPointerUp: onRelease, onKeyUp: onRelease })}
      className="mb-1 h-11 w-full min-w-0 cursor-pointer accent-[var(--color-water,#1667c0)] disabled:cursor-not-allowed disabled:opacity-50"
    />
  );
}
