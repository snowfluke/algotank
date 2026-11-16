// "/kit": every shared component, the layout system, the tanks in all 12 colours with every skin and icon, the share panel and
// a button per sound. For the engineers who build pages and for screenshots.

import { X } from "lucide-react";
import { useState } from "react";
import { BoardHarness } from "../board/BoardHarness.tsx";
import { useMessages } from "../i18n/I18nProvider.tsx";
import { MonthlyHarness } from "../monthly/MonthlyHarness.tsx";
import { PrepHarness } from "../prep/PrepHarness.tsx";
import { RoomHarness } from "../publicplay/RoomHarness.tsx";
import { LayoutHarness, LayoutSection } from "./LayoutDemos.tsx";
import { SharePanel } from "../share/SharePanel.tsx";
import { playSound } from "../sound/player.ts";
import { SOUND_NAMES } from "../sound/sounds.ts";
import { TankBadge } from "../tank/TankBadge.tsx";
import { TankShape } from "../tank/TankShape.tsx";
import { TANK_COLOURS, toTankColour, type TankColour } from "../tank/colours.ts";
import { TANK_ICONS, TANK_SKINS, plainTankLook, type TankLook } from "../tank/look.ts";
import { AppHeader } from "../ui/AppHeader.tsx";
import { Button } from "../ui/Button.tsx";
import { ChoiceGroup } from "../ui/ChoiceGroup.tsx";
import { Countdown } from "../ui/Countdown.tsx";
import { Dialog } from "../ui/Dialog.tsx";
import { Disclosure } from "../ui/Disclosure.tsx";
import { EmptyState } from "../ui/EmptyState.tsx";
import { TextInput } from "../ui/Field.tsx";
import { Picker } from "../ui/Picker.tsx";
import { IconButton } from "../ui/IconButton.tsx";
import { Page } from "../ui/Page.tsx";
import { SaveIndicator } from "../ui/SaveIndicator.tsx";
import { Section } from "../ui/Section.tsx";
import { SegmentedControl } from "../ui/SegmentedControl.tsx";
import { StatusBanner } from "../ui/StatusBanner.tsx";
import { Stepper } from "../ui/Stepper.tsx";
import { Tabs } from "../ui/Tabs.tsx";
import { useToast } from "../ui/Toast.tsx";

const COLOUR_TOKENS = ["ground", "panel", "ink", "muted", "line", "water", "water-deep", "water-soft", "self", "self-ink", "ok", "hit", "warning", "arena-floor", "arena-grid"] as const;
const BOARD_SAMPLE: readonly { look: TankLook; angle: number; self?: boolean; label: string }[] = [
  { look: { colour: 9, skin: "dots", second: 12, plate: 9, icon: "star", country: null }, angle: 0, self: true, label: "AN" },
  { look: { colour: 2, skin: "stripes", second: 11, plate: 7, icon: null, country: null }, angle: 180, label: "BU" },
  { look: { colour: 3, skin: "hearts", second: 5, plate: null, icon: "cat", country: null }, angle: 90, label: "CI" },
  { look: plainTankLook(4), angle: -90, label: "DE" },
];

/** One look shown at each detail level, so the levels can be compared side by side. */
const LEVEL_SAMPLE: TankLook = { colour: 1, skin: "zigzag", second: 3, plate: 6, icon: "rocket", country: null };

