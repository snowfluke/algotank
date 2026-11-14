// Everything a person needs to bring others into an arena: a QR code of the
// link, the 6-character code in large type, the link with Copy, and Share (the
// phone's share sheet; hidden where the browser has none). Use it on the
// private arena page, the presenter page and the big screen.
//
// size: "compact" for a side column or a phone (QR 160 px), "full" for the main
// area of a page (QR 240 px), "screen" for the projector (QR 420 px, code huge, the link
// as text without Copy and Share).

import { Share2 } from "lucide-react";
import { useMessages } from "../i18n/I18nProvider.tsx";
import { Button } from "../ui/Button.tsx";
import { CopyField } from "../ui/CopyField.tsx";
import { QrCode } from "./QrCode.tsx";

export type SharePanelSize = "compact" | "full" | "screen";

export interface SharePanelProps {
  /** The full link, for example `${location.origin}${paths.player(code)}`. */
  readonly link: string;
  readonly code: string;
  readonly size?: SharePanelSize;
}

const QR_SIZE: Record<SharePanelSize, number> = { compact: 160, full: 240, screen: 420 };
const CODE_CLASS: Record<SharePanelSize, string> = {
  compact: "text-heading",
  full: "text-display",
  screen: "text-[clamp(4rem,7vw,8rem)]",
};

/** True where the browser offers a share sheet (most phones; few desktops). */
export function canShare(): boolean {
  return typeof navigator !== "undefined" && typeof navigator.share === "function";
}

const SCHEME = /^https?:\/\//;

/** "https://play.example/a/K7M2QX" as "play.example/a/K7M2QX", for the big screen. */
export function linkWithoutScheme(link: string): string {
  return link.replace(SCHEME, "");
}

/** "K7M2QX" as "K7M 2QX": two groups of three are easier to read aloud. */
export function spacedCode(code: string): string {
  return code.length === 6 ? `${code.slice(0, 3)} ${code.slice(3)}` : code;
}

/** Opens the phone's share sheet with the link and a sentence with the code. */
export async function shareLink(text: string, link: string): Promise<void> {
  try {
    await navigator.share({ title: text, text, url: link });
  } catch {
    // The person closed the share sheet; nothing to report.
  }
}

export function SharePanel({ link, code, size = "full" }: SharePanelProps) {
  const m = useMessages();
  const share = () => shareLink(m.share.shareText(code), link);
  const screen = size === "screen";
  return (
    <div className={`flex min-w-0 flex-wrap items-center gap-6 ${screen ? "flex-col text-center" : ""}`}>
      <QrCode text={link} size={QR_SIZE[size]} label={m.share.qrLabel(link)} />
      <div className={`flex min-w-0 flex-1 basis-64 flex-col gap-3 ${screen ? "items-center" : ""}`}>
        <div className="flex flex-col gap-1">
          <p className={`font-semibold text-muted ${screen ? "text-lead" : ""}`}>{m.share.code}</p>
          <p className={`tabular font-display font-bold leading-none tracking-wide ${CODE_CLASS[size]}`}>
            {/* A screen reader spells the code one character at a time instead of reading the visual groups. */}
            <span aria-hidden="true">{spacedCode(code)}</span>
            <span className="sr-only">{code.split("").join(" ")}</span>
          </p>
        </div>
        {screen ? (
          <>
            <p className="text-lead text-muted">{m.share.scan}</p>
            {/* Read from across a room, so the scheme is left out: people type the rest. */}
            <p className="font-display text-title font-semibold [overflow-wrap:anywhere]">{linkWithoutScheme(link)}</p>
          </>
        ) : (
          <>
            <CopyField label={m.share.link} value={link} />
            {canShare() ? (
              <Button
                variant="secondary"
                icon={<Share2 aria-hidden size={20} />}
                onClick={() => void share()}
                className="self-start"
              >
                {m.share.share}
              </Button>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
