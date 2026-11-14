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
| Where it plays | Everywhere except the big screen's presenter view, where it is off unless the presenter turns it on. One track for the whole game. |
| Control | The header's sound button opens a small panel with two switches, "Musik" and "Efek suara" ("Music", "Sound effects"); the button shows whether everything is off. Default: music on, effects as today. Both choices are remembered in the browser (the existing sound setting's storage; migrate it). `prefers-reduced-motion` does not affect sound. The header must still fit at 360 px. |
| Tests | The setting's store and migration; the player's state machine (table in the file header: off, waiting for a gesture, loading, playing, ducked, hidden) with an injected audio context; the audit for the header with the panel open at 360 x 640 and 1728 x 1000 in both languages. |

Checks without ears, per track: integrated loudness, true peak under -3 dBTP, the spectrum's share above 6 kHz, and the loop seam (the RMS and the waveform's value and slope at the loop point match within a small tolerance).

You own `tools/music/**`, `apps/web/public/music/**`, the web app's sound feature folder and the header's sound control. Other builders are changing the monthly league (engine, server, monthly pages) and the repository's documentation files; edit shared files with small targeted edits after re-reading them.

Never `bun run build`; never port 8787; build to your own scratch folder and serve on port 9008; one headless browser. Report briefly, with the three files for the owner to listen to as WAV or MP3 paths.
