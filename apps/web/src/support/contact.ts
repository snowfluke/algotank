// Where the "Support" modal sends people (owner, 2026-11-13). One typed place, so a changed
// address or sponsor page is one edit.

export interface SupportContact {
  /** The owner's GitHub Sponsors page; opened in a new tab. */
  readonly sponsorUrl: string;
  /** For business inquiries; shown as a mailto link with a Copy button. */
  readonly businessEmail: string;
}

export const SUPPORT_CONTACT: SupportContact = {
  sponsorUrl: "https://github.com/sponsors/snowfluke",
  businessEmail: "awalariansyah7@gmail.com",
};