function TankSection() {
  const m = useMessages();
  const k = m.kit;
  const t = m.mytank;
  return (
    <Section heading={k.tanks} intro={k.tanksIntro}>
      <h3 className="text-lead">{k.tankColours}</h3>
      <ul className="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(5.5rem,1fr))] gap-4 p-0">
        {TANK_COLOURS.map((colour) => (
          <li key={colour} className="flex flex-col items-center gap-1 text-caption text-muted">
            <TankBadge colour={colour} size={64} name={m.common.tankColours[colour]} angle={-90} />
            {m.common.tankColours[colour]}
          </li>
        ))}
      </ul>
      <h3 className="text-lead">{k.skins}</h3>
      <ul className="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(5.5rem,1fr))] gap-4 p-0" data-kit-skins="">
        {TANK_SKINS.map((skin, i) => {
          const look: TankLook = { colour: i % 2 === 0 ? 1 : 10, skin, second: i % 2 === 0 ? 3 : 11, plate: null, icon: null, country: null };
          return (
            <li key={skin} className="flex flex-col items-center gap-1 text-caption text-muted">
              <TankBadge look={look} size={64} name={t.skins[skin]} angle={-90} />
              <TankBadge look={look} size={40} name={null} angle={-90} />
              {t.skins[skin]}
            </li>
          );
        })}
      </ul>
      <h3 className="text-lead">{k.icons}</h3>
      <ul className="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(5.5rem,1fr))] gap-4 p-0" data-kit-icons="">
        {TANK_ICONS.map((icon, i) => {
          const look: TankLook = { colour: ((i % 12) + 1) as TankColour, skin: "plain", second: (((i + 5) % 12) + 1) as TankColour, plate: null, icon, country: null };
          return (
            <li key={icon} className="flex flex-col items-center gap-1 text-caption text-muted">
              <TankBadge look={look} size={64} name={t.icons[icon]} angle={-90} />
              <TankBadge look={look} size={40} name={null} angle={-90} />
              {t.icons[icon]}
            </li>
          );
        })}
      </ul>
      <h3 className="text-lead">{k.levels}</h3>
      <div className="flex flex-wrap items-end gap-6">
        <span className="flex flex-col items-center gap-1 text-caption text-muted">
          <TankBadge look={LEVEL_SAMPLE} size={96} name={null} detail="full" angle={-90} />
          {k.levelFull}
        </span>
        <span className="flex flex-col items-center gap-1 text-caption text-muted">
          <TankBadge look={LEVEL_SAMPLE} size={40} name={null} detail="full" angle={-90} />
          {k.levelFull}
        </span>
        <span className="flex flex-col items-center gap-1 text-caption text-muted">
          <TankBadge look={LEVEL_SAMPLE} size={24} name={null} detail="simple" angle={-90} />
          {k.levelSimple}
        </span>
        <span className="flex flex-col items-center gap-1 text-caption text-muted">
          <TankBadge look={LEVEL_SAMPLE} size={16} name={null} detail="tiny" angle={-90} />
          {k.levelTiny}
        </span>
      </div>
      <h3 className="text-lead">{k.selfAndLabels}</h3>
      <div className="flex flex-wrap items-center gap-4">
        <TankBadge look={{ colour: 9, skin: "stars", second: 12, plate: 9, icon: "crown", country: null }} size={64} name={m.common.yourTank} self angle={-90} />
        <TankBadge colour={9} size={64} name={m.common.yourTank} self label="A" angle={-45} />
        <TankBadge colour={6} size={64} name={m.common.tankOf("Budi")} label="BU" angle={30} />
        <TankBadge look={{ colour: 9, skin: "plain", second: 1, plate: 9, icon: "heart", country: null }} size={24} name={m.common.yourTank} self detail="simple" angle={-90} />
        <TankBadge colour={7} size={16} name={m.common.yourTank} self detail="simple" angle={0} />
      </div>
      <h3 className="text-lead">{k.onTheBoard}</h3>
      <svg viewBox="0 0 40 10" width={160} height={40} aria-hidden="true" className="block">
        <rect width={40} height={10} style={{ fill: "var(--color-arena-floor)" }} />
        {BOARD_SAMPLE.map((tank, i) => (
          <g key={tank.label} transform={`translate(${5 + i * 10} 5) scale(0.85)`}>
            <TankShape look={tank.look} angle={tank.angle} self={tank.self ?? false} label={tank.label} />
          </g>
        ))}
        {[10, 20, 30].map((x) => (
          <line key={x} x1={x} y1={0} x2={x} y2={10} strokeWidth={0.2} style={{ stroke: "var(--color-arena-grid)" }} />
        ))}
      </svg>
    </Section>
  );
}

