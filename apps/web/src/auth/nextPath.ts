// Where the sign-in page sends the person afterwards. `?next=` comes from the
// address bar, so anyone can write it: only a path to a page of this app passes,
// never another site ("//evil.example", "https://…", "/\evil.example").

import { parseRoute, paths } from "../app/route.ts";

const PATH_END = /[?#]/;

export function safeNextPath(raw: string | null): string {
  if (raw === null || !raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\")) return paths.home();
  const path = raw.split(PATH_END)[0] ?? "";
  const route = parseRoute(path);
  // Returning to the sign-in page would show the form again to a signed-in person, and the verify page to a verified one.
  if (route.page === "notFound" || route.page === "signIn" || route.page === "verifyEmail") return paths.home();
  return raw;
}

/** The `next` value of a search string such as "?next=%2Fnew%2Fprivate". */
export function nextFromSearch(search: string): string {
  return safeNextPath(new URLSearchParams(search).get("next"));
}
