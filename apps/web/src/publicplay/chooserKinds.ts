// The tiles of the chooser on /play: the two public arenas and the monthly arena. The monthly
// arena is a league with its own page (/monthly, docs/specs/revamp/77-monthly-league.md), not a
// room that "Play" joins, so it is a kind of tile and not a PublicKind.

import type { PublicKind } from "@game/arena";

export type ChooserKind = PublicKind | "monthly";
export const CHOOSER_KINDS = ["practice", "tournament", "monthly"] as const satisfies readonly ChooserKind[];