function ControlsSection() {
  const m = useMessages();
  const k = m.kit;
  const toast = useToast();
  const [style, setStyle] = useState<"a" | "b" | "c">("a");
  const [speed, setSpeed] = useState<"slow" | "normal" | "fast">("normal");
  const [tab, setTab] = useState<"simple" | "advanced">("simple");
  const [range, setRange] = useState(2);
  const [colour, setColour] = useState<TankColour>(1);
  const [dialogOpen, setDialogOpen] = useState(false);
  return (
    <>
      <Section heading={k.buttons}>
        <div className="flex flex-wrap items-center gap-3">
          <Button>{k.sampleAction}</Button>
          <Button variant="secondary">{k.sampleSecondary}</Button>
          <Button variant="quiet">{k.sampleQuiet}</Button>
          <Button variant="danger">{k.sampleDanger}</Button>
          <Button loading>{k.sampleLoading}</Button>
          <Button disabled>{k.sampleAction}</Button>
          <Button size="lg">{k.sampleAction}</Button>
          <IconButton label={k.sampleIcon} icon={<X aria-hidden size={22} />} />
        </div>
      </Section>
      <Section heading={k.choices}>
        <ChoiceGroup
          legend={k.choiceLegend}
          value={style}
          onChange={setStyle}
          layout="grid"
          choices={[
            { value: "a", ...k.choiceA, visual: <TankBadge colour={2} size={48} name={null} angle={-30} /> },
            { value: "b", ...k.choiceB, visual: <TankBadge colour={5} size={48} name={null} angle={60} /> },
            { value: "c", ...k.choiceC, visual: <TankBadge colour={7} size={48} name={null} angle={-90} /> },
          ]}
        />
      </Section>
      <Section heading={k.segmented}>
        <SegmentedControl
          legend={k.segmentedLegend}
          value={speed}
          onChange={setSpeed}
          options={(["slow", "normal", "fast"] as const).map((value) => ({ value, label: k.speeds[value] }))}
        />
      </Section>
      <Section heading={k.tabs}>
        <Tabs
          label={k.tabsLabel}
          value={tab}
          onChange={setTab}
          tabs={[
            { value: "simple", label: k.tabSimple, panel: <p>{k.tabSimpleBody}</p> },
            { value: "advanced", label: k.tabAdvanced, panel: <p>{k.tabAdvancedBody}</p> },
          ]}
        />
      </Section>
      <Section heading={k.disclosure}>
        <Disclosure>
          <p>{k.disclosureBody}</p>
        </Disclosure>
      </Section>
      <Section heading={k.stepper}>
        <div className="max-w-sm">
          <Stepper label={k.stepperLabel} value={range} min={0} max={4} onChange={setRange} />
        </div>
      </Section>
      <Section heading={k.fields}>
        <div className="grid max-w-xl gap-4">
          <TextInput label={k.nameLabel} defaultValue="" error={k.nameError} />
          <Picker
            label={m.common.tankColour}
            value={String(colour)}
            choices={TANK_COLOURS.map((c) => ({ value: String(c), label: m.common.tankColours[c] }))}
            onChange={(next) => {
              const picked = toTankColour(Number(next));
              if (picked !== null) setColour(picked);
            }}
          />
        </div>
      </Section>
      <Section heading={k.banners}>
        <div className="flex flex-col gap-3">
          <StatusBanner tone="info" title={k.bannerInfo} />
          <StatusBanner tone="success" title={k.bannerSuccess} />
          <StatusBanner tone="warning" title={k.bannerWarning} />
          <StatusBanner tone="danger" title={k.bannerDanger} action={<Button variant="secondary">{k.bannerAction}</Button>} />
        </div>
      </Section>
      <Section heading={k.save}>
        <div className="flex flex-col gap-2">
          <SaveIndicator state={{ kind: "saving" }} />
          <SaveIndicator state={{ kind: "saved" }} />
          <SaveIndicator state={{ kind: "notSaved", reason: k.saveReason }} />
        </div>
      </Section>
      <Section heading={k.toast}>
        <Button
          variant="secondary"
          className="self-start"
          onClick={() => toast.show({ message: k.toastMessage, onUndo: () => toast.show({ message: k.toastUndone }) })}
        >
          {k.toastButton}
        </Button>
      </Section>
      <Section heading={k.empty}>
        <EmptyState title={k.emptyTitle} body={k.emptyBody} visual={<TankBadge colour={8} size={48} name={null} angle={-90} />} />
      </Section>
      <Section heading={k.countdown}>
        <div className="flex flex-wrap items-end gap-10">
          <Countdown seconds={3} />
          <Countdown seconds={10} size="md" />
        </div>
      </Section>
      <Section heading={k.dialog}>
        <Button variant="danger" className="self-start" onClick={() => setDialogOpen(true)}>
          {k.dialogOpen}
        </Button>
        <Dialog
          open={dialogOpen}
          title={k.dialogTitle}
          body={k.dialogBody}
          confirmLabel={k.dialogOpen}
          onConfirm={() => setDialogOpen(false)}
          onCancel={() => setDialogOpen(false)}
        />
      </Section>
    </>
  );
}

