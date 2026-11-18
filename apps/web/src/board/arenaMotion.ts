// Motion rules of the arena SVG. They live in one stylesheet because CSS
// animations need keyframes, and the SVG carries them so the board works
// wherever it is placed. Colours are not set here: each shape sets its own.
//
// The markup of every effect is its still picture. Motion is added only when the
// board is live (class ab-live) and the viewer allows motion, so a paused turn and
// reduced motion show the shots of the turn without movement. Every effect is keyed
// by the turn and ends at rest: the jet, splash and "+1" fade out, the hit tank
// stops wobbling. A hit layers four of these, a miss two, a dry shot one, and a
// blocked throw three (jet, open umbrella, recoil).
//
// Items (84-items.md) add the only motion that repeats while the board is live: a
// pinwheel's blades and a dizzy tank's stars turn, and an item in its last turns
// blinks. A new item and a newly held one pop in once. Under reduced motion they
// stand still, and a blinking item shows at the lower strength of its blink.
//
// The splash and the puff hold at full strength through the middle of the effect
// (38% to 75% of it, about 330 ms at 0.9 s per turn) before they fade, because an
// easing over the whole fade made them drop below half strength within 70 ms of
// appearing, too short to see at the slower pace. Each keyframe names its own easing.
//
// Avoid the characters & < > and quotes in this text: React escapes them inside
// a style element and the escaped text is not valid CSS.

