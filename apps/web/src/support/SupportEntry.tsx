// "Support" in the app header (owner, 2026-11-13): a quiet heart button that opens a modal with
// two parts, a donation link to GitHub Sponsors and the address for business inquiries. Children
// use the game, so the entry has no primary colour, no badge and no motion, and the modal holds
// nothing else. The word shows from the laptop width, where the header has room; below it only
// the heart shows and the word stays the accessible name. Not on the big screen, which has no header.

import { ExternalLink, Heart, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { useMessages } from "../i18n/I18nProvider.tsx";
import { playSound } from "../sound/player.ts";
import { Button, LinkButton } from "../ui/Button.tsx";
import { IconButton } from "../ui/IconButton.tsx";
import { useCopy } from "../ui/useCopy.ts";
import { SUPPORT_CONTACT } from "./contact.ts";

/** The modal's content; exported for its test, which renders it without a browser dialog. */
export function SupportContent() {
  const contact = SUPPORT_CONTACT;
  const t = useMessages().support;
  const emailRef = useRef<HTMLAnchorElement>(null);
  // When the browser blocks the clipboard, the address is selected for a manual copy.
  const { copied, copy } = useCopy(contact.businessEmail, () => {
    const link = emailRef.current;
    if (link !== null) window.getSelection()?.selectAllChildren(link);
  });
  return (
    <div className="flex min-w-0 flex-col gap-5">
      <section className="flex min-w-0 flex-col items-start gap-3">
        <p className="[overflow-wrap:anywhere]">{t.donation}</p>
        <LinkButton href={contact.sponsorUrl} newTab variant="primary" icon={<ExternalLink aria-hidden size={20} />}>
          {t.donate}
        </LinkButton>
      </section>
      <section className="flex min-w-0 flex-col gap-1">
        <h3 className="font-semibold">{t.business}</h3>
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
          <a ref={emailRef} data-support-email="" href={`mailto:${contact.businessEmail}`} className="min-w-0 font-semibold text-water [overflow-wrap:anywhere]">
            {contact.businessEmail}
          </a>
          <Button variant="secondary" aria-live="polite" onClick={() => void copy()}>
            {copied ? t.copied : t.copy}
          </Button>
        </div>
      </section>
    </div>
  );
}

export function SupportEntry() {
  const t = useMessages().support;
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const opener = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (dialog === null) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  function close(): void {
    setOpen(false);
    requestAnimationFrame(() => opener.current?.focus());
  }

  return (
    <>
      <button
        ref={opener}
        type="button"
        aria-label={t.entry}
        title={t.entry}
        data-support-open=""
        onClick={() => {
          playSound("tap");
          setOpen(true);
        }}
        className="press inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center gap-2 rounded-[var(--radius-control)] border-2 border-transparent bg-transparent text-muted hover:bg-water-soft laptop:px-3"
      >
        <Heart aria-hidden size={22} />
        <span aria-hidden="true" className="hidden font-display font-semibold laptop:inline">
          {t.entry}
        </span>
      </button>
      <dialog
        ref={ref}
        aria-labelledby={titleId}
        data-support=""
        onCancel={(event) => {
          event.preventDefault();
          close();
        }}
        onClick={(event) => {
          if (event.target === event.currentTarget) close();
        }}
        className="m-auto w-[min(28rem,calc(100%-2rem))] max-h-[calc(100dvh-2rem)] rounded-[var(--radius-card)] border-0 bg-panel p-0 text-ink shadow-[var(--shadow-raised)] backdrop:bg-scrim/50"
      >
        {open ? (
          <div className="flex flex-col gap-4 p-6">
            <div className="flex min-w-0 items-start gap-3">
              <h2 id={titleId} className="min-w-0 flex-1 text-title [overflow-wrap:anywhere]">
                {t.title}
              </h2>
              <IconButton label={t.close} icon={<X aria-hidden size={22} />} variant="quiet" data-support-close="" onClick={close} />
            </div>
            <SupportContent />
          </div>
        ) : null}
      </dialog>
    </>
  );
}
