// "Surprise me": a random look in one tap. Every host of the editor puts it next to its
// own Done, so it lives here once. The new look is said aloud, because only the picture changes.

import { Dices } from "lucide-react";
import { useState } from "react";
import { useMessages } from "../i18n/I18nProvider.tsx";
import { randomLook, type TankLook } from "../tank/look.ts";
import { Button } from "../ui/Button.tsx";

export function SurpriseButton({ onLook }: { onLook(next: TankLook): void }) {
  const m = useMessages();
  const [times, setTimes] = useState(0);
  return (
    <>
      <Button
        type="button"
        variant="secondary"
        icon={<Dices aria-hidden size={20} />}
        data-surprise=""
        onClick={() => {
          onLook(randomLook(Math.random));
          setTimes((n) => n + 1);
        }}
      >
        {m.mytank.surprise}
      </Button>
      <span className="sr-only" aria-live="polite">
        {times === 0 ? "" : m.mytank.surprised}
      </span>
    </>
  );
}
