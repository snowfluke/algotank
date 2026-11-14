// The lobby on the big screen: how to join, very large, beside the tanks that
// joined. The join panel has a fixed width; the player list takes the rest and
// flows into columns, so 64 names stay readable without scrolling.

import { isPublicKind, type PublicArena } from "@game/arena";
import { arenaDisplayName } from "../publicplay/arenaName.ts";
import { paths } from "../app/route.ts";
import { useMessages } from "../i18n/I18nProvider.tsx";
import type { NextStep } from "../stream/streamState.ts";
import type { FitSize } from "../ui/fitList.ts";
import { NextStepLine } from "./NextStepLine.tsx";
import { RulesLine } from "./RulesLine.tsx";
import { ScreenJoinPanel } from "./ScreenJoinPanel.tsx";
import { TankList } from "./TankList.tsx";

/** A column keeps room for a 20-character name, so 24 names fit in two columns at 26px beside the join panel at 1920x1080. */
const NAMES_FIT: FitSize = { maxPx: 36, columnEm: 13 };

// When not every name fits (about 30 of 64), the first and the newest names show, so a player who just joined finds their name.
export function LobbyScreen({ arena, nextStep = null }: { arena: PublicArena; nextStep?: NextStep | null }) {
  const m = useMessages();
  const t = m.screen.lobby;
  const link = `${window.location.origin}${paths.player(arena.id)}`;
  const players = arena.players.filter((p) => !p.isBot);
  return (
    <div className="grid h-full min-h-0 grid-cols-1 gap-x-16 gap-y-6 laptop:grid-cols-[minmax(0,auto)_minmax(0,1fr)]">
      <section className="flex min-h-0 min-w-0 flex-col items-center gap-4" aria-labelledby="lobby-heading">
        <h1 id="lobby-heading" className="max-w-[22ch] shrink-0 text-center text-heading [overflow-wrap:anywhere]">
          {t.heading(arenaDisplayName(arena.settings, m.publicplay.names))}
        </h1>
        <ScreenJoinPanel link={link} code={arena.id} />
      </section>
      <section className="flex min-h-0 min-w-0 flex-col gap-4" aria-labelledby="players-heading">
        <h2 id="players-heading" className="text-title">
          {t.players(players.length)}
        </h2>
        <NextStepLine
          step={nextStep}
          counting={t.startsIn}
          waiting={isPublicKind(arena.settings.kind) ? t.soon : t.waiting}
          className="text-lead font-semibold text-water"
        />
        <RulesLine arena={arena} className="text-muted" />
        <div className="min-h-0 flex-1">
          {players.length === 0 ? (
            <p className="animate-pulse-soft text-lead text-muted">{t.nobody}</p>
          ) : (
            <TankList label={t.players(players.length)} items={players.map((p) => ({ tank: { playerId: p.id, name: p.name, look: p.look, isBot: false } }))} fit={NAMES_FIT} focus={players.length - 1} more={t.more} />
          )}
        </div>
      </section>
    </div>
  );
}
