/// <reference types="bun" />
import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { I18nProvider } from "../i18n/I18nProvider.tsx";
import { createLanguageStore } from "../i18n/language.ts";
import { SUPPORT_CONTACT } from "./contact.ts";
import { SupportContent } from "./SupportEntry.tsx";

describe("the Support modal", () => {
  test("links to GitHub Sponsors in a new tab without an opener, and to the business address by mail", () => {
    const html = renderToStaticMarkup(<SupportContent />);
    expect(html).toContain(`href="${SUPPORT_CONTACT.sponsorUrl}"`);
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toContain(`href="mailto:${SUPPORT_CONTACT.businessEmail}"`);
    expect(html).toContain("Donate on GitHub Sponsors");
  });

  test("reads in Indonesian", () => {
    const html = renderToStaticMarkup(
      <I18nProvider store={createLanguageStore({ store: null, initial: "id" })}>
        <SupportContent />
      </I18nProvider>,
    );
    expect(html).toContain("Donasi lewat GitHub Sponsors");
    expect(html).toContain("Kerja sama bisnis");
  });
});
