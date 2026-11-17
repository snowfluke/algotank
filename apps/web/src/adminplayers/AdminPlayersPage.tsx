// "/admin/players": every tank seated in the monthly arena with its owner's email, whether that
// email is verified, and when the account was made, so the host can check who is behind each tank
// before the month's prizes (owner, 2026-11-16). On a laptop each tank is one row of columns; on a
// phone it is three short lines. Each row has Remove, for an owner who cannot sign in to quit;
// it asks first (ui/Dialog.tsx), and Rename, which sets the tank's name (RenameDialog.tsx). Nothing scrolls: the list is a Pager. Rows wrap, so they differ in
// height and the Pager measures each one (no uniformHeight); the list changes only on a reload.
//
// AdminPlayersView draws any state from props, so the tests render it without a server.

import { useState } from "react";
import type { AdminPlayer } from "@game/arena";
import { useFormat, useMessages } from "../i18n/I18nProvider.tsx";
import { AppShell } from "../ui/AppShell.tsx";
import { Button } from "../ui/Button.tsx";
import { Dialog } from "../ui/Dialog.tsx";
import { useLaptopLayout } from "../ui/layout.ts";
import { NotFoundPage } from "../ui/NotFoundPage.tsx";
import { Pager } from "../ui/Pager.tsx";
import { StatusBanner } from "../ui/StatusBanner.tsx";
import { useToast } from "../ui/Toast.tsx";
import { NameBadge } from "../standings/StandingsTable.tsx";
import { RenameDialog } from "./RenameDialog.tsx";
import { removeAdminPlayer, setAdminGameMaster, useAdminPlayers, type AdminPlayersLoad } from "./useAdminPlayers.ts";

/**
 * Tank, place, email, verified, account made, actions. Every column but the first three has a fixed
 * width, so the header row and the rows (separate grids) line up: an "auto" actions column was wider
 * in a row with three buttons than in the empty header. The buttons wrap inside it. A name or an
 * email wraps and is never cut, because the host reads the whole address.
 */
const ROW_GRID = "grid min-w-0 grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_minmax(0,1.6fr)_8rem_10rem_25rem] items-center gap-x-4";
const WRAP = "min-w-0 [overflow-wrap:anywhere]";

/** A date at noon UTC, so no time zone moves it to another day. */
const noon = (day: string) => `${day}T12:00:00Z`;

/** The row's actions: Rename (a dialog with the name), the game master switch, which can be undone, and Remove, which asks first. */
interface RowActions {
  onRename(player: AdminPlayer): void;
  onRemove(player: AdminPlayer): void;
  onGameMaster(player: AdminPlayer, gm: boolean): void;
}

function PlayerRow({ player, laptop, onRename, onRemove, onGameMaster }: { readonly player: AdminPlayer; readonly laptop: boolean } & RowActions) {
  const m = useMessages();
  const t = m.adminPlayers;
  const f = useFormat();
  const place = player.gm ? t.placeGm(player.league) : t.place(player.league, player.rank);
  const name = (
    <span className="flex min-w-0 items-baseline gap-x-2">
      {player.gm ? <NameBadge text={m.monthly.gm.text} title={m.monthly.gm.title} /> : null}
      <span className={`${WRAP} font-semibold`}>{player.name}</span>
    </span>
  );
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
  const remove = (
    <span className="flex min-w-0 flex-wrap justify-end gap-2">
      <Button variant="secondary" data-admin-rename={player.seatId} aria-label={t.renameLabel(player.name)} onClick={() => onRename(player)}>
        {t.rename}
      </Button>
      <Button variant="secondary" data-admin-gm={player.seatId} aria-label={player.gm ? t.gmOffLabel(player.name) : t.gmOnLabel(player.name)} onClick={() => onGameMaster(player, !player.gm)}>
        {player.gm ? t.gmOff : t.gmOn}
      </Button>
      <Button variant="secondary" data-admin-remove={player.seatId} aria-label={t.removeLabel(player.name)} onClick={() => onRemove(player)}>
        {t.remove}
      </Button>
    </span>
  );
  if (laptop) {
    return (
      <div data-admin-player="" className={`${ROW_GRID} min-h-11 border-b border-line py-1`}>
        {name}
        <span className={`${WRAP} text-muted`}>{place}</span>
        <span className={WRAP}>
          <span className="sr-only">{`${t.columns.email}: `}</span>
          {email}
        </span>
        {status ?? <span />}
        {made ?? <span />}
        {remove}
      </div>
    );
  }
  return (
    <div data-admin-player="" className="flex min-w-0 flex-col border-b border-line py-1">
      <div className="flex min-w-0 items-baseline gap-2">
        <span className="flex min-w-0 flex-1">{name}</span>
        <span className={`${WRAP} max-w-[60%] text-right text-caption text-muted`}>{place}</span>
      </div>
      <span className={WRAP}>{email}</span>
      <div className="flex min-w-0 flex-wrap items-center gap-x-3 text-caption">
        {status}
        {made}
        <span className="ml-auto">{remove}</span>
      </div>
    </div>
  );
}

function PlayerList({ players, laptop, ...actions }: { readonly players: readonly AdminPlayer[]; readonly laptop: boolean } & RowActions) {
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
          <span />
        </div>
      ) : null}
      <Pager label={t.listLabel} items={players} ordered={false} gap={0} itemKey={(p) => `${p.league}-${p.name}`} renderItem={(p) => <PlayerRow player={p} laptop={laptop} {...actions} />} />
    </div>
  );
}

/** The page in any state of its data. */
export function AdminPlayersView({ load, onRetry, ...actions }: { readonly load: AdminPlayersLoad; onRetry(): void } & RowActions) {
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
          <PlayerList players={load.data.players} laptop={laptop} {...actions} />
        )}
      </div>
    </AppShell>
  );
}

export function AdminPlayersPage() {
  const t = useMessages().adminPlayers;
  const toast = useToast();
  const { load, retry } = useAdminPlayers();
  const [removing, setRemoving] = useState<AdminPlayer | null>(null);
  const [renaming, setRenaming] = useState<AdminPlayer | null>(null);
  async function gameMaster(player: AdminPlayer, gm: boolean): Promise<void> {
    if (await setAdminGameMaster(player.seatId, gm)) retry();
    else toast.show({ message: t.gmFailed });
  }
  async function remove(player: AdminPlayer): Promise<void> {
    setRemoving(null);
    if (await removeAdminPlayer(player.seatId)) retry();
    else toast.show({ message: t.removeFailed });
  }
  return (
    <>
      <AdminPlayersView load={load} onRetry={retry} onRename={setRenaming} onRemove={setRemoving} onGameMaster={(player, gm) => void gameMaster(player, gm)} />
      <RenameDialog
        player={renaming}
        onCancel={() => setRenaming(null)}
        onDone={() => {
          setRenaming(null);
          retry();
        }}
      />
      <Dialog
        open={removing !== null}
        hook="admin-remove"
        title={t.removeTitle(removing?.name ?? "")}
        body={t.removeBody}
        confirmLabel={t.removeConfirm}
        onConfirm={() => {
          if (removing !== null) void remove(removing);
        }}
        onCancel={() => setRemoving(null)}
      />
    </>
  );
}
