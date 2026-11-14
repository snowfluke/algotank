// The result page of a test match: the place, what the tank did most in plain
// words with a tip or two about what to change, a line about luck, the points at
// the end, and the tank's decision on the turn shown. How many turns each rule ran is
// the statistics card beside it (TestMatch.tsx, stats/StatsCard.tsx).
// It is one paged list, so it fits the test match pane at any height.

import type { ReactNode } from "react";
import { statsNumbers, type BotId } from "@game/engine";
import { useMessages } from "../i18n/I18nProvider.tsx";
import type { TankInfo } from "../board/props.ts";
import { displayName, scoreboardEntries, tankLooks } from "../board/boardHelpers.ts";
import { plainTankLook } from "../tank/look.ts";
import { CutLine, RankingRow } from "../standings/StandingsTable.tsx";
import { Pager } from "../ui/Pager.tsx";
import { actionDoneAboutText } from "../vocabulary/sentence.ts";
import { useDecisionRows } from "./decisionRows.ts";
import { PLAYER_ID, type PracticeRun } from "./run.ts";
import { matchStats } from "./run.ts";
import { summarise, summaryTips } from "./summary.ts";

type ResultItem =
  | { readonly kind: "place"; readonly key: string; readonly text: string; readonly points: string }
  | { readonly kind: "heading"; readonly key: string; readonly text: string }
  | { readonly kind: "line"; readonly key: string; readonly text: string; readonly muted?: boolean }
  | { readonly kind: "term"; readonly key: string; readonly term: string; readonly detail: string }
  | { readonly kind: "row"; readonly key: string; readonly element: ReactNode };

export interface MatchResultProps {
  readonly run: PracticeRun;
  /** The turn the board shows, for "Your tank on this turn". Defaults to the last turn. */
  readonly frame?: number;
  readonly tanks?: ReadonlyMap<BotId, TankInfo>;
}

export function MatchResult({ run, frame = run.ticks.length, tanks }: MatchResultProps) {
  const m = useMessages();
  const p = m.practice;
  const decisionRows = useDecisionRows({ run, frame });
  const summary = summarise(run.ticks, PLAYER_ID, run.strategy, statsNumbers(matchStats(run)));
  const tips = summaryTips(summary);
  const top = summary.topAction;
  // The engine's place, which breaks a tie on points by hits landed and then a draw, as a real round does.
  const place = run.player.rank;
  const facts = [
    top === null ? null : p.mostOften(actionDoneAboutText(m.vocabulary, top.action), top.turns, summary.turns),
    p.shots(summary.shots, summary.hits),
    p.timesHit(summary.timesHit),
    summary.dryShots > 0 ? p.dryShots(summary.dryShots) : null,
    ...tips.map((tip) => p.tips[tip]),
  ].filter((line): line is string => line !== null);

  const last = run.ticks.at(-1)?.snapshot ?? run.spawn;
  const looks = tankLooks(last.bots, tanks);
  const standings = scoreboardEntries(last.bots, last.survivorsAfterRound, PLAYER_ID, undefined);

  const items: ResultItem[] = [
    { kind: "place", key: "place", text: p.result(place, run.standings.length), points: p.points(run.player.score) },
    { kind: "heading", key: "did-most", text: p.didMost },
    ...facts.map((text, i): ResultItem => ({ kind: "line", key: `fact-${i}`, text })),
    { kind: "line", key: "luck", text: p.luck, muted: true },
    { kind: "heading", key: "points", text: p.pointsAtEnd },
    ...standings.map((entry): ResultItem => {
      if (entry.kind === "cut") return { kind: "row", key: "cut", element: <CutLine label={m.results.table.topGoThrough(entry.through)} element="div" /> };
      const { bot } = entry.row;
      return {
        kind: "row",
        key: `bot-${bot.id}`,
        element: (
          <RankingRow
            element="div"
            tank={{ playerId: bot.id, name: displayName(run.names, bot.id), look: looks.get(bot.id) ?? plainTankLook(1), isBot: tanks?.get(bot.id)?.isBot === true }}
            place={entry.row.rank}
            isSelf={bot.id === PLAYER_ID}
            score={bot.score}
            verdict={null}
            truncate
          />
        ),
      };
    }),
    { kind: "heading", key: "this-turn", text: p.thisTurnOf(frame) },
    ...decisionRows.map((row): ResultItem => ({ kind: "term", key: `turn-${row.term}`, term: row.term, detail: row.detail })),
  ];

  return (
    <Pager
      label={p.resultTitle}
      items={items}
      ordered={false}
      itemKey={(item) => item.key}
      renderItem={(item) => <ResultEntry item={item} />}
    />
  );
}

function ResultEntry({ item }: { item: ResultItem }) {
  switch (item.kind) {
    case "place":
      return (
        <p className="font-display text-title font-semibold [overflow-wrap:anywhere]">
          {item.text} <span className="font-sans text-lead font-normal text-muted">{item.points}</span>
        </p>
      );
    case "heading":
      // data-coach: the workshop tour's step about what the tank did most points at the first fact, or at this heading when the fact is on the next page (guide/tours.ts).
      return (
        <h3 className="pt-2 text-lead" {...(item.key === "did-most" ? { "data-coach": "did-most-heading" } : {})}>
          {item.text}
        </h3>
      );
    case "line":
      return (
        <p className={`[overflow-wrap:anywhere] ${item.muted === true ? "text-muted" : ""}`} {...(item.key === "fact-0" ? { "data-coach": "did-most" } : {})}>
          {item.text}
        </p>
      );
    case "term":
      return (
        <div className="flex min-w-0 flex-col">
          <span className="text-caption font-semibold text-muted">{item.term}</span>
          <span className="min-w-0 [overflow-wrap:anywhere]">{item.detail}</span>
        </div>
      );
    case "row":
      return item.element;
  }
}
