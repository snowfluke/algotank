// The link to a game's stored result, with its QR code and Copy, for the finished views of the
// arena room and the presenter page (75-organiser-tournament.md section 5). It shows once the
// server wrote the result (phase.resultId), so a link never points at nothing.

import type { PublicArena } from "@game/arena";
import { useMessages } from "../i18n/I18nProvider.tsx";
import { QrCode } from "../share/QrCode.tsx";
import { CopyField } from "../ui/CopyField.tsx";
import { useLaptopLayout } from "../ui/layout.ts";
import { resultLink } from "./history.ts";

/** The QR code's side: the smallest a phone camera reads across a table (share/InvitePane.tsx, QR_MIN_PX). */
const QR_PX = 112;

/** The stored result's id of a finished game, or null before the server wrote it. */
export function resultIdOf(arena: Pick<PublicArena, "phase">): string | null {
  return arena.phase.kind === "finished" ? arena.phase.resultId : null;
}

export function ResultLink({ resultId }: { readonly resultId: string }) {
  const t = useMessages().results.page;
  const link = resultLink(typeof window === "undefined" ? "" : window.location.origin, resultId);
  // The QR code is for showing the link to others from a laptop; on a phone it would take the history's rows, and Copy shares the link.
  const laptop = useLaptopLayout();
  return (
    <div data-result-link="" className="flex min-w-0 shrink-0 flex-wrap items-end gap-3">
      {laptop ? <QrCode text={link} size={QR_PX} label={t.qr} /> : null}
      <div className="min-w-0 flex-1 basis-56">
        <CopyField label={t.link} value={link} />
      </div>
    </div>
  );
}
