// Loaded before every test file (bunfig.toml). The app starts in Indonesian, and most
// tests render a component bare and assert its English text, so the app's language
// store is set to English here. A test that needs Indonesian passes its own store.

import { languageStore } from "./i18n/language.ts";

languageStore.set("en");
