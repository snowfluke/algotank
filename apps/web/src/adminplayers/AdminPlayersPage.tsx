// "/admin/players": every tank seated in the monthly arena with its owner's email, whether that
// email is verified, and when the account was made, so the host can check who is behind each tank
// before the month's prizes (owner, 2026-11-16). On a laptop each tank is one row of columns; on a
// phone it is three short lines. Nothing scrolls: the list is a Pager. Rows wrap, so they differ in
// height and the Pager measures each one (no uniformHeight); the list changes only on a reload.
//
// AdminPlayersView draws any state from props, so the tests render it without a server.

import type { AdminPlayer } from "@game/arena";
import { useFormat, useMessages } from "../i18n/I18nProvider.tsx";
import { AppShell } from "../ui/AppShell.tsx";
import { Button } from "../ui/Button.tsx";
import { useLaptopLayout } from "../ui/layout.ts";
import { NotFoundPage } from "../ui/NotFoundPage.tsx";
import { Pager } from "../ui/Pager.tsx";
import { StatusBanner } from "../ui/StatusBanner.tsx";
import { useAdminPlayers, type AdminPlayersLoad } from "./useAdminPlayers.ts";

/**
 * Tank, place, email, verified, account made. The last two columns have a fixed width, so the
 * header row and the rows (separate grids) line up. A name or an email wraps and is never cut,
 * because the host reads the whole address.
 */
const ROW_GRID = "grid min-w-0 grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_minmax(0,1.6fr)_10rem_10rem] items-center gap-x-4";
const WRAP = "min-w-0 [overflow-wrap:anywhere]";

/** A date at noon UTC, so no time zone moves it to another day. */
const noon = (day: string) => `${day}T12:00:00Z`;

function PlayerRow({ player, laptop }: { readonly player: AdminPlayer; readonly laptop: boolean }) {
  const t = useMessages().adminPlayers;
  const f = useFormat();
  const place = t.place(player.league, player.rank);
  const email = player.account?.email ?? t.noAccount;
  const status =
    player.account === null ? null : player.account.emailVerified ? <span className={`${WRAP} text-muted`}>{t.verified}</span> : <span className={`${WRAP} text-warning`}>{t.unverified}</span>;
  const made =
    player.account === null ? null : (
      <span className={`${WRAP} tabular-nums text-muted`}>
        <span className="sr-only">{`${t.columns.created}: `}</span>
        {f.date(player.account.createdAt)}
      </span>
    );
  if (laptop) {
    return (
      <div data-admin-player="" className={`${ROW_GRID} min-h-11 border-b border-line py-1`}>
        <span className={`${WRAP} font-semibold`}>{player.name}</span>
        <span className={`${WRAP} text-muted`}>{place}</span>
        <span className={WRAP}>
          <span className="sr-only">{`${t.columns.email}: `}</span>
          {email}
        </span>
        {status ?? <span />}
        {made ?? <span />}
      </div>
    );
  }
  return (
    <div data-admin-player="" className="flex min-w-0 flex-col border-b border-line py-1">
      <div className="flex min-w-0 items-baseline gap-2">
        <span className={`${WRAP} flex-1 font-semibold`}>{player.name}</span>
        <span className={`${WRAP} max-w-[60%] text-right text-caption text-muted`}>{place}</span>
      </div>
      <span className={WRAP}>{email}</span>
      <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 text-caption">
        {status}
        {made}
      </div>
    </div>
  );
}

function PlayerList({ players, laptop }: { readonly players: readonly AdminPlayer[]; readonly laptop: boolean }) {
  const t = useMessages().adminPlayers;
  if (players.length === 0) return <p className="text-lead">{t.empty}</p>;
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      {laptop ? (
        <div className={`${ROW_GRID} shrink-0 border-b border-line pb-1 text-caption text-muted`} aria-hidden="true">
          <span>{t.columns.tank}</span>
          <span>{t.columns.place}</span>
          <span>{t.columns.email}</span>
          <span>{t.columns.verified}</span>
          <span>{t.columns.created}</span>
        </div>
      ) : null}
      <Pager label={t.listLabel} items={players} ordered={false} gap={0} itemKey={(p) => `${p.league}-${p.name}`} renderItem={(p) => <PlayerRow player={p} laptop={laptop} />} />
    </div>
  );
}

/** The page in any state of its data. */
export function AdminPlayersView({ load, onRetry }: { readonly load: AdminPlayersLoad; onRetry(): void }) {
  const m = useMessages();
  const f = useFormat();
  const t = m.adminPlayers;
  const laptop = useLaptopLayout();
  if (load.kind === "notFound") return <NotFoundPage />;
  return (
    <AppShell>
      <div data-admin-players="" className="flex min-h-0 min-w-0 flex-1 flex-col gap-3">
        <div className="flex min-w-0 shrink-0 flex-col gap-1">
          <h1 className="min-w-0 text-heading [overflow-wrap:anywhere]">{t.heading}</h1>
          {load.kind === "ready" ? <p className="text-muted [overflow-wrap:anywhere]">{t.intro(f.number(load.data.players.length), f.date(noon(load.data.day)))}</p> : null}
        </div>
        {load.kind === "loading" ? (
          <p role="status" className="animate-pulse-soft text-lead text-muted">
            {t.loading}
          </p>
        ) : load.kind === "failed" ? (
          <StatusBanner
            tone="danger"
            title={t.failed}
            action={
              <Button variant="secondary" onClick={onRetry}>
                {t.retry}
              </Button>
            }
          />
        ) : (
          <PlayerList players={load.data.players} laptop={laptop} />
        )}
      </div>
    </AppShell>
  );
}

export function AdminPlayersPage() {
  const { load, retry } = useAdminPlayers();
  return <AdminPlayersView load={load} onRetry={retry} />;
}
