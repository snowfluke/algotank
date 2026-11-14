// The editor as a step that replaces a pane: in the join steps (with the name) and in the
// arena room (without it, because a name is fixed once a player joins). Done checks the
// name first; a name that breaks the rule keeps the sheet open on the name part.

import { useState } from "react";
import { useMessages } from "../i18n/I18nProvider.tsx";
import type { TankLook } from "../tank/look.ts";
import { Button } from "../ui/Button.tsx";
import { StepSheet } from "../ui/StepSheet.tsx";
import { MyTankEditor } from "./MyTankEditor.tsx";
import type { TankPart } from "./parts.ts";
import { SurpriseButton } from "./SurpriseButton.tsx";
import type { NameDraft } from "./useNameDraft.ts";

export interface MyTankSheetProps {
  readonly look: TankLook;
  onLook(next: TankLook): void;
  readonly tankName: string;
  /** The name to edit, or null in the arena room. */
  readonly name: NameDraft | null;
  /** Back and Done both close the sheet; every change is kept already. */
  onClose(): void;
  readonly startPart?: TankPart;
  /** A problem to show above the editor, such as a look the arena refused; null for none. */
  readonly notice?: string | null;
}

export function MyTankSheet({ look, onLook, tankName, name, onClose, startPart = "colour", notice = null }: MyTankSheetProps) {
  const m = useMessages();
  const [start, setStart] = useState<{ part: TankPart; visit: number }>({ part: startPart, visit: 0 });
  function close(): void {
    if (name !== null && !name.commit()) {
      setStart((old) => ({ part: "name", visit: old.visit + 1 }));
      return;
    }
    onClose();
  }
  return (
    <StepSheet
      title={m.mytank.heading}
      onBack={close}
      action={
        <>
          <SurpriseButton onLook={onLook} />
          <Button type="button" onClick={close} data-mytank-done="">
            {m.mytank.done}
          </Button>
        </>
      }
    >
      {notice === null ? null : (
        <p role="alert" className="shrink-0 font-semibold text-hit [overflow-wrap:anywhere]">
          {notice}
        </p>
      )}
      <MyTankEditor key={start.visit} look={look} onLook={onLook} tankName={tankName} name={name?.field ?? null} startPart={start.part} />
    </StepSheet>
  );
}
