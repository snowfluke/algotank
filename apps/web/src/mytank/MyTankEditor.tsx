// The "My tank" editor as one pane (the pane contract in 11-foundation-guide.md): a large
// live tank on top, a row of part tabs, and the choices of one part as a grid of large
// squares. Three screens host it: the "My tank" page, the join step, and the room's tank
// sheet (which leaves out the name, because a name is fixed once a player joins).
// The host owns the look and the name, so Back or Done loses nothing.

import { PenLine } from "lucide-react";
import { PLAYER_NAME_MAX } from "@game/arena";
import { useId, useState, type KeyboardEvent, type ReactNode } from "react";
import { useMessages } from "../i18n/I18nProvider.tsx";
import type { TankLook } from "../tank/look.ts";
import { TextInput } from "../ui/Field.tsx";
import { ChoiceGrid } from "./ChoiceGrid.tsx";
import { LiveTank } from "./LiveTank.tsx";
import { choose, isChosen, partChoices, TANK_PARTS, type PartChoice, type TankPart } from "./parts.ts";
import { ColourSwatch, IconSwatch, NoneSwatch, PatternSwatch, PlateSwatch } from "./Swatches.tsx";

export interface NameField {
  readonly value: string;
  onChange(next: string): void;
  /** The sentence under the field, or null. */
  readonly error: string | null;
}

export interface MyTankEditorProps {
  readonly look: TankLook;
  onLook(next: TankLook): void;
  /** The name of the tank, for the letters on a tank without an icon. */
  readonly tankName: string;
  /** The name part, or null where the name cannot change (inside an arena). */
  readonly name: NameField | null;
  /** The part shown first; the name part when a name problem brings the player here. */
  readonly startPart?: TankPart;
}

function choiceKey(choice: PartChoice): string {
  return choice.value === null ? "none" : String(choice.value);
}

function Swatch({ look, choice }: { readonly look: TankLook; readonly choice: PartChoice }): ReactNode {
  switch (choice.part) {
    case "colour":
    case "second":
      return <ColourSwatch colour={choice.value} />;
    case "skin":
      return <PatternSwatch look={{ ...look, skin: choice.value }} />;
    case "plate":
      return choice.value === null ? <NoneSwatch /> : <PlateSwatch colour={choice.value} />;
    case "icon":
      return choice.value === null ? <NoneSwatch /> : <IconSwatch look={{ ...look, icon: choice.value }} />;
  }
}

/** The picture on a part's tab: what the part is set to now. */
function PartPicture({ look, part }: { readonly look: TankLook; readonly part: TankPart }): ReactNode {
  switch (part) {
    case "colour":
      return <ColourSwatch colour={look.colour} />;
    case "second":
      return <ColourSwatch colour={look.second} />;
    case "skin":
      return <PatternSwatch look={look} />;
    case "plate":
      return look.plate === null ? <NoneSwatch /> : <PlateSwatch colour={look.plate} />;
    case "icon":
      return look.icon === null ? <NoneSwatch /> : <IconSwatch look={look} />;
    case "name":
      return <PenLine aria-hidden className="size-full" strokeWidth={2.2} />;
  }
}

