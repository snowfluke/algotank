// The icon on each action block of a rule card: what kind of thing the tank does,
// drawn, so a child tells "shoot" from "move away" before reading the words. The
// record is typed by ActionId, so a new action in the engine fails the type check here.

import {
  ArrowBigUp,
  ArrowUp,
  ArrowUpLeft,
  ArrowUpRight,
  ChevronsLeft,
  ChevronsRight,
  CornerUpRight,
  Crosshair,
  Droplets,
  Expand,
  Hourglass,
  LocateFixed,
  MapPin,
  RotateCcw,
  RotateCw,
  Shuffle,
  type LucideIcon,
} from "lucide-react";
import type { ActionId } from "@game/engine";
import type { StepKind } from "../vocabulary/steps.ts";

export const ACTION_ICONS: Readonly<Record<ActionId, LucideIcon>> = {
  throw: Droplets,
  attack: Crosshair,
  faceTarget: LocateFixed,
  moveToward: ChevronsRight,
  moveAway: ChevronsLeft,
  stepOutOfLine: CornerUpRight,
  awayFromCrowd: Expand,
  goToPlace: MapPin,
  goForward: ArrowBigUp,
  stepForward: ArrowUp,
  turn: RotateCw,
  wander: Shuffle,
  wait: Hourglass,
};

/** The icon of each step block of a sequence: the same picture as the action it stands for, with the way of a turn drawn. */
export const STEP_ICONS: Readonly<Record<StepKind, LucideIcon>> = {
  forward: ArrowUp,
  left: RotateCcw,
  right: RotateCw,
  slightLeft: ArrowUpLeft,
  slightRight: ArrowUpRight,
  shoot: Droplets,
  wait: Hourglass,
};
