// The tanks in an arena as rows with a badge and a name, paged to the height of the
// pane, so 512 tanks need no scrolling. Bots carry a "bot" tag, the player's own tank
// the orange ring and a "you" tag, so neither depends on colour. During a game a tank
// removed in an earlier round is "out"; after the final every tank shows the place it
// finished in. In the lobby of a public arena a person who tapped "I'm ready" carries a
// "ready" tag, and so does a player in the lobby or break of an owner's arena (spec 75). The
// owner of a signed-in-only arena sees each player's email under the name; nobody else gets it.
// The player's own row comes first and stays on every page.

import { UserMinus } from "lucide-react";
import type { ReactNode } from "react";
import type { PlayerId, PlayerStatus, PublicPlayer } from "@game/arena";
import { useMessages } from "../i18n/I18nProvider.tsx";
import { tankLetters } from "../tank/look.ts";
import { TankBadge } from "../tank/TankBadge.tsx";
import { Dialog } from "../ui/Dialog.tsx";
import { IconButton } from "../ui/IconButton.tsx";
import type { PlayerRemoval } from "./usePlayerRemoval.ts";
import { Pager } from "../ui/Pager.tsx";

const TAG = "shrink-0 rounded-full bg-ground px-2 text-caption font-semibold text-muted";
/** "ready" in the ok colours, so it reads as done; the word carries it without the colour. */
const READY_TAG = "shrink-0 rounded-full bg-ok-soft px-2 text-caption font-semibold text-ok";

/** The tag after a name that says where the tank stands in the game, or null for a tank that is simply playing. */
export type StandingTag = { readonly kind: "nextGame" } | { readonly kind: "out" } | { readonly kind: "place"; readonly place: number } | null;

/** `gameOver` is true after the final, when every tank that played has a final place. */
function standingTag(status: PlayerStatus, gameOver: boolean): StandingTag {
  switch (status.kind) {
    case "waiting":
      return { kind: "nextGame" };
    case "winner":
      return { kind: "place", place: 1 };
    case "eliminated":
      return gameOver ? { kind: "place", place: status.finalRank } : { kind: "out" };
    // The owner took the tank out in a break: out of the game, without a place.
    case "removed":
      return { kind: "out" };
    case "playing":
      return null;
  }
}

/** The player's own tank first, then people, then bots. */
function sortPlayers(players: readonly PublicPlayer[], meId: PlayerId | null): PublicPlayer[] {
  return [...players].sort((a, b) => Number(b.id === meId) - Number(a.id === meId) || Number(a.isBot) - Number(b.isBot));
}

function PlayerRow({
  player,
  isMe,
  gameOver,
  showReady = false,
  email,
  onRemove,
}: {
  readonly player: PublicPlayer;
  readonly isMe: boolean;
  readonly gameOver: boolean;
  /** True where ready is shown (showsReadyTags): a person who tapped "I'm ready" gets the tag. */
  readonly showReady?: boolean;
  /** The owner's view of a signed-in-only arena: the email line under the name ("" keeps the line for a bot, so every row has one height). */
  readonly email?: string | undefined;
  readonly onRemove?: (() => void) | undefined;
}) {
  const m = useMessages();
  const t = m.room.players;
  const tag = standingTag(player.status, gameOver);
  return (
    <div className={`flex min-h-12 min-w-0 items-center gap-2 border-b border-line px-2 ${isMe ? "bg-self-soft" : ""}`}>
      <TankBadge look={player.look} label={tankLetters(player.name)} size={36} name={null} self={isMe} detail="full" angle={-90} />
      {email === undefined ? (
        <span className="min-w-0 flex-1 truncate font-semibold" title={player.name}>
          {player.name}
        </span>
      ) : (
        <span className="flex min-w-0 flex-1 flex-col py-1">
          <span className="truncate font-semibold" title={player.name}>
            {player.name}
          </span>
          <span data-player-email="" className="truncate text-caption text-muted" title={email}>
            {email === "" ? "\u00a0" : email}
          </span>
        </span>
      )}
      {isMe ? <span className={`${TAG} text-self-ink`}>{t.you}</span> : null}
      {player.isBot ? <span className={TAG}>{t.bot}</span> : null}
      {showReady && player.ready && !player.isBot ? <span className={READY_TAG}>{m.publicplay.ready.tag}</span> : null}
      {tag === null ? null : (
        <span className={TAG}>{tag.kind === "nextGame" ? t.nextGame : tag.kind === "out" ? t.out : t.place(m.results.ordinal(tag.place))}</span>
      )}
      {onRemove === undefined ? null : (
        <IconButton label={t.remove(player.name)} icon={<UserMinus aria-hidden size={20} />} variant="quiet" data-remove-player={player.id} onClick={onRemove} />
      )}
    </div>
  );
}