function PartTabs({ parts, value, onChange, look, panelId }: { readonly parts: readonly TankPart[]; readonly value: TankPart; onChange(part: TankPart): void; readonly look: TankLook; readonly panelId: string }) {
  const m = useMessages();
  const t = m.mytank;
  function onKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    const index = parts.indexOf(value);
    const next =
      event.key === "ArrowRight" ? parts[(index + 1) % parts.length] : event.key === "ArrowLeft" ? parts[(index - 1 + parts.length) % parts.length] : event.key === "Home" ? parts[0] : event.key === "End" ? parts[parts.length - 1] : undefined;
    if (next === undefined) return;
    event.preventDefault();
    onChange(next);
    // The new tab takes focus, as in every tab list (roving focus).
    requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-tank-part="${next}"]`)?.focus());
  }
  return (
    <div role="tablist" aria-label={t.parts} onKeyDown={onKeyDown} className="grid shrink-0 gap-0.5" style={{ gridTemplateColumns: `repeat(${parts.length}, minmax(0, 1fr))` }}>
      {parts.map((part) => {
        const selected = part === value;
        return (
          <button
            key={part}
            type="button"
            role="tab"
            aria-selected={selected}
            aria-controls={panelId}
            tabIndex={selected ? 0 : -1}
            data-tank-part={part}
            onClick={() => onChange(part)}
            className={`press flex min-h-16 min-w-0 flex-col items-center justify-start gap-1 rounded-[var(--radius-control)] border-2 px-0 pt-1.5 pb-1 text-caption leading-tight font-semibold ${
              selected ? "border-water bg-water-soft text-ink" : "border-transparent text-muted"
            }`}
          >
            <span className="block size-6 shrink-0 text-ink">
              <PartPicture look={look} part={part} />
            </span>
            <span className="min-w-0 text-center [overflow-wrap:normal] [word-break:keep-all]">{t.partNames[part]}</span>
          </button>
        );
      })}
    </div>
  );
}

export function MyTankEditor({ look, onLook, tankName, name, startPart = "colour" }: MyTankEditorProps) {
  const m = useMessages();
  const t = m.mytank;
  const panelId = useId();
  const parts: readonly TankPart[] = name === null ? TANK_PARTS.filter((p) => p !== "name") : TANK_PARTS;
  const [chosenPart, setPart] = useState<TankPart>(startPart);
  const part = parts.includes(chosenPart) ? chosenPart : "colour";

  return (
    <div className="flex min-w-0 flex-col gap-3 fit:min-h-0 fit:flex-1 fit:[container-type:size] fit:[container-name:mytank] laptop:grid laptop:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)] laptop:gap-6" data-mytank-editor="">
      {/* In a short box the tank gets smaller, and under 17rem it gives way (index.css, .mytank-stage), so the choices keep a row. */}
      <div className="mytank-stage flex h-40 min-w-0 items-center justify-center fit:h-auto fit:min-h-0 fit:flex-[1_1_0] laptop:h-full">
        <LiveTank look={look} name={tankName} label={tankName === "" ? m.common.yourTank : m.common.tankOf(tankName)} />
      </div>
      <div className="flex min-w-0 flex-col gap-3 fit:min-h-0 fit:flex-[2_1_0]">
        <PartTabs parts={parts} value={part} onChange={setPart} look={look} panelId={panelId} />
        <div id={panelId} role="tabpanel" aria-label={t.partNames[part]} data-tank-part-panel={part} className="flex min-w-0 flex-col fit:min-h-0 fit:flex-1">
          {part === "name" ? (
            name === null ? null : (
              <div className="flex flex-col gap-2">
                <TextInput
                  label={t.nameLabel}
                  hint={t.nameHint}
                  value={name.value}
                  autoComplete="nickname"
                  enterKeyHint="done"
                  maxLength={PLAYER_NAME_MAX}
                  onChange={(event) => name.onChange(event.currentTarget.value)}
                  error={name.error}
                />
              </div>
            )
          ) : (
            <ChoiceGrid<PartChoice>
              key={part}
              legend={t.questions[part]}
              items={partChoices(part)}
              itemKey={choiceKey}
              label={(choice) => choiceName(choice, t, m.common.tankColours)}
              chosen={(choice) => isChosen(look, choice)}
              unavailable={(choice) => (choose(look, choice) === null ? t.sameAsHull : null)}
              render={(choice) => <Swatch look={look} choice={choice} />}
              onChoose={(choice) => {
                const next = choose(look, choice);
                if (next !== null) onLook(next);
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}

type MyTankText = ReturnType<typeof useMessages>["mytank"];

function choiceName(choice: PartChoice, t: MyTankText, colours: ReturnType<typeof useMessages>["common"]["tankColours"]): string {
  switch (choice.part) {
    case "colour":
    case "second":
      return colours[choice.value];
    case "skin":
      return t.skins[choice.value];
    case "plate":
      return choice.value === null ? t.none : colours[choice.value];
    case "icon":
      return choice.value === null ? t.none : t.icons[choice.value];
  }
}
