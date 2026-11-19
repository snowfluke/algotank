// The viewer's own place in a running round, as one compact row above the board:
// place (with a short word on whether it goes through), points and water. The
// water number matters most in a big arena, where the gauge under the tank is a
// sliver. The full sentence about the cut is read to a screen reader with the row.
//
// The row keeps one height for the whole round, so the board under it never jumps: each
// note sits on its own line under its number with room for two lines ("tertinggal 3 poin"
// wraps in a phone's column, "lolos" does not), and before the first turn the sentence
// takes the place of the numbers, which stay laid out but unseen.

import type { UltimateId, UltimateState } from "@game/engine";
import { UltimateLink } from "../catalogue/UltimateLink.tsx";
import { useMessages } from "../i18n/I18nProvider.tsx";
import type { OwnLive } from "../standings/standings.ts";

type StatusMessages = ReturnType<typeof useMessages>["live"]["status"];
type Tone = "ink" | "self" | "warning" | "ok" | "muted";

const TONE_CLASSES: Record<Tone, string> = {
  ink: "text-ink",
  self: "text-self-ink",
  warning: "text-warning",
  ok: "text-ok",
  muted: "text-muted",
};

export function ownStatusSentence(own: OwnLive, t: StatusMessages, ordinal: (n: number) => string): string {
  const place = t.placeText(ordinal(own.place), own.of, own.tied);
  switch (own.outlook.kind) {
    case "through":
      return t.through(place);
    case "out":
      return t.out(place);
    case "onLine":
      return t.onLine(place);
    case "allThrough":
      return t.allThrough(place);
    case "leading":
      return own.outlook.shared ? t.sharedLead : t.leading;
    case "chasing":
      return t.chasing(place, own.outlook.behind);
  }
}

/** The few words next to the place, and their colour: good news in green, a place below the cut in the warning colour. */
function ownOutlookShort(own: OwnLive, t: StatusMessages): { readonly text: string; readonly tone: Tone } {
  switch (own.outlook.kind) {
    case "through":
      return { text: t.short.through, tone: "ok" };
    case "out":
      return { text: t.short.out, tone: "warning" };
    case "onLine":
      return { text: t.short.onLine, tone: "muted" };
    case "allThrough":
      return { text: t.short.allThrough, tone: "ok" };
    case "leading":
      return own.outlook.shared ? { text: t.short.sharedLead, tone: "ok" } : { text: t.short.leading, tone: "ok" };
    case "chasing":
      return { text: t.short.chasing(own.outlook.behind), tone: "muted" };
  }
}

function Stat({ label, value, note, tone, noteTone = "muted" }: { label: string; value: string; note: string | null; tone: Tone; noteTone?: Tone }) {
  return (
    <div className="flex min-w-0 flex-col">
      <dt className="truncate text-caption font-semibold text-muted">{label}</dt>
      <dd className="m-0 flex min-w-0 flex-col">
        <span className={`tabular font-display text-title font-bold leading-tight ${TONE_CLASSES[tone]}`}>{value}</span>
        {/* Two lines are always kept, also with no note, so a note that changes length never moves the board. */}
        <span className={`line-clamp-2 min-h-[2lh] min-w-0 text-caption font-semibold [overflow-wrap:anywhere] ${TONE_CLASSES[noteTone]}`}>{note}</span>
      </dd>
    </div>
  );
}

/** `beforeFirstTurn`: every tank still has 0 points, so the row asks the viewer to find their tank instead. */
export function OwnStatusRow({ own, beforeFirstTurn, ultimate }: {
  readonly own: OwnLive;
  readonly beforeFirstTurn: boolean;
  readonly ultimate?: { readonly id: UltimateId; readonly state: UltimateState | undefined };
}) {
  const m = useMessages();
  const t = m.live.status;
  const outlook = ownOutlookShort(own, t);
  return (
    // One grid cell for both: before the first turn the sentence shows over the numbers, which keep their room.
    <section
      className={`grid min-w-0 ${ultimate === undefined ? "" : "min-[480px]:grid-cols-[minmax(0,1fr)_auto] min-[480px]:gap-x-3"}`}
      aria-label={m.common.yourTank}
    >
      {beforeFirstTurn ? (
        <p className="min-w-0 self-center font-semibold text-self-ink [grid-area:1/1] [overflow-wrap:anywhere]">{m.live.findYourTank}</p>
      ) : (
        <p className="sr-only">{ownStatusSentence(own, t, m.results.ordinal)}</p>
      )}
      <dl className={`m-0 grid min-w-0 grid-cols-3 gap-3 [grid-area:1/1] ${beforeFirstTurn ? "invisible" : ""}`} aria-hidden={beforeFirstTurn ? true : undefined}>
        <Stat label={t.place} value={m.results.ordinal(own.place)} note={outlook.text} tone="self" noteTone={outlook.tone} />
        <Stat label={t.points} value={String(own.score)} note={null} tone="ink" />
        <Stat
          label={t.water}
          value={String(own.water)}
          note={own.canShoot ? t.waterOf(own.waterCapacity) : t.tooLittleShort}
          tone={own.canShoot ? "ink" : "warning"}
          noteTone={own.canShoot ? "muted" : "warning"}
        />
      </dl>
      {ultimate === undefined ? null : (
        <div className="mt-1 min-w-0 self-center [grid-area:2/1] min-[480px]:mt-0 min-[480px]:[grid-area:1/2]">
          <UltimateLink ultimate={ultimate.id} size={{ kind: "tile", state: ultimate.state }} />
        </div>
      )}
    </section>
  );
}
