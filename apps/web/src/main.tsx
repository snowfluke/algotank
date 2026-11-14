import "@fontsource-variable/fredoka";
import "@fontsource-variable/figtree";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app/App.tsx";
import { I18nProvider } from "./i18n/I18nProvider.tsx";
import { applyDocumentLanguage, languageStore } from "./i18n/language.ts";
import { ToastProvider } from "./ui/Toast.tsx";
import "./index.css";

const root = document.getElementById("root");
if (root === null) throw new Error("index.html has no #root element.");

applyDocumentLanguage(languageStore.get());

createRoot(root).render(
  <StrictMode>
    <I18nProvider>
      <ToastProvider>
        <App />
      </ToastProvider>
    </I18nProvider>
  </StrictMode>,
);
