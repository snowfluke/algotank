// The dark mode button in every page header, at every width. A toggle: aria-pressed says whether dark
// mode is on, and the icon shows the theme a press gives (a moon in light mode, a sun in dark mode).
// ThemeSwitch is the same choice as a switch in the sound panel, for the big screen, which has no header.

import { Moon, Sun } from "lucide-react";
import { useMessages } from "../i18n/I18nProvider.tsx";
import { IconButton } from "../ui/IconButton.tsx";
import { Switch } from "../ui/Switch.tsx";
import { useTheme } from "./theme.ts";

export function ThemeControl() {
  const m = useMessages().theme;
  const [theme, choose] = useTheme();
  const dark = theme === "dark";
  return (
    <IconButton
      label={m.dark}
      aria-pressed={dark}
      data-theme-toggle=""
      icon={dark ? <Sun aria-hidden size={22} strokeWidth={2.25} /> : <Moon aria-hidden size={22} strokeWidth={2.25} />}
      onClick={() => choose(dark ? "light" : "dark")}
    />
  );
}

export function ThemeSwitch() {
  const m = useMessages().theme;
  const [theme, choose] = useTheme();
  return <Switch label={m.dark} on={theme === "dark"} onChange={(on) => choose(on ? "dark" : "light")} />;
}
