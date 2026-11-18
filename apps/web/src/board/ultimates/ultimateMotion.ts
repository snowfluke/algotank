// The still picture comes from the SVG. Only a live board with motion allowed plays a turn
// (85-ultimates.md). Keep the charge, travel and impact in the same --step at every speed.
export const ULTIMATE_MOTION_CSS = `
.ue-a { transform-box: fill-box; transform-origin: center; }
.ue-ripple { opacity: 0.55; transform: scale(1.7); }
.ue-rise { opacity: 0.9; }
.ue-smoke-puff { opacity: 0.88; }
.ue-suck { transform: translate(calc(var(--dx) * 0.66), calc(var(--dy) * 0.66)); }
.ue-pull { transform: translate(calc(var(--dx) * 0.6), calc(var(--dy) * 0.6)) scale(0.8); }
.ue-drop { transform: translateY(-4px); }
.ue-lob-x { transform: translate(calc(var(--dx) * 0.55), calc(var(--dy) * 0.55)); }
.ue-lob-y { transform: translateY(-7px); }
.ue-fling { transform: translate(var(--dx), var(--dy)); }
@media (prefers-reduced-motion: no-preference) {
  .ab-live .ue-dash-move { transition: transform calc(var(--step) * 0.42) ease-out calc(var(--step) * 0.18); }
  .ab-live .ue-fire { animation: ue-fire var(--step) linear both; }
  .ab-live .ue-ram { animation: ue-ram var(--step) linear both; }
  .ab-live .ue-plus { animation-duration: calc(var(--step) * 0.48); animation-delay: calc(var(--step) * 0.52); }
  .ab-live .ue-held { animation: ue-arrive var(--step) linear both; }

  .ab-live .ue-glow { animation: ue-glow calc(var(--step) * 0.45) ease-out both; }
  .ab-live .ue-ripple { animation: ue-ripple calc(var(--step) * 0.6) cubic-bezier(0.2, 0.7, 0.3, 1) both; animation-delay: var(--d, 0ms); }
  .ab-live .ue-halo { animation: ue-halo calc(var(--step) * 0.5) ease-out both; animation-delay: var(--d, 0ms); }
  .ab-live .ue-rise { animation: ue-rise calc(var(--step) * 0.58) ease-out both; animation-delay: var(--d, 0ms); }
  .ab-live .ue-streak { animation: ue-streak calc(var(--step) * 0.62) ease-out both; animation-delay: var(--d, calc(var(--step) * 0.17)); }
  .ab-live .ue-dust { animation: ue-dust calc(var(--step) * 0.62) ease-out both; animation-delay: var(--d, calc(var(--step) * 0.17)); }
  .ab-live .ue-smoke-in { animation: ue-smoke-in calc(var(--step) * 0.5) cubic-bezier(0.34, 1.56, 0.64, 1) both; animation-delay: var(--d, 0ms); }
  .ab-live .ue-pop { animation: ue-pop calc(var(--step) * 0.45) cubic-bezier(0.34, 1.56, 0.64, 1) both; animation-delay: calc(var(--step) * 0.25); }
  .ab-live .ue-wave { animation: ue-wave calc(var(--step) * 0.7) ease-out both; animation-delay: calc(var(--step) * 0.1); }
  .ab-live .ue-suck { animation: ue-suck calc(var(--step) * 0.55) ease-in both; animation-delay: var(--d, 0ms); }
  .ab-live .ue-lob-x { animation: ue-lob-x calc(var(--step) * 0.48) linear both; animation-delay: calc(var(--step) * 0.17); }
  .ab-live .ue-lob-y { animation: ue-lob-y calc(var(--step) * 0.48) linear both; animation-delay: calc(var(--step) * 0.17); }
  .ab-live .ue-splat { animation: ue-pop calc(var(--step) * 0.16) cubic-bezier(0.34, 1.56, 0.64, 1) both; animation-delay: calc(var(--step) * 0.63); }
  .ab-live .ue-patch { animation: ue-patch calc(var(--step) * 0.2) ease-out both; animation-delay: calc(var(--step) * 0.63); }
  .ab-live .ue-fling { animation: ue-fling calc(var(--step) * 0.2) ease-out both; animation-delay: calc(var(--step) * 0.63); }
  .ab-live .ue-spin { animation: ue-spin calc(var(--step) * 0.72) cubic-bezier(0.3, 0.6, 0.4, 1) both; }
  .ab-live .ue-open { animation: ue-open calc(var(--step) * 0.45) cubic-bezier(0.34, 1.56, 0.64, 1) both; animation-delay: calc(var(--step) * 0.17); }
  .ab-live .ue-field { animation: ue-field calc(var(--step) * 0.5) linear both; }
  .ab-live .ue-pull { animation: ue-pull calc(var(--step) * 0.64) cubic-bezier(0.5, 0, 0.75, 0) both; animation-delay: var(--d, 0ms); }
  .ab-live .ue-drop { animation: ue-drop calc(var(--step) * 0.26) ease-in both; animation-delay: calc(var(--step) * 0.62); }
}
@keyframes ue-fire { 0%, 16% { opacity: 0; } 23%, 78% { opacity: 1; } 100% { opacity: 0; } }
@keyframes ue-ram { 0%, 59% { opacity: 0; } 67%, 83% { opacity: 1; } 100% { opacity: 0; } }
@keyframes ue-arrive { 0%, 69% { opacity: 0; } 83%, 100% { opacity: 1; } }
@keyframes ue-glow { 0% { opacity: 0; } 35% { opacity: 0.9; } 100% { opacity: 0; } }
@keyframes ue-ripple { 0% { transform: scale(0.3); opacity: 1; } 100% { transform: scale(2.2); opacity: 0; } }
@keyframes ue-halo { 0% { transform: scale(0.6); opacity: 0; } 30% { opacity: 1; } 100% { transform: scale(1.5); opacity: 0; } }
@keyframes ue-rise { 0% { transform: translateY(2px) scale(0.4); opacity: 0; } 30% { opacity: 1; } 100% { transform: translateY(-9px) scale(1); opacity: 0; } }
@keyframes ue-streak { 0% { stroke-dashoffset: 1; opacity: 1; } 60% { stroke-dashoffset: 0; opacity: 0.9; } 100% { stroke-dashoffset: 0; opacity: 0; } }
@keyframes ue-dust { 0% { transform: scale(0.3); opacity: 0.9; } 100% { transform: scale(1.6); opacity: 0; } }
@keyframes ue-smoke-in { 0% { transform: scale(0); opacity: 0; } 100% { transform: scale(1); opacity: 0.88; } }
@keyframes ue-pop { 0% { transform: scale(0); opacity: 0; } 100% { transform: scale(1); opacity: 1; } }
@keyframes ue-wave { 0% { transform: scale(0.4); opacity: 0.9; } 100% { transform: scale(2.6); opacity: 0; } }
@keyframes ue-suck { 0% { transform: translate(var(--dx), var(--dy)) scale(1.2); opacity: 0; } 25% { opacity: 1; } 100% { transform: translate(0, 0) scale(0.3); opacity: 0.2; } }
@keyframes ue-lob-x { from { transform: translate(0, 0); } to { transform: translate(var(--dx), var(--dy)); } }
@keyframes ue-lob-y { 0% { transform: translateY(0); animation-timing-function: ease-out; } 50% { transform: translateY(-9px); animation-timing-function: ease-in; } 90% { opacity: 1; } 100% { transform: translateY(0); opacity: 0; } }
@keyframes ue-patch { 0% { transform: scale(0.2); opacity: 0; } 100% { transform: scale(1); opacity: 0.5; } }
@keyframes ue-fling { 0% { transform: translate(0, 0) scale(0.4); opacity: 0; } 20% { opacity: 1; } 100% { transform: translate(var(--dx), var(--dy)) scale(1); opacity: 1; } }
@keyframes ue-spin { 0% { transform: rotate(0deg) scale(0.2); opacity: 0; } 25% { opacity: 1; } 100% { transform: rotate(540deg) scale(1); opacity: 0.85; } }
@keyframes ue-open { 0% { transform: scale(0.15, 0.4); } 100% { transform: scale(1); } }
@keyframes ue-field { from { stroke-dashoffset: 0; } to { stroke-dashoffset: 3; } }
@keyframes ue-pull { 0% { transform: translate(0, 0); opacity: 1; } 85% { opacity: 1; } 100% { transform: translate(var(--dx), var(--dy)) scale(0.4); opacity: 0; } }
@keyframes ue-drop { 0% { transform: translateY(-10px); opacity: 0; } 25%, 85% { opacity: 1; } 100% { transform: translateY(0) scale(0.4); opacity: 0; } }
`;