/**
 * "/kit?show=prep", "/kit?show=board", "/kit?show=room" and "/kit?show=layout" show one feature without a server, so its
 * engineer can look at it while the server is being changed. The feature owns its harness file.
 */
const HARNESSES: Readonly<Record<string, () => React.JSX.Element>> = { prep: PrepHarness, board: BoardHarness, room: RoomHarness, layout: LayoutHarness, monthly: MonthlyHarness };

export function KitPage() {
  const show = new URLSearchParams(window.location.search).get("show");
  const Harness = show !== null && Object.hasOwn(HARNESSES, show) ? HARNESSES[show] : undefined;
  return Harness === undefined ? <Gallery /> : <Harness />;
}

function Gallery() {
  const m = useMessages();
  const k = m.kit;
  const sampleLink = `${window.location.origin}/a/K7M2QX`;
  return (
    <>
      <AppHeader title={k.heading} />
      <Page width="editor">
        <div className="flex flex-col gap-2">
          <h1 className="text-heading">{k.heading}</h1>
          <p className="max-w-[65ch] text-lead text-muted">{k.intro}</p>
        </div>
        <LayoutSection />
        <TankSection />
        <Section heading={k.sounds} intro={k.soundsIntro}>
          <div className="flex flex-wrap gap-2">
            {SOUND_NAMES.map((name) => (
              <Button key={name} variant="secondary" onClick={() => playSound(name)}>
                {m.sound.names[name]}
              </Button>
            ))}
          </div>
        </Section>
        <Section heading={k.share}>
          <SharePanel link={sampleLink} code="K7M2QX" size="full" />
          <SharePanel link={sampleLink} code="K7M2QX" size="compact" />
          <div data-scale="screen" className="rounded-[var(--radius-card)] bg-panel p-6">
            <SharePanel link={sampleLink} code="K7M2QX" size="screen" />
          </div>
        </Section>
        <ControlsSection />
        <Section heading={k.typeScale}>
          <div className="flex flex-col gap-2">
            {(["text-display", "text-heading", "text-title", "text-lead", "text-body", "text-caption"] as const).map((size) => (
              <p key={size} className={`${size} ${size === "text-body" || size === "text-caption" ? "" : "font-display font-semibold"} truncate`}>
                {k.sampleSentence}
              </p>
            ))}
          </div>
        </Section>
        <Section heading={k.colours}>
          <ul className="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(8rem,1fr))] gap-3 p-0">
            {COLOUR_TOKENS.map((token) => (
              <li key={token} className="flex min-w-0 items-center gap-2 text-caption">
                <span className="size-8 shrink-0 rounded-lg border border-line" style={{ background: `var(--color-${token})` }} />
                <code className="min-w-0 truncate">{token}</code>
              </li>
            ))}
          </ul>
        </Section>
      </Page>
    </>
  );
}
