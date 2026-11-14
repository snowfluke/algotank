// The share panel as a pane of the room and the presenter page: the QR code takes the
// height the pane has left after the code and the link, so it is as large as the
// phone allows without pushing anything out of the box. Under the QR code: the arena
// code in two groups of three with Share beside it (where the browser has a share
// sheet), then the link with Copy. SharePanel stays for the big screen and the kit.

import { Share2 } from "lucide-react";
import { useMessages } from "../i18n/I18nProvider.tsx";
import type { Box } from "../ui/fitList.ts";
import { Button } from "../ui/Button.tsx";
import { CopyField } from "../ui/CopyField.tsx";
import { useFitLayout } from "../ui/layout.ts";
import { useBoxSize } from "../ui/useBoxSize.ts";
import { QrCode } from "./QrCode.tsx";
import { canShare, shareLink, spacedCode } from "./SharePanel.tsx";

/** The QR code's side before the box is measured, and in the scrolling fallback. */
export const QR_DEFAULT_PX = 160;
/** Below this a phone camera across a table struggles; the pane keeps at least this much. */
export const QR_MIN_PX = 112;
/** Larger adds nothing for a camera at arm's length. */
export const QR_MAX_PX = 280;

/** The QR code's side in the box it is given: as large as fits, between the limits. */
export function qrSide(box: Box | null): number {
  if (box === null) return QR_DEFAULT_PX;
  return Math.max(QR_MIN_PX, Math.min(QR_MAX_PX, box.width, box.height));
}

export function InvitePane({ link, code }: { readonly link: string; readonly code: string }) {
  const m = useMessages();
  const fit = useFitLayout();
  const { ref, box } = useBoxSize<HTMLDivElement>();
  const side = fit ? qrSide(box) : QR_DEFAULT_PX;

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3">
      <div ref={ref} className="flex min-w-0 justify-center fit:min-h-0 fit:flex-1">
        <QrCode text={link} size={side} label={m.share.qrLabel(link)} />
      </div>
      <div className="flex min-w-0 shrink-0 flex-wrap items-end gap-x-4 gap-y-2">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <p className="font-semibold text-muted">{m.share.code}</p>
          <p className="tabular font-display text-heading font-bold leading-none tracking-wide">
            {/* A screen reader spells the code one character at a time instead of reading the visual groups. */}
            <span aria-hidden="true">{spacedCode(code)}</span>
            <span className="sr-only">{code.split("").join(" ")}</span>
          </p>
        </div>
        {canShare() ? (
          <Button variant="secondary" icon={<Share2 aria-hidden size={20} />} onClick={() => void shareLink(m.share.shareText(code), link)}>
            {m.share.share}
          </Button>
        ) : null}
      </div>
      <div className="shrink-0">
        <CopyField label={m.share.link} value={link} />
      </div>
    </div>
  );
}
