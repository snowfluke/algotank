// The join step of the arena room: the player's tank from "My tank" (with "Change my
// tank", which opens the editor in place of the form), the name, and "Join". An empty
// name lets the game give one. A name problem sits under the name; a blocked name is
// replaced by the game's suggestion; any other problem sits under the form. A full
// tournament offers the practice arena in the same sentence; a monthly join whose
// session ended marks the account signed out, so the room shows the sign-in instead.

import { useState, type FormEvent } from "react";
import { joinNeedsAccount, type PublicArena } from "@game/arena";
import { joinArena } from "../api/client.ts";
import { describeError } from "../api/errorSentences.ts";
import { paths } from "../app/route.ts";
import { markSignedOut, useAccount } from "../auth/accountStore.ts";
import { useMessages } from "../i18n/I18nProvider.tsx";
import { JoinTank } from "../mytank/JoinTank.tsx";
import { joinRequest, NAME_CODES } from "../mytank/joinRequest.ts";
import { MyTankSheet } from "../mytank/MyTankSheet.tsx";
import { myTankStore, useMyTank } from "../mytank/useMyTank.ts";
import { useNameDraft } from "../mytank/useNameDraft.ts";
import type { PlayerSession } from "../session/storage.ts";
import { Button, LinkButton } from "../ui/Button.tsx";
import { StatusBanner } from "../ui/StatusBanner.tsx";

export interface JoinFormProps {
  readonly arena: PublicArena;
  /** The arena's display name: its own name, or the translated "Public arena". */
  readonly arenaName: string;
  onJoined(session: PlayerSession, name: string): void;
}

/** After the sheet closes, the button that opened it takes focus again. */
export function focusChangeButton(): void {
  requestAnimationFrame(() => document.querySelector<HTMLElement>('[data-opens="mytank"]')?.focus());
}

export function JoinForm({ arena, arenaName, onJoined }: JoinFormProps) {
  const m = useMessages();
  const t = m.room.join;
  const { tank } = useMyTank();
  const account = useAccount();
  const [refusedUnverified, setRefusedUnverified] = useState(false);
  // Known before the first try (or learnt from the server's answer): a join that must fail is replaced by
  // "Verify my email" as the step's one action, so the person is not asked to press Join for nothing.
  const needsVerifying = refusedUnverified || (arena.settings.joinPolicy === "verified" && account.kind === "signedIn" && !account.account.emailVerified);
  const name = useNameDraft(tank.name);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  /** `link` is the way out a problem offers, such as the practice arena for a full tournament. */
  const [problem, setProblem] = useState<{ readonly sentence: string; readonly link: { readonly href: string; readonly label: string } | null } | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!name.commit()) return;
    setBusy(true);
    setProblem(null);
    const result = await joinArena(arena.id, joinRequest(name.field.value, myTankStore.getSnapshot().tank.look));
    setBusy(false);
    if (!result.ok) {
      const sentence = describeError(result, "join", m.errors).sentence;
      const suggestion = result.error.suggestion;
      if (result.code === "not_signed_in") markSignedOut();
      if (result.code === "name_blocked" && suggestion !== undefined) name.replace(suggestion, sentence);
      else if (result.code !== null && NAME_CODES.has(result.code)) name.replace(name.field.value, sentence);
      else if (result.code === "arena_full" && arena.settings.kind === "tournament")
        setProblem({ sentence: m.publicplay.problems.tournamentFull, link: { href: paths.playIn("practice"), label: m.publicplay.problems.goToPractice } });
      else if (result.code === "email_not_verified") setRefusedUnverified(true);
      // A signed-in account without a seat here, once the game has started (the join step stays open for a second device).
      else if (result.code === "wrong_phase") setProblem({ sentence, link: { href: paths.screen(arena.id), label: m.room.watch } });
      else if (result.code === "not_signed_in") setProblem(null);
      else setProblem({ sentence, link: null });
      return;
    }
    // The name the arena stored (or gave) becomes the tank's name, so the next join starts with it.
    myTankStore.setName(result.data.name);
    onJoined({ playerId: result.data.playerId, playerToken: result.data.playerToken }, result.data.name);
  }

  if (editing) {
    return (
      <MyTankSheet
        look={tank.look}
        onLook={(look) => myTankStore.setLook(look)}
        tankName={name.field.value}
        name={name}
        onClose={() => {
          setEditing(false);
          focusChangeButton();
        }}
      />
    );
  }

  return (
    <form className="flex min-w-0 flex-col gap-5" noValidate onSubmit={(event) => void submit(event)} data-join-form="">
      <h1 className="text-heading [overflow-wrap:anywhere]">{t.heading(arenaName)}</h1>
      {/* Spec 75: the player learns before joining that the host sees their email. */}
      {joinNeedsAccount(arena.settings.joinPolicy) ? <p data-email-notice="" className="text-muted [overflow-wrap:anywhere]">{t.emailNotice}</p> : null}
      {/* The tank and its name wait until the email is verified, because no join can happen before. */}
      {needsVerifying ? null : <JoinTank look={tank.look} name={name} onChange={() => setEditing(true)} />}
      {needsVerifying ? <StatusBanner tone="info" title={t.verifyFirst} /> : null}
      {problem === null ? null : (
        <StatusBanner
          tone="danger"
          title={problem.sentence}
          {...(problem.link === null ? {} : { action: <LinkButton href={problem.link.href}>{problem.link.label}</LinkButton> })}
        />
      )}
      {needsVerifying ? (
        <div data-verify-link="">
          <LinkButton href={paths.verifyEmail(paths.player(arena.id))} variant="primary" size="lg">
            {m.auth.verifyAction}
          </LinkButton>
        </div>
      ) : (
        <Button type="submit" size="lg" loading={busy} className="w-full laptop:w-auto laptop:self-start">
          {t.submit}
        </Button>
      )}
    </form>
  );
}