export const ARENA_MOTION_CSS = `
.ab-move { transition: transform var(--tick-ms, 200ms) linear; }
.ab-anim { transform-box: fill-box; transform-origin: center; }
.ab-tunnel-sink { opacity: 0; }
@media (prefers-reduced-motion: no-preference) {
  .ab-live .ab-jet { animation: ab-jet var(--fx-ms, 400ms) ease-out both; }
  .ab-live .ab-splash { animation: ab-splash var(--fx-ms, 400ms) linear both; }
  .ab-live .ab-puff { animation: ab-puff var(--fx-ms, 400ms) linear both; }
  .ab-live .ab-dry { animation: ab-dry var(--fx-ms, 400ms) ease-out both; }
  .ab-live .ab-wobble { animation: ab-wobble var(--fx-ms, 400ms) ease-in-out both; }
  .ab-live .ab-recoil { animation: ab-recoil var(--fx-ms, 400ms) ease-out both; }
  .ab-live .ab-plus { animation: ab-plus var(--fx-ms, 400ms) cubic-bezier(0.34, 1.56, 0.64, 1) both; }
  .ab-you-pulse { animation: ab-you-pulse 1.2s ease-in-out infinite; }
  .ab-live .ab-umbrella { animation: ab-umbrella var(--fx-ms, 400ms) linear both; }
  .ab-live .ab-item-in { animation: ab-item-in 420ms cubic-bezier(0.34, 1.56, 0.64, 1) both; }
  .ab-live .ab-item-fade { animation: ab-item-fade 900ms ease-in-out infinite; }
  .ab-live .ab-pinwheel { animation: ab-spin 2.4s linear infinite; }
  .ab-live .ab-dizzy { animation: ab-spin 1.4s linear infinite; }
  .ab-live .ab-tunnel-sink { animation: ab-tunnel-sink var(--tick-ms, 900ms) ease-in both; }
  .ab-live .ab-tunnel-rise { animation: ab-tunnel-rise var(--tick-ms, 900ms) ease-out both; }
  .ab-live .ab-tunnel-dust-sink { animation: ab-tunnel-dust-sink var(--tick-ms, 900ms) ease-out both; }
  .ab-live .ab-tunnel-dust-rise { animation: ab-tunnel-dust-rise var(--tick-ms, 900ms) ease-out both; }
  .ab-live .ab-tunnel-camera { animation: ab-tunnel-camera var(--tick-ms, 900ms) steps(1, end) both; }
}
@keyframes ab-tunnel-sink {
  0% { opacity: 1; transform: none; }
  45%, 100% { opacity: 0; transform: translateY(1px) scale(0.55, 0.2); }
}
@keyframes ab-tunnel-rise {
  0%, 45% { opacity: 0; transform: translateY(1px) scale(0.55, 0.2); }
  85%, 100% { opacity: 1; transform: none; }
}
@keyframes ab-tunnel-dust-sink {
  0% { opacity: 0; transform: scale(0.65); }
  18% { opacity: 1; }
  45%, 100% { opacity: 0; transform: scale(1.35); }
}
@keyframes ab-tunnel-dust-rise {
  0%, 45% { opacity: 0; transform: scale(0.65); }
  62% { opacity: 1; }
  100% { opacity: 0; transform: scale(1.35); }
}
@keyframes ab-tunnel-camera {
  0% { transform: translate(var(--tunnel-from-x), var(--tunnel-from-y)); }
  45%, 100% { transform: translate(var(--tunnel-to-x), var(--tunnel-to-y)); }
}
@keyframes ab-umbrella {
  0%, 20% { opacity: 0; transform: scale(0.2, 0.5); animation-timing-function: cubic-bezier(0.34, 1.56, 0.64, 1); }
  38% { opacity: 1; transform: scale(1); animation-timing-function: linear; }
  78% { opacity: 1; transform: scale(1); animation-timing-function: ease-in; }
  100% { opacity: 0; transform: scale(0.9); }
}
@keyframes ab-item-in {
  0% { opacity: 0; transform: scale(0.3); }
  100% { opacity: 1; transform: scale(1); }
}
@keyframes ab-item-fade {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.35; }
}
@keyframes ab-spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}
@keyframes ab-jet {
  0% { stroke-dashoffset: 1; opacity: 1; }
  30% { stroke-dashoffset: 0; opacity: 1; }
  60% { opacity: 1; }
  100% { stroke-dashoffset: 0; opacity: 0; }
}
@keyframes ab-splash {
  0%, 25% { opacity: 0; transform: scale(0.3); animation-timing-function: cubic-bezier(0.16, 1, 0.3, 1); }
  38% { opacity: 1; transform: scale(1); animation-timing-function: linear; }
  75% { opacity: 1; transform: scale(1.2); animation-timing-function: ease-in; }
  100% { opacity: 0; transform: scale(1.35); }
}
@keyframes ab-puff {
  0%, 30% { opacity: 0; transform: scale(0.4); animation-timing-function: ease-out; }
  40% { opacity: 1; transform: scale(1); animation-timing-function: linear; }
  70% { opacity: 1; transform: scale(1.2); animation-timing-function: ease-in; }
  100% { opacity: 0; transform: scale(1.4); }
}
@keyframes ab-dry {
  0% { opacity: 0; transform: scale(0.4); }
  20% { opacity: 1; transform: scale(1); }
  70% { opacity: 1; }
  100% { opacity: 0; transform: scale(0.7); }
}
@keyframes ab-wobble {
  0%, 25% { transform: none; }
  35% { transform: rotate(-12deg) translateX(1px); }
  50% { transform: rotate(8deg); }
  65%, 100% { transform: none; }
}
@keyframes ab-recoil {
  0% { transform: none; }
  8% { transform: translateX(-1.4px); }
  30%, 100% { transform: none; }
}
@keyframes ab-plus {
  0%, 25% { opacity: 0; transform: translateY(2px) scale(0.6); }
  40% { opacity: 1; transform: translateY(-1px) scale(1.15); }
  80% { opacity: 1; transform: translateY(-4px) scale(1); }
  100% { opacity: 0; transform: translateY(-6px) scale(1); }
}
@keyframes ab-you-pulse {
  0%, 100% { transform: scale(1); opacity: 1; }
  50% { transform: scale(1.18); opacity: 0.55; }
}
@media (prefers-reduced-motion: reduce) {
  .ab-move { transition: none; }
}
`;
