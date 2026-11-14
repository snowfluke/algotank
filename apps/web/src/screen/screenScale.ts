// The big screen's type scale follows the viewport, so the same page reads from 5 m
// on a 1920 x 1080 projector (body 28px, the [data-scale="screen"] sizes in index.css)
// and still fits a 1280 x 720 projector or a 1000 x 600 laptop window. A projected
// 720p picture is as large on the wall as a 1080p one, so text in proportion to the
// viewport is equally readable. The smaller of the height and width share decides,
// and the phone scale is the floor. These inline values override the variables that
// [data-scale="screen"] sets on the same element.

import type { CSSProperties } from "react";

/** `px` at 1920 x 1080, scaled by the viewport, never below `floorRem`. */
function fluid(px: number, floorRem: number): string {
  const vh = ((px / 1080) * 100).toFixed(3);
  const vw = ((px / 1920) * 100).toFixed(3);
  return `clamp(${floorRem}rem, min(${vh}vh, ${vw}vw), ${px / 16}rem)`;
}

export const SCREEN_SCALE_STYLE = {
  "--text-caption": fluid(26, 0.875),
  "--text-body": fluid(28, 1),
  "--text-lead": fluid(32, 1.125),
  "--text-title": fluid(40, 1.375),
  "--text-heading": fluid(56, 1.75),
  "--text-display": fluid(96, 2.75),
} as CSSProperties;
