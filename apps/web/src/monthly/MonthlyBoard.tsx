import type { ReactNode } from "react";
import { ArenaView, type ArenaViewProps, type FollowSwitch, type SwitchPlace } from "../board/ArenaView.tsx";
import { useMessages } from "../i18n/I18nProvider.tsx";

export interface BoardRow {
  readonly place: SwitchPlace;
  readonly follow: FollowSwitch;
}

interface MonthlyBoardProps extends Pick<ArenaViewProps, "snapshot" | "throws" | "fires" | "tunnels" | "names" | "highlightId" | "tickMs" | "tanks" | "trailIds"> {
  readonly overlay: ReactNode;
  readonly row: BoardRow;
}

export function MonthlyBoard({ overlay, row, ...board }: MonthlyBoardProps) {
  const m = useMessages();
  return (
    <ArenaView
      {...board}
      switchPlace={row.place}
      followSwitch={row.follow}
      wholeLabel={m.monthly.wholeArena}
      dataAttributes={{ "data-monthly-board": "" }}
      stageOverlay={overlay}
    />
  );
}
