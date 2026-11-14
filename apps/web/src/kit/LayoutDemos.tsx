// The layout system in the gallery: Pager, Carousel, StepSheet and BottomTabs, each in
// a box of fixed height as a pane would give it ("/kit"), and all of them in a real
// AppShell ("/kit?show=layout"), which the no-scroll audit can check like any page.

import { Gauge, Send, Users } from "lucide-react";
import { useState } from "react";
import { paths } from "../app/route.ts";
import { useMessages } from "../i18n/I18nProvider.tsx";
import { TankBadge } from "../tank/TankBadge.tsx";
import { TANK_COLOURS, tankColourByOrder } from "../tank/colours.ts";
import { AppHeader } from "../ui/AppHeader.tsx";
import { AppShell } from "../ui/AppShell.tsx";
import { BottomTabs, tabPanelProps } from "../ui/BottomTabs.tsx";
import { Button, LinkButton } from "../ui/Button.tsx";
import { Carousel } from "../ui/Carousel.tsx";
import { Pager } from "../ui/Pager.tsx";
import { Section } from "../ui/Section.tsx";
import { StepSheet } from "../ui/StepSheet.tsx";

const PLAYER_COUNT = 23;
/** The viewer's row, kept in view on every page of the demo ranking. */
const OWN_ROW = 16;

function RankingDemo() {
  const k = useMessages().kit;
  const rows = Array.from({ length: PLAYER_COUNT }, (_, i) => i);
  return (
    <Pager
      label={k.pagerLabel}
      items={rows}
      gap={0}
      keepIndex={OWN_ROW}
      itemKey={(i) => String(i)}
      renderItem={(i) => (
        <div className={`flex min-h-11 min-w-0 items-center gap-3 border-b border-line px-2 ${i === OWN_ROW ? "bg-self-soft" : ""}`}>
          <span className="tabular w-6 shrink-0 text-right font-display font-semibold text-muted">{i + 1}</span>
          <TankBadge colour={tankColourByOrder(i)} size={28} name={null} self={i === OWN_ROW} />
          <span className="min-w-0 flex-1 truncate">{k.pagerRow(i + 1)}</span>
          <span className="tabular shrink-0 text-muted">{k.pagerPoints(PLAYER_COUNT - i)}</span>
        </div>
      )}
    />
  );
}

function StylesDemo() {
  const m = useMessages();
  const k = m.kit;
  const [index, setIndex] = useState(0);
  return (
    <Carousel
      label={k.carouselLabel}
      items={TANK_COLOURS}
      index={index}
      onIndexChange={setIndex}
      itemKey={(colour) => String(colour)}
      renderItem={(colour) => (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2">
          <TankBadge colour={colour} size={72} name={null} angle={-90} />
          <p className="font-display text-title">{m.common.tankColours[colour]}</p>
        </div>
      )}
    />
  );
}

function SheetDemo() {
  const k = useMessages().kit;
  const [open, setOpen] = useState(false);
  return open ? (
    <StepSheet title={k.stepSheetTitle} onBack={() => setOpen(false)}>
      <p>{k.stepSheetBody}</p>
    </StepSheet>
  ) : (
    <Button variant="secondary" className="self-start" onClick={() => setOpen(true)}>
      {k.stepSheetOpen}
    </Button>
  );
}

type DemoTab = "tank" | "players" | "invite";

/** The gallery section: each part in a pane-sized box. */
export function LayoutSection() {
  const k = useMessages().kit;
  const [tab, setTab] = useState<DemoTab>("tank");
  return (
    <Section heading={k.layout} intro={k.layoutIntro}>
      <div className="self-start">
        <LinkButton href={`${paths.kit()}?show=layout`}>{k.layoutPageLink}</LinkButton>
      </div>
      <div className="grid gap-6 [grid-template-columns:repeat(auto-fill,minmax(min(100%,20rem),1fr))]">
        <div className="flex flex-col gap-2">
          <h3 className="text-lead">{k.pagerHeading}</h3>
          <div className="flex h-72 flex-col rounded-[var(--radius-card)] bg-panel p-3">
            <RankingDemo />
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <h3 className="text-lead">{k.carouselHeading}</h3>
          <div className="flex h-72 flex-col rounded-[var(--radius-card)] bg-panel p-3">
            <StylesDemo />
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <h3 className="text-lead">{k.stepSheetHeading}</h3>
          <div className="flex h-72 flex-col rounded-[var(--radius-card)] bg-panel p-3">
            <SheetDemo />
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <h3 className="text-lead">{k.bottomTabsHeading}</h3>
          <div className="flex h-72 flex-col overflow-hidden rounded-[var(--radius-card)] bg-panel">
            <div {...tabPanelProps("kit-demo", tab)} className="flex min-h-0 flex-1 items-center justify-center p-3 text-center text-muted">
              {k.bottomTabsPane(k.bottomTabs[tab])}
            </div>
            <div className="border-t-2 border-line">
              <DemoTabs idBase="kit-demo" value={tab} onChange={setTab} />
            </div>
          </div>
        </div>
      </div>
    </Section>
  );
}

function DemoTabs({ idBase, value, onChange }: { idBase: string; value: DemoTab; onChange: (next: DemoTab) => void }) {
  const k = useMessages().kit;
  return (
    <BottomTabs
      idBase={idBase}
      label={k.bottomTabsLabel}
      value={value}
      onChange={onChange}
      tabs={[
        { value: "tank", label: k.bottomTabs.tank, icon: <Gauge aria-hidden size={22} /> },
        { value: "players", label: k.bottomTabs.players, icon: <Users aria-hidden size={22} /> },
        { value: "invite", label: k.bottomTabs.invite, icon: <Send aria-hidden size={22} /> },
      ]}
    />
  );
}

/** "/kit?show=layout": a phone screen built only from the layout system, the pattern of the room lobby. */
export function LayoutHarness() {
  const k = useMessages().kit;
  const [tab, setTab] = useState<DemoTab>("players");
  return (
    <AppShell
      header={<AppHeader title={k.layout} />}
      bottom={
        <>
          <div className="mx-auto flex w-full max-w-xl flex-wrap items-center gap-x-3 gap-y-1 px-4 pt-2">
            <Button size="lg" className="w-full">
              {k.demoAction}
            </Button>
            <p className="text-caption text-muted">{k.demoActionNote}</p>
          </div>
          <DemoTabs idBase="layout-demo" value={tab} onChange={setTab} />
        </>
      }
    >
      <div {...tabPanelProps("layout-demo", tab)} className="flex min-h-0 flex-1 flex-col">
        {tab === "tank" ? <StylesDemo /> : tab === "players" ? <RankingDemo /> : <SheetDemo />}
      </div>
    </AppShell>
  );
}
