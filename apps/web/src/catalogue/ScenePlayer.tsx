// Plays a catalogue scene (scenes.ts) on the game's board in a loop: one step every STEP_MS, then
// a pause on the last step, then again. The board numbers its effects by the turn, so the turn
// number keeps counting over the loops and every loop replays the jets and the "+1".
// Under reduced motion nothing plays by itself: the board shows the scene's key step, and a
// "Next step" button moves on one step at a time.

import { useEffect, useState, useSyncExternalStore } from "react";
import { ArenaBoard } from "../board/ArenaBoard.tsx";
import { boardAspect, FittedBoard } from "../board/FittedBoard.tsx";
import type { TankInfo } from "../board/props.ts";
import { plainTankLook } from "../tank/look.ts";
import { Button } from "../ui/Button.tsx";
import type { Scene, SceneTankId } from "./scenes.ts";
import { sceneNames } from "./scenes.ts";

const STEP_MS = 1100;
/** The last step stays this many steps' time, so the end of the story can be read. */
const HOLD_STEPS = 2;

/** "you" in the self colour family; the others in colours far from it. */
const LOOKS: Readonly<Record<SceneTankId, TankInfo>> = {
  you: { look: plainTankLook(3) },
  a: { look: plainTankLook(1) },
  b: { look: plainTankLook(6) },
  c: { look: plainTankLook(4) },
};
const TANKS = new Map(Object.entries(LOOKS));
const NAMES = sceneNames();

const reducedQuery = () => (typeof window === "undefined" ? null : window.matchMedia("(prefers-reduced-motion: reduce)"));

function useReducedMotion(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const query = reducedQuery();
      query?.addEventListener("change", onChange);
      return () => query?.removeEventListener("change", onChange);
    },
    () => reducedQuery()?.matches ?? false,
    () => false,
  );
}

export function ScenePlayer({ scene, label, nextLabel }: { readonly scene: Scene; readonly label: string; readonly nextLabel: string }) {
  const reduced = useReducedMotion();
  // `turn` counts every step shown since the scene opened; the step is turn modulo the length.
  const [turn, setTurn] = useState(reduced ? scene.keyStep : 0);
  const length = scene.steps.length;

  useEffect(() => {
    setTurn(reduced ? scene.keyStep : 0);
  }, [scene, reduced]);

  useEffect(() => {
    if (reduced) return;
    const index = turn % length;
    const wait = index === length - 1 ? STEP_MS * HOLD_STEPS : STEP_MS;
    const timer = window.setTimeout(() => setTurn((t) => t + 1), wait);
    return () => window.clearTimeout(timer);
  }, [turn, length, reduced]);

  const step = scene.steps[turn % length] ?? scene.steps[0];
  if (step === undefined) return null;
  const snapshot = { ...step.snapshot, tick: turn };
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2">
      <div role="img" aria-label={label} data-catalogue-scene="" className="flex min-h-0 min-w-0 flex-1 flex-col">
        <FittedBoard ratio={boardAspect(snapshot.width, snapshot.height)}>
          <ArenaBoard snapshot={snapshot} throws={step.throws} names={NAMES} highlightId="you" tickMs={Math.round(STEP_MS * 0.6)} tanks={TANKS} />
        </FittedBoard>
      </div>
      {reduced ? (
        <div className="flex shrink-0 justify-center">
          <Button variant="secondary" data-catalogue-next="" onClick={() => setTurn((t) => t + 1)}>
            {nextLabel}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
