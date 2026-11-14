// The large tank at the top of the editor, drawn from the look being edited, so every
// change shows at once. It turns slowly so every side of the pattern shows; the plate
// and the icon stay upright. Under reduced motion it stands still, facing up.

import { TankHatch, TankHull, TankPlate, TURRET_X, hatchContent } from "../tank/TankShape.tsx";
import { tankLetters, type TankLook } from "../tank/look.ts";

/** Facing up: the angle a still tank shows, and where the turning starts. */
const START_ANGLE = -90;

export function LiveTank({ look, name, label }: { readonly look: TankLook; readonly name: string; readonly label: string }) {
  const letters = tankLetters(name);
  const hatched = hatchContent(look, letters, "full") !== null;
  return (
    <svg viewBox="-6.2 -6.2 12.4 12.4" role="img" aria-label={label} className="block size-full min-h-0" data-live-tank="">
      {look.plate === null ? null : <TankPlate colour={look.plate} />}
      <g transform={`rotate(${START_ANGLE})`}>
        <g className="tank-turn">
          <TankHull look={look} detail="full" hatched={hatched} />
          {hatched ? (
            <g transform={`translate(${TURRET_X} 0)`}>
              <g transform={`rotate(${-START_ANGLE})`}>
                <g className="tank-turn-back">
                  <TankHatch look={look} label={letters} detail="full" />
                </g>
              </g>
            </g>
          ) : null}
        </g>
      </g>
    </svg>
  );
}
