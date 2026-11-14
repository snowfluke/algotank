// "Bots fill empty seats" as an on/off switch. The create form, the room and the
// presenter page use it, so the three say the same thing. Its sentence names the tanks
// the bots fill to (seatsOf(settings).botsFillTo).

import { useMessages } from "../i18n/I18nProvider.tsx";
import { Switch } from "../ui/Switch.tsx";

export interface BotsSwitchProps {
  readonly on: boolean;
  /** The number of tanks the bots fill to. */
  readonly tanks: number;
  onChange(next: boolean): void;
  readonly disabled?: boolean;
}

export function BotsSwitch({ on, tanks, onChange, disabled = false }: BotsSwitchProps) {
  const m = useMessages();
  return <Switch label={m.room.bots.label} description={on ? m.room.bots.on(tanks) : m.room.bots.off} on={on} onChange={onChange} disabled={disabled} />;
}
