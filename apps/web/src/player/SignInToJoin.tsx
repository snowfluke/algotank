// The join step of a signed-in-only arena (joinPolicy "account" or "verified") for a visitor
// who is not signed in (player/playerView.ts, "signInToPlay"): one sentence and the sign-in
// that returns to this room.

import type { PublicArena } from "@game/arena";
import { paths } from "../app/route.ts";
import { useMessages } from "../i18n/I18nProvider.tsx";
import { LinkButton } from "../ui/Button.tsx";
import { StatusBanner } from "../ui/StatusBanner.tsx";

export function SignInToJoin({ arena }: { readonly arena: PublicArena }) {
  const t = useMessages().room.join;
  return (
    <div data-sign-in-to-join="" className="flex min-w-0 flex-col gap-4">
      <StatusBanner tone="info" title={arena.settings.joinPolicy === "verified" ? t.signInVerifiedTitle : t.signInTitle} body={t.emailNotice} />
      <div>
        <LinkButton href={paths.signIn(paths.player(arena.id))} variant="primary" size="lg">
          {t.signIn}
        </LinkButton>
      </div>
    </div>
  );
}