export interface PlayersPaneProps {
  readonly players: readonly PublicPlayer[];
  readonly meId: PlayerId | null;
  /** A heading above the count, when the tab label does not already name the list. */
  readonly heading?: string;
  /** True after the final: tags show final places instead of "out". */
  readonly gameOver?: boolean;
  /** Rows show who tapped "I'm ready" (showsReadyTags). */
  readonly showReady?: boolean;
  /** The owner of a signed-in-only arena: each player's email (useArenaAccounts). */
  readonly emails?: ReadonlyMap<PlayerId, string>;
  /** Controls under the list, such as "Change my tank" and Leave. */
  readonly footer?: ReactNode;
  /** The owner's "Remove from arena" (usePlayerRemoval): people other than the viewer get the button; hidden ids wait for their Undo time. */
  readonly removal?: PlayerRemoval;
}

/** The question before a removal (the table in usePlayerRemoval.ts). */
function RemovalDialog({ removal }: { readonly removal: PlayerRemoval }) {
  const t = useMessages().room.players;
  const name = removal.asking?.name ?? "";
  return removal.canBan ? (
    <Dialog
      hook="remove"
      open={removal.asking !== null}
      title={t.removeTitle(name)}
      body={t.mayJoinAgain}
      alternative={{ label: t.joinAgainYes, onChoose: () => removal.confirm(false) }}
      confirmLabel={t.joinAgainNo}
      onConfirm={() => removal.confirm(true)}
      onCancel={removal.cancel}
    />
  ) : (
    <Dialog
      hook="remove"
      open={removal.asking !== null}
      title={t.removeTitle(name)}
      body={t.noBanHere}
      confirmLabel={t.removeConfirm(name)}
      onConfirm={() => removal.confirm(false)}
      onCancel={removal.cancel}
    />
  );
}

export function PlayersPane({ players: all, meId, heading, gameOver = false, showReady = false, emails, footer, removal }: PlayersPaneProps) {
  const m = useMessages();
  const t = m.room.players;
  const players = removal === undefined ? all : all.filter((p) => !removal.hidden.has(p.id));
  const sorted = sortPlayers(players, meId);
  const meIndex = sorted.findIndex((p) => p.id === meId);
  return (
    <section aria-label={heading ?? t.heading} className="flex min-h-0 min-w-0 flex-1 flex-col gap-2">
      {heading === undefined ? null : <h2 className="text-title">{heading}</h2>}
      <p className="shrink-0 text-muted">{t.count(players.length)}</p>
      <Pager
        // The email lines arrive after the list, and they make every row taller, so the Pager measures again.
        key={emails === undefined ? "names" : `emails-${emails.size}`}
        label={heading ?? t.heading}
        items={sorted}
        itemKey={(p) => p.id}
        gap={0}
        ordered={false}
        // Every row is one line at the same height (min-h-12, the name cut to one line), so one row is measured for all.
        uniformHeight
        keepIndex={meIndex < 0 ? null : meIndex}
        renderItem={(p) => (
          <PlayerRow
            player={p}
            isMe={p.id === meId}
            gameOver={gameOver}
            showReady={showReady}
            email={emails === undefined ? undefined : (emails.get(p.id) ?? "")}
            // A removed player is already out; bots and the viewer cannot be removed.
            onRemove={removal === undefined || p.isBot || p.id === meId || p.status.kind === "removed" ? undefined : () => removal.remove(p)}
          />
        )}
      />
      {removal?.problem == null ? null : (
        <p role="alert" className="shrink-0 font-semibold text-hit [overflow-wrap:anywhere]">
          {removal.problem}
        </p>
      )}
      {footer === undefined ? null : <div className="flex shrink-0 flex-wrap items-center gap-2">{footer}</div>}
      {removal === undefined ? null : <RemovalDialog removal={removal} />}
    </section>
  );
}
