// The ranking beside a board that has only a snapshot and names, such as the test
// match: rows from the snapshot's points, at most `maxRows` of them with the
// viewer's row always kept, and the viewer's water under its own row. The rows
// and the cut line are the ones of standings/StandingsTable.tsx, so "you" and the
// cut look the same as in every other ranking.

import { rulesOf } from "@game/engine";
import { useMessages } from "../i18n/I18nProvider.tsx";
import { CutLine, RankingRow } from "../standings/StandingsTable.tsx";
import { FitList } from "../ui/FitList.tsx";
import { plainTankLook } from "../tank/look.ts";
import { displayName, scoreboardEntries, tankLooks } from "./boardHelpers.ts";
import type { ScoreboardProps } from "./props.ts";

export function Scoreboard({ snapshot, names, highlightId, maxRows, tanks }: ScoreboardProps) {
  const m = useMessages();
  const rules = rulesOf(snapshot);
  const looks = tankLooks(snapshot.bots, tanks);
  const entries = scoreboardEntries(snapshot.bots, snapshot.survivorsAfterRound, highlightId, maxRows);
  const items = entries.map((entry) => {
    if (entry.kind === "cut") return <CutLine key="cut" label={m.results.table.topGoThrough(entry.through)} />;
    const { bot } = entry.row;
    const isSelf = bot.id === highlightId;
    return (
      <RankingRow
        key={bot.id}
        tank={{ playerId: bot.id, name: displayName(names, bot.id), look: looks.get(bot.id) ?? plainTankLook(1), isBot: tanks?.get(bot.id)?.isBot === true }}
        place={entry.row.rank}
        isSelf={isSelf}
        score={bot.score}
        verdict={null}
        truncate
        // Only the viewer's own row states its water, because the viewer plays by it.
        {...(isSelf ? { note: m.board.ownWater(bot.water, rules.waterCapacity) } : {})}
      />
    );
  });
  return (
    <FitList label={m.board.scoreboard}>
      {items}
    </FitList>
  );
}
