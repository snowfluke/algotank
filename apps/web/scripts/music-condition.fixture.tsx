import { useState } from "react";
import { createRoot } from "react-dom/client";
import { nextLeagueLoad } from "../src/monthly/leagueLive.ts";
import { MonthlyView } from "../src/monthly/MonthlyView.tsx";
import { fixtureLive, fixtureLoad } from "../src/monthly/monthlyFixtures.ts";

const now = Date.now();
const dry = fixtureLive(1, 5, "dry-spell");
const rain = { ...dry, board: { ...dry.board, ruleSetId: "downpour" as const } };
const noop = () => undefined;

function MonthlyMusicFixture() {
  const [load, setLoad] = useState(() => fixtureLoad(dry, now));
  const [watching, setWatching] = useState(true);
  return (
    <>
      <button onClick={() => setLoad((before) => nextLeagueLoad(before, { type: "state", state: rain, change: "weather" }, now))}>Change weather</button>
      <button onClick={() => setWatching(false)}>Leave monthly</button>
      {watching ? (
        <MonthlyView
          league={1}
          leagues={[{ league: 1, tanks: dry.tanks.length }]}
          onLeague={noop}
          load={load}
          connection="open"
          onRetry={noop}
          now={now}
          ranking={null}
          days={[]}
          seat={null}
          move={null}
          onMoveSeen={noop}
          onJoin={null}
          dayChange={null}
          reshuffled={false}
          weatherChanged={load.kind === "ready" && load.board.weatherUntil > now}
          onQuit={noop}
          onChangeRules={noop}
          onChangeLook={noop}
          tab="arena"
          onTab={noop}
          side="today"
          onSide={noop}
        />
      ) : null}
    </>
  );
}

const root = document.getElementById("app");
if (root === null) throw new Error("The monthly music fixture has no root.");
createRoot(root).render(<MonthlyMusicFixture />);
