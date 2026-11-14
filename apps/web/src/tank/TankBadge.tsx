// A tank as a standalone image, for lists, headers, cards and the "My tank" choices.
// Inside an existing <svg> (the arena), use TankShape instead.

import { TankShape, type TankDetail, type TankPaint } from "./TankShape.tsx";

export type TankBadgeProps = TankPaint & {
  /** Width and height in CSS pixels. */
  readonly size: number;
  /** Accessible name, for example m.common.tankOf("Ana"). Null when text next to the badge already names the tank. */
  readonly name: string | null;
  readonly self?: boolean;
  readonly label?: string;
  readonly angle?: number;
  /** Defaults to "simple" below 32 px, where the pattern and the icon turn into noise. */
  readonly detail?: TankDetail;
  readonly className?: string;
};

export function TankBadge({ size, name, self = false, label, angle = 0, detail, className = "", ...paint }: TankBadgeProps) {
  const chosenDetail: TankDetail = detail ?? (size < 32 ? "simple" : "full");
  const a11y = name === null ? { "aria-hidden": true } : { role: "img", "aria-label": name };
  return (
    // The view box leaves room for the "you" ring (radius 6) and the plate (5.4).
    <svg viewBox="-6 -6 12 12" width={size} height={size} className={`shrink-0 overflow-visible ${className}`} {...a11y}>
      <TankShape {...(paint as TankPaint)} self={self} detail={chosenDetail} angle={angle} {...(label === undefined ? {} : { label })} />
    </svg>
  );
}
