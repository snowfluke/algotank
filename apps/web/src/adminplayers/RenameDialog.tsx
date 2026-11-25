// The host's rename of a monthly tank (PUT /api/admin/players/:seatId/name): a name field in a
// native <dialog>, so focus stays inside and Escape closes it. The server checks the name rule
// and says why it refused (taken, blocked, not 3 to 16 letters); the sentence shows under the
// field and the dialog stays open. ui/Dialog.tsx is for yes-or-no questions only.

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { PLAYER_NAME_MAX, type AdminPlayer } from "@game/arena";
import { describeError } from "../api/errorSentences.ts";
import { putAdminTankName } from "../api/client.ts";
import { useMessages } from "../i18n/I18nProvider.tsx";
import { Button } from "../ui/Button.tsx";
import { TextInput } from "../ui/Field.tsx";

/** Open while `player` is not null; `onDone` runs after the server took the name. */
export function RenameDialog({ player, onCancel, onDone }: { readonly player: AdminPlayer | null; onCancel(): void; onDone(): void }) {
  const m = useMessages();
  const t = m.adminPlayers;
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const dialog = ref.current;
    if (dialog === null) return;
    if (player !== null && !dialog.open) {
      setName(player.name);
      setError(null);
      dialog.showModal();
    }
    if (player === null && dialog.open) dialog.close();
  }, [player]);

  async function save(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (player === null || saving) return;
    setSaving(true);
    const result = await putAdminTankName(player.seatId, name.trim());
    setSaving(false);
    if (result.ok) onDone();
    else setError(describeError(result, "renameTank", m.errors).sentence);
  }

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      data-dialog="admin-rename"
      onCancel={(event) => {
        event.preventDefault();
        onCancel();
      }}
      className="m-auto w-[min(28rem,calc(100%-2rem))] rounded-[var(--radius-card)] border-0 bg-panel p-0 text-ink shadow-[var(--shadow-raised)] backdrop:bg-scrim/50"
    >
      {player === null ? null : (
        <form onSubmit={(event) => void save(event)} className="flex min-w-0 flex-col gap-4 p-5">
          <h2 id={titleId} className="text-title [overflow-wrap:anywhere]">
            {t.renameTitle(player.name)}
          </h2>
          <p className="[overflow-wrap:anywhere]">{t.renameBody}</p>
          <TextInput label={t.renameField} value={name} maxLength={PLAYER_NAME_MAX} autoComplete="off" error={error} onChange={(event) => setName(event.target.value)} />
          <div className="flex min-w-0 flex-wrap justify-end gap-3">
            <Button type="button" variant="secondary" onClick={onCancel}>
              {m.common.cancel}
            </Button>
            <Button type="submit" loading={saving} disabled={name.trim() === ""}>
              {t.renameSave}
            </Button>
          </div>
        </form>
      )}
    </dialog>
  );
}
