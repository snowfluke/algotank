/// <reference types="bun" />
import { describe, expect, test } from "bun:test";
import { boardAspect, fittedSize } from "../board/FittedBoard.tsx";
import { FIT_FULL_PX, planFit } from "../ui/fitList.ts";
import { SCREEN_GAP_PX, SCREEN_RANKING_FIT, screenBoardBox } from "./scoreboardColumns.ts";

// The area below the round heading at 1920x1080 (measured in the built page), and the 15 by 11 board of 24 tanks with its wall,
// the widest board up to 24 tanks.
const AREA = { width: 1805, height: 817 };
const RATIO = boardAspect(15, 11);

describe("screenBoardBox", () => {
  test("the board is as wide as the height allows", () => {
    expect(fittedSize(screenBoardBox(AREA), RATIO).width).toBe(Math.floor(AREA.height * RATIO));
  });

  test("24 tanks and the cut line still fit beside it at 26px with the tie note above the ranking", () => {
    const ranking = { width: AREA.width - fittedSize(screenBoardBox(AREA), RATIO).width - SCREEN_GAP_PX, height: AREA.height - 3 * 35 - 8 };
    expect(planFit(25, ranking, SCREEN_RANKING_FIT).fontPx).toBeGreaterThanOrEqual(FIT_FULL_PX);
  });

  test("a narrow area keeps one ranking column at 26px", () => {
    const narrow = { width: 1000, height: 700 };
    expect(narrow.width - fittedSize(screenBoardBox(narrow), RATIO).width - SCREEN_GAP_PX).toBeGreaterThanOrEqual(SCREEN_RANKING_FIT.columnEm * FIT_FULL_PX);
  });
});
