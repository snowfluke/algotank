// How to join, for the big screen's lobby: the QR code as large as the column's
// height allows (up to 420 px), the code in two groups of three, the scan sentence and
// the link without its scheme. It is SharePanel's "screen" size with a measured QR
// code, because a fixed 420 px code does not fit a 720 px projector beside the heading.

import { useMessages } from "../i18n/I18nProvider.tsx";
import { linkWithoutScheme, spacedCode } from "../share/SharePanel.tsx";
import { QrCode } from "../share/QrCode.tsx";
import { useBoxSize } from "../ui/useBoxSize.ts";

const QR_MAX_PX = 420;
const QR_MIN_PX = 160;

export function ScreenJoinPanel({ link, code }: { link: string; code: string }) {
  const m = useMessages();
  const { ref, box } = useBoxSize<HTMLDivElement>();
  const qr = box === null ? QR_MIN_PX : Math.max(QR_MIN_PX, Math.min(QR_MAX_PX, box.width, box.height));
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col items-center gap-4 text-center">
      <div ref={ref} className="flex min-h-0 w-full min-w-0 flex-1 items-center justify-center">
        <QrCode text={link} size={qr} label={m.share.qrLabel(link)} />
      </div>
      <div className="flex shrink-0 flex-col items-center gap-1">
        <p className="text-lead font-semibold text-muted">{m.share.code}</p>
        <p className="tabular font-display text-display font-bold leading-none tracking-wide">
          {/* A screen reader spells the code one character at a time instead of reading the visual groups. */}
          <span aria-hidden="true">{spacedCode(code)}</span>
          <span className="sr-only">{code.split("").join(" ")}</span>
        </p>
      </div>
      <p className="shrink-0 text-lead text-muted">{m.share.scan}</p>
      {/* Read from across a room, so the scheme is left out: people type the rest. */}
      <p className="shrink-0 font-display text-title font-semibold [overflow-wrap:anywhere]">{linkWithoutScheme(link)}</p>
    </div>
  );
}
