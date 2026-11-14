// "/my-tank": the player's own tank, reachable from the header on every page. The editor
// fills the page; "Surprise me" and Done sit in the bottom bar. Every change is kept at once
// (on this device, and in the account when signed in), so Done only returns to the page before.
// A signed-in player also gets a switch to the account's statistics (K2, stats/AccountStatsPane.tsx).

import { useState } from "react";
import { goBack } from "../app/navigation.ts";
import { paths } from "../app/route.ts";
import { useMessages } from "../i18n/I18nProvider.tsx";
import { AppHeader } from "../ui/AppHeader.tsx";
import { AppShell } from "../ui/AppShell.tsx";
import { Button } from "../ui/Button.tsx";
import { StatusBanner } from "../ui/StatusBanner.tsx";
import { SegmentedControl } from "../ui/SegmentedControl.tsx";
import { useAccount } from "../auth/accountStore.ts";
import { AccountStatsPane } from "../stats/AccountStatsPane.tsx";
import { MyTankEditor } from "./MyTankEditor.tsx";
import type { TankPart } from "./parts.ts";
import { SurpriseButton } from "./SurpriseButton.tsx";
import { myTankStore, useMyTank } from "./useMyTank.ts";
import { useNameDraft } from "./useNameDraft.ts";

export function MyTankPage() {
  const m = useMessages();
  const t = m.mytank;
  const { tank, blockedName, persistent } = useMyTank();
  const account = useAccount();
  const signedIn = account.kind === "signedIn";
  const [part, setPart] = useState<"tank" | "stats">("tank");
  const showStats = signedIn && part === "stats";
  const name = useNameDraft(tank.name);
  // A name problem on Done opens the name part: the editor starts again on it.
  const [start, setStart] = useState<{ part: TankPart; visit: number }>({ part: "colour", visit: 0 });

  function done(): void {
    if (!name.commit()) {
      setStart((old) => ({ part: "name", visit: old.visit + 1 }));
      return;
    }
    goBack(paths.home());
  }

  const notice = blockedName !== null ? t.nameReplaced(blockedName) : persistent ? null : t.notKept;
  return (
    <AppShell
      header={<AppHeader title={t.heading} />}
      bottom={
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-end gap-2 px-4 py-3">
          {showStats ? null : <SurpriseButton onLook={(look) => myTankStore.setLook(look)} />}
          <Button type="button" onClick={done} data-mytank-done="">
            {t.done}
          </Button>
        </div>
      }
    >
      <h1 className="sr-only">{t.heading}</h1>
      {signedIn ? (
        <div data-mytank-part="" className="shrink-0 pb-2">
          <SegmentedControl
            legend={m.stats.account.switchLabel}
            hideLegend
            size="sm"
            value={part}
            onChange={setPart}
            options={[
              { value: "tank", label: m.stats.account.tank },
              { value: "stats", label: m.stats.account.stats },
            ]}
          />
        </div>
      ) : null}
      {showStats ? (
        <AccountStatsPane />
      ) : (
        <>
          {notice === null ? null : <StatusBanner tone="info" title={notice} />}
          <MyTankEditor
            key={start.visit}
            look={tank.look}
            onLook={(look) => myTankStore.setLook(look)}
            tankName={tank.name}
            name={name.field}
            startPart={start.part}
          />
        </>
      )}
    </AppShell>
  );
}
