// The dark mode button in every page header. A toggle: aria-pressed says whether dark mode is on, and
// the icon shows the theme a press gives (a moon in light mode, a sun in dark mode). Below 440px the
// header has no room for it (the sign-in button went off a 360px screen, and the kit page's header
// needs 433px), so there the page follows the device's setting.

import { Moon, Sun } from "lucide-react";
import { useMessages } from "../i18n/I18nProvider.tsx";
import { IconButton } from "../ui/IconButton.tsx";
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
      className="max-[440px]:hidden"
      icon={dark ? <Sun aria-hidden size={22} strokeWidth={2.25} /> : <Moon aria-hidden size={22} strokeWidth={2.25} />}
      onClick={() => choose(dark ? "light" : "dark")}
    />
  );
}
