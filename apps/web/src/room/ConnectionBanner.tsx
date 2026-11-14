// Says in words when the live connection drops or a message cannot be read. The
// stream reconnects by itself, so this line only reports; it goes away on its own.

import { useMessages } from "../i18n/I18nProvider.tsx";
import type { ArenaStreamState } from "../stream/streamState.ts";
import { NoticeLine } from "./StatusLine.tsx";

export function ConnectionBanner({ stream }: { readonly stream: ArenaStreamState }) {
  const m = useMessages();
  return (
    <div aria-live="polite" className="contents">
      {stream.connection === "reconnecting" ? <NoticeLine tone="warning" text={m.common.connection.reconnecting} /> : null}
      {stream.protocolError === null ? null : <NoticeLine tone="danger" text={m.common.connection.unreadable} />}
    </div>
  );
}
