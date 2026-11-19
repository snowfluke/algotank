# Work package B1: background music

Read `00-overview.md` and `60-no-scroll.md`. Owner, 2026-11-14: "build a comfy, relaxing, non-obstructing bgm music for the game".

## Decisions

| Topic | Decision |
|-------|----------|
| Source | Synthesised by a script in the repository (`tools/music/`, Python with numpy, the way `promo/tools/music.py` does it), so the music is the project's own work under the project's licence. No samples from elsewhere. |
| Candidates | Three tracks for the owner to choose by ear, because nobody in the build can listen: A soft mallets (kalimba or marimba) with a warm pad; B mellow electric piano with a quiet brushed beat; C slow ambient pads with sparse plucks. Each 90 to 150 s, 70 to 90 BPM, major or pentatonic, no sharp attacks, no melody that demands attention, little energy above 6 kHz, nothing that masks the game's own effect sounds. A is wired in until the owner chooses; the choice is one constant. |
| Loop | Seamless: the end flows into the start (the script renders the loop region with the tail of the last bar mixed into the first). Played through Web Audio from a decoded buffer with loop points, so an encoder's padding makes no gap. |
| File | One file per track in `apps/web/public/music/`, AAC or MP3 at a rate that keeps each under 1.5 MB, fetched only when music is on and after the first tap or key press (browsers block sound before that). Long cache lifetime; not part of the app's first load. |
| Level | Quiet: about -30 LUFS at the output with the control at its default, at least 12 dB under the effect sounds. It lowers by a further 6 dB for 1 s around the player's own shot and hit sounds, and fades in and out over 1 s on start, stop and tab hidden (it stops when the page is hidden). |
| Where it plays | Everywhere except the big screen's presenter view, where it is off unless the presenter turns it on. The track follows the arena condition (see below). |
| Control | The header's sound button opens a small panel with two switches, "Musik" and "Efek suara" ("Music", "Sound effects"); the button shows whether everything is off. Default: music on, effects as today. Both choices are remembered in the browser (the existing sound setting's storage; migrate it). `prefers-reduced-motion` does not affect sound. The header must still fit at 360 px. |
| Tests | The setting's store and migration; the player's state machine (table in the file header: off, waiting for a gesture, loading, playing, ducked, hidden) with an injected audio context; the audit for the header with the panel open at 360 x 640 and 1728 x 1000 in both languages. |

Checks without ears, per track: integrated loudness, true peak under -3 dBTP, the spectrum's share above 6 kHz, and the loop seam (the RMS and the waveform's value and slope at the loop point match within a small tolerance).

You own `tools/music/**`, `apps/web/public/music/**`, the web app's sound feature folder and the header's sound control. Other builders are changing the monthly league (engine, server, monthly pages) and the repository's documentation files; edit shared files with small targeted edits after re-reading them.

Never `bun run build`; never port 8787; build to your own scratch folder and serve on port 9008; one headless browser. Report briefly, with the three files for the owner to listen to as WAV or MP3 paths.

Status 2026-11-14: the owner chose track A; B and C are removed.

## Sound panel text (2026-11-19)

Owner, 2026-11-19: "no need for description on the audio settings". The two switches show only their labels, Music and Sound effects. One sentence remains: when the music cannot load, the panel says so under the music switch, because the switch alone cannot show that the music is missing.

## Music by arena condition (2026-11-19)

Owner, 2026-11-19: "Changing season or arena condition also changes the bgm."

| Arena condition | Track | Title | Key | BPM |
|---|---|---|---|---:|
| `standard` | `a-mallets-v2.mp3` | Mallets with a warm pad over a beat | F major | 126 |
| `dry-spell` | `b-dry-v2.mp3` | Musim kering: sunny and dry | D mixolydian | 120 |
| `downpour` | `c-rain-v2.mp3` | Hujan deras: a storm | Bb major | 126 |
| `arms-length` | `d-close-v2.mp3` | Jarak dekat: close and bouncy | C major | 140 |
| `open-field` | `e-open-v2.mp3` | Lapangan luas: wide open | G major | 120 |
| `sharp-eyes` | `f-sharp-v2.mp3` | Mata tajam: focused | E dorian | 135 |

Owner, 2026-11-19: "Lower the bgm" and "rework all the bgm to be slightly energetic and not sleepy, it is a
battleground after all". Version 2 of every track keeps its key, chords and tunes, and adds a beat: a kick on 1 and 3
(every beat in Jarak dekat), a clap on 2 and 4 with a fill every 8 bars, eighth-note hi-hats that turn to sixteenths
in the second half, and an eighth-note bass. The tempo rose from 70-100 BPM to 120-140 BPM, the low-pass opened from
3-5 kHz to 7-9 kHz so the hats come through, and the reverb shortened. The player's music gain fell from -9.5 dB to
-13 dB (`MUSIC_GAIN`), so the music sits about 33.5 LUFS, under the effects.

The monthly league follows the condition in its live snapshot, including a weather change within a round (spec 77). The room's live board, the presenter and the big screen follow the current round's snapshot. The practice board follows the test run's condition. Pages without a current condition play Standard.

When music is playing, it keeps the current track sounding until the new file has loaded and decoded. The new track starts at its measured loop start, fading in as the old one fades out over `FADE_SECONDS` (1 second). The combined gain stays at or below the usual level, and both tracks share the same ducking gain. The player caches decoded files for the visit. While music is off, hidden or loading, a condition change records the latest choice for when playback can start.

If a new file fails to load, the player logs the error and keeps the current track playing. If playback is starting, it resumes the last track or uses Standard on the first start. The sound panel shows a failure only when playback cannot start.
