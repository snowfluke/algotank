// The player's tank in a join step: the tank as it will enter the arena, "Change my tank"
// (which opens the editor), and the name, filled in from "My tank". The host form owns
// the Join button and the sheet; when the sheet closes, the host returns focus to
// `[data-opens="mytank"]`.
//
// `detail` lets a crowded screen (the arena chooser on a small phone) give way: "brief"
// leaves out the name's hint, "compact" puts the tank and "Change my tank" in one row and
// leaves the name to the editor, which has a name part. `row` puts the tank and the name
// side by side on a laptop, where the height is short and the width is not.

import { Paintbrush } from "lucide-react";
import { useMessages } from "../i18n/I18nProvider.tsx";
import { tankLetters, type TankLook } from "../tank/look.ts";
import { TankBadge } from "../tank/TankBadge.tsx";
import { Button } from "../ui/Button.tsx";
import { TextInput } from "../ui/Field.tsx";
import { PLAYER_NAME_MAX } from "@game/arena";
import type { NameDraft } from "./useNameDraft.ts";

export type JoinTankDetail = "full" | "brief" | "compact";

export interface JoinTankProps {
  readonly look: TankLook;
  readonly name: NameDraft;
  onChange(): void;
  readonly detail?: JoinTankDetail;
  readonly row?: boolean;
}

export function JoinTank({ look, name, onChange, detail = "full", row = false }: JoinTankProps) {
  const m = useMessages();
  const t = m.mytank;
  const compact = detail === "compact";
  return (
    <div className={`flex min-w-0 flex-col gap-4 ${row ? "laptop:flex-row laptop:items-center laptop:gap-6 laptop:[&>*:last-child]:max-w-md laptop:[&>*:last-child]:flex-1" : ""}`}>
      <div className="flex min-w-0 shrink-0 flex-wrap items-center gap-4">
        <TankBadge look={look} label={tankLetters(name.field.value)} size={compact ? 48 : 80} name={null} detail="full" angle={-90} />
        <Button type="button" variant="secondary" icon={<Paintbrush aria-hidden size={20} />} onClick={onChange} data-opens="mytank">
          {t.change}
        </Button>
      </div>
      {/* Without the field, a name problem still shows; "Change my tank" leads to the name. */}
      {compact && name.field.error !== null ? (
        <p role="alert" className="font-semibold text-hit [overflow-wrap:anywhere]">
          {name.field.error}
        </p>
      ) : null}
      {compact ? null : (
        <TextInput
          label={t.nameLabel}
          {...(detail === "full" ? { hint: t.nameHint } : {})}
          value={name.field.value}
          maxLength={PLAYER_NAME_MAX}
          autoComplete="nickname"
          enterKeyHint="go"
          onChange={(event) => name.field.onChange(event.currentTarget.value)}
          error={name.field.error}
        />
      )}
    </div>
  );
}
