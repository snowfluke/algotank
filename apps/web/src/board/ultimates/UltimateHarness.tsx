// A paused compact tick per ultimate for the no-scroll audit (60-no-scroll.md).
import type { UltimateId } from "@game/engine";
import { sceneNames } from "../../catalogue/scenes.ts";
import { useMessages } from "../../i18n/I18nProvider.tsx";
import { AppHeader } from "../../ui/AppHeader.tsx";
import { AppShell } from "../../ui/AppShell.tsx";
import { ArenaBoard } from "../ArenaBoard.tsx";
import { LegendButton } from "../BoardLegend.tsx";
import { boardAspect, FittedBoard } from "../FittedBoard.tsx";
import { ultimateTickFixture } from "./fixtures.ts";

export function UltimateHarness({ id }: { readonly id: UltimateId }) {
  const m = useMessages();
  const { snapshot, throws, fires } = ultimateTickFixture(id);
  return (
    <AppShell header={<AppHeader title={m.board.harness.heading} />}>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2" data-ultimate-harness={id}>
        <div className="flex shrink-0 justify-end"><LegendButton layout={snapshot.layout?.id} ultimates /></div>
        <FittedBoard ratio={boardAspect(snapshot.width, snapshot.height)}>
          <ArenaBoard snapshot={snapshot} throws={throws} fires={fires ?? []} names={sceneNames()} highlightId="you" tickMs={900} paused />
        </FittedBoard>
      </div>
    </AppShell>
  );
}
