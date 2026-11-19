// On the projector the board takes the full height of the area below the round
// heading, and the ranking takes the width that is left. The ranking then picks
// its columns and text size for that box (ui/fitList.ts).

import { FIT_FULL_PX, type Box, type FitSize } from "../ui/fitList.ts";

/**
 * The ranking beside the board: a column holds the place, the tank, about 9 characters
 * of a name and the points. 12em is what lets 24 tanks and the cut line fit in two
 * columns at 26px beside the wider board of 24 tanks with the tie note above.
 */
export const SCREEN_RANKING_FIT: FitSize = { maxPx: 36, columnEm: 12 };

/** Space between the board and the ranking, in px. */
export const SCREEN_GAP_PX = 32;

/** Space the stage can use while the ranking still has one column at FIT_FULL_PX. */
export function screenBoardBox(area: Box): Box {
  const rankingMin = SCREEN_RANKING_FIT.columnEm * FIT_FULL_PX;
  return { width: Math.max(0, area.width - SCREEN_GAP_PX - rankingMin), height: area.height };
}
