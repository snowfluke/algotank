// The account control at the end of the header. Signed out: a "Sign in" link that
// returns to this page. Signed in: a small menu with the email, "Verify my email" with one
// line when the email is not verified and the server can send email, "My arena" when the
// account owns one, "My results" (the stored results of its tournaments), for an admin the two
// admin pages (adminStatus.ts), and "Sign out".

import { LogIn, LogOut, UserRound } from "lucide-react";
import { useRef, useState } from "react";
import { errorSentence } from "../api/errorSentences.ts";
import { followLink } from "../app/navigation.ts";
import { paths } from "../app/route.ts";
import { useMessages } from "../i18n/I18nProvider.tsx";
import { playSound } from "../sound/player.ts";
import { signOut, useAccount, type OwnArena } from "./accountStore.ts";
import { useIsAdmin } from "./adminStatus.ts";
import { canSendEmail, useMailCapability } from "./mailCapability.ts";

/** The page of the owner's arena: the room for a private arena, the presenter page otherwise. */
export function ownArenaPath(arena: NonNullable<OwnArena>): string {
  return arena.kind === "presenter" ? paths.host(arena.id) : paths.player(arena.id);
}

function currentPath(): string | undefined {
  return typeof window === "undefined" ? undefined : `${window.location.pathname}${window.location.search}`;
}

// The secondary button look without its 7rem minimum width, so the header keeps one row of controls on a phone.
const SIGN_IN_LINK =
  "press inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-[var(--radius-control)] border-2 border-b-4 border-line bg-panel px-2.5 font-display font-semibold text-ink no-underline hover:border-line-strong active:mb-0.5 active:border-b-2";

const MENU_ITEM =
  "press flex min-h-11 w-full min-w-0 items-center gap-2 rounded-[var(--radius-control)] px-3 text-left font-display font-semibold text-ink no-underline hover:bg-water-soft";

export function AccountMenu() {
  const m = useMessages();
  const account = useAccount();
  const mail = useMailCapability();
  const menu = useRef<HTMLDetailsElement>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const admin = useIsAdmin(account.kind === "signedIn" ? account.account.id : null);

  if (account.kind !== "signedIn") {
    const here = currentPath();
    return (
      <a
        href={paths.signIn(here === paths.home() ? undefined : here)}
        onClick={followLink}
        className={SIGN_IN_LINK}
      >
        <LogIn aria-hidden size={20} />
        <span className="max-[479px]:sr-only">{m.auth.signInLink}</span>
      </a>
    );
  }

  const close = () => menu.current?.removeAttribute("open");
  const own = account.own.kind === "ready" ? account.own.arena : null;
  return (
    <details ref={menu} className="relative">
      <summary
        aria-label={m.auth.accountMenu}
        title={account.account.email}
        onClick={() => playSound("tap")}
        className="press flex size-11 cursor-pointer list-none items-center justify-center rounded-[var(--radius-control)] border-2 border-b-4 border-line bg-panel text-ink hover:border-line-strong [&::-webkit-details-marker]:hidden"
      >
        <UserRound aria-hidden size={22} strokeWidth={2.5} />
      </summary>
      <div className="absolute right-0 top-full z-30 mt-2 flex w-64 max-w-[calc(100vw-2rem)] flex-col gap-1 rounded-[var(--radius-card)] bg-panel p-2 shadow-[var(--shadow-raised)]">
        <p className="px-3 py-2 text-caption text-muted [overflow-wrap:anywhere]">{m.auth.signedInAs(account.account.email)}</p>
        {account.account.emailVerified || !canSendEmail(mail) ? null : (
          <>
            <p data-unverified="" className="px-3 text-caption font-semibold text-ink">
              {m.auth.unverified}
            </p>
            <a
              href={paths.verifyEmail(currentPath())}
              data-verify-link=""
              onClick={(event) => {
                close();
                followLink(event);
              }}
              className={MENU_ITEM}
            >
              {m.auth.verifyAction}
            </a>
          </>
        )}
        {own === null ? null : (
          <a
            href={ownArenaPath(own)}
            onClick={(event) => {
              close();
              followLink(event);
            }}
            className={MENU_ITEM}
          >
            {m.auth.myArena}
          </a>
        )}
        <a
          href={paths.myResults()}
          data-my-results-link=""
          onClick={(event) => {
            close();
            followLink(event);
          }}
          className={MENU_ITEM}
        >
          {m.auth.myResults}
        </a>
        {/* The admin pages, under a line: only an admin's menu has them, and the server checks each page again. */}
        {admin ? (
          <div data-admin-links="" className="flex flex-col gap-1 border-t border-line pt-1">
            {[
              { href: paths.adminPlayers(), label: m.adminPlayers.pageTitle },
              { href: paths.adminMetrics(), label: m.metrics.pageTitle },
            ].map((link) => (
              <a
                key={link.href}
                href={link.href}
                onClick={(event) => {
                  close();
                  followLink(event);
                }}
                className={MENU_ITEM}
              >
                {link.label}
              </a>
            ))}
          </div>
        ) : null}
        <button
          type="button"
          className={MENU_ITEM}
          onClick={() => {
            playSound("tap");
            void signOut().then((failure) => {
              setProblem(failure === null ? null : errorSentence(failure, "signOut", m.errors));
              if (failure === null) close();
            });
          }}
        >
          <LogOut aria-hidden size={20} />
          {m.auth.signOut}
        </button>
        {problem === null ? null : (
          <p role="alert" className="px-3 py-2 text-caption font-semibold text-hit">
            {problem}
          </p>
        )}
      </div>
    </details>
  );
}
