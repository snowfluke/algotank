// The language switch in every page header. Each language is named in its own
// language, so a person who cannot read the current one still finds theirs. On a
// phone it shows the two-letter codes, so the header keeps one row.

import { SegmentedControl } from "../ui/SegmentedControl.tsx";
import { useLanguage, useMessages } from "./I18nProvider.tsx";
import { LANGUAGES } from "./language.ts";

export function LanguageSwitch() {
  const [language, setLanguage] = useLanguage();
  const m = useMessages();
  return (
    <SegmentedControl
      legend={m.common.language}
      hideLegend
      size="sm"
      options={LANGUAGES.map((value) => ({ value, label: m.common.languageNames[value], shortLabel: m.common.languageCodes[value], lang: value }))}
      value={language}
      onChange={setLanguage}
    />
  );
}
