// The language switch in every page header. Each language is named in its own
// language, so a person who cannot read the current one still finds theirs. From 768px
// it shows both languages; below that one 44px button shows the code of the other
// language and switches to it, so the header keeps one row with the dark mode button
// (ui/AppHeader.tsx): the segmented switch is 100px wide with codes and 215px with names.

import { IconButton } from "../ui/IconButton.tsx";
import { SegmentedControl } from "../ui/SegmentedControl.tsx";
import { useLanguage, useMessages } from "./I18nProvider.tsx";
import { LANGUAGES, type Language } from "./language.ts";

export function LanguageSwitch() {
  const [language, setLanguage] = useLanguage();
  const m = useMessages();
  const other: Language = LANGUAGES.find((value) => value !== language) ?? language;
  return (
    <>
      <div className="max-[768px]:hidden">
        <SegmentedControl
          legend={m.common.language}
          hideLegend
          size="sm"
          options={LANGUAGES.map((value) => ({ value, label: m.common.languageNames[value], shortLabel: m.common.languageCodes[value], lang: value }))}
          value={language}
          onChange={setLanguage}
        />
      </div>
      <IconButton
        label={m.common.languageNames[other]}
        lang={other}
        data-language-toggle=""
        className="font-display font-semibold min-[768px]:hidden"
        icon={<span aria-hidden="true">{m.common.languageCodes[other]}</span>}
        onClick={() => setLanguage(other)}
      />
    </>
  );
}
