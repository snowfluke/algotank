// "Number of tanks": how many tanks a game of a private or presenter arena has
// (ArenaSettings.tankCount, docs/specs/revamp/78-arena-seats.md). Presets take one tap and
// minus and plus reach any number in between, so a phone never needs its keyboard. The
// create form and the owner's settings use it, so both offer the same choices. Where the
// row is wide enough, the presets sit beside minus and plus, so the control takes one row.

import { tankCountRange, type CreateArenaRequest } from "@game/arena";
import { useMessages } from "../i18n/I18nProvider.tsx";
import { SegmentedControl } from "../ui/SegmentedControl.tsx";
import { Stepper } from "../ui/Stepper.tsx";

type OwnerKind = CreateArenaRequest["kind"];

/** The one-tap choices. Five fit a 360 px phone in one row. */
const PRESETS: Readonly<Record<OwnerKind, readonly number[]>> = {
  private: [8, 16, 32, 48, 64],
  presenter: [32, 64, 128, 256, 512],
};

export interface TankCountControlProps {
  readonly kind: OwnerKind;
  readonly value: number;
  /** The smallest choice: the kind's minimum, or the people already in the arena when that is more. */
  readonly min: number;
  onChange(next: number): void;
  readonly disabled?: boolean;
  /** Leaves out the presets, for a pane too short for them (useFitDetail); minus and plus still reach every number. */
  readonly brief?: boolean;
}

export function TankCountControl({ kind, value, min, onChange, disabled = false, brief = false }: TankCountControlProps) {
  const t = useMessages().room.tankCount;
  const { max } = tankCountRange(kind);
  const presets = brief ? [] : PRESETS[kind].filter((n) => n >= min);
  return (
    <div data-tank-count="" className="flex w-full min-w-0 flex-wrap items-center gap-x-4 gap-y-2">
      <div className="min-w-0 flex-[1_1_15rem]">
        <Stepper label={t.label} value={value} min={min} max={max} onChange={onChange} disabled={disabled} />
      </div>
      {presets.length === 0 ? null : (
        <div className="max-w-full shrink-0">
          <SegmentedControl
          legend={t.label}
          hideLegend
          options={presets.map((n) => ({ value: String(n), label: String(n) }))}
          value={String(value)}
          onChange={(next) => {
            if (!disabled) onChange(Number(next));
          }}
          />
        </div>
      )}
    </div>
  );
}
