import { readFileSync } from "node:fs";
// Serves the built web app. Any path without a file extension that matches no
// file gets index.html, so client-side routes survive a page reload.
//
// Link previews: WhatsApp and most sites read og:image only as an absolute address, so
// index.html goes out with the request's own origin in front of its og:image path, and an
// og:url for the page. Without a usable host the file goes out as built.

import { readFile, stat } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { requestHost } from "./auth/request.ts";

const INDEX = "index.html";
/** The tag as apps/web/index.html writes it; Vite copies it unchanged. */
const OG_IMAGE_TAG = /<meta property="og:image" content="(\/[^"]*)"\s*\/?>/;
/** Icons and the preview image in the root change rarely and keep their names, so a day of cache, without `immutable`. */
const ROOT_IMAGE_EXTENSIONS = new Set([".png", ".svg", ".ico", ".webp", ".jpg"]);
const ROOT_IMAGE_CACHE = "public, max-age=86400";
const HTML_ESCAPES: Readonly<Record<string, string>> = { "&": "&amp;", '"': "&quot;", "<": "&lt;", ">": "&gt;" };
const HTML_SPECIAL = /[&"<>]/g;

function escapeAttribute(value: string): string {
  return value.replace(HTML_SPECIAL, (c) => HTML_ESCAPES[c] ?? c);
}

/**
 * The origin the visitor used, such as https://algotank.example: the host from requestHost (the
 * proxy's X-Forwarded-Host only with TRUST_PROXY) and https when the cookie is Secure
 * (COOKIE_SECURE), because that is when the site is served over HTTPS. Null when the host is
 * missing or is not a plain host and port, because the client chooses it.
 */
export function requestOrigin(req: Request, options: { readonly trustProxy: boolean; readonly secure: boolean }): string | null {
  const host = requestHost(req, options.trustProxy);
  if (host === null) return null;
  try {
    const url = new URL(`${options.secure ? "https" : "http"}://${host}`);
    if (url.pathname !== "/" || url.search !== "" || url.hash !== "" || url.username !== "" || url.password !== "") return null;
    return url.origin;
  } catch {
    return null; // a host that does not parse gives no origin, and the page keeps its relative address
  }
}

function notFound(): Response {
  return new Response("Not found", { status: 404, headers: { "content-type": "text/plain; charset=utf-8" } });
}

// Paths that cannot name a file: missing, a file in the place of a directory, a name
// over the file system limit (255 bytes) and a symlink loop. A client can send any of them.
const NOT_A_FILE_CODES = new Set(["ENOENT", "ENOTDIR", "ENAMETOOLONG", "ELOOP"]);

async function isFile(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isFile();
  } catch (error) {
    // A missing path is an answer. Any other failure, such as a permission error, is not.
    if (error instanceof Error && "code" in error && typeof error.code === "string" && NOT_A_FILE_CODES.has(error.code)) return false;
    throw error;
  }
}

function cacheFor(pathname: string): string {
  // Vite names files under /assets/ by content hash, so they never change.
  if (pathname.startsWith("/assets/")) return "public, max-age=31536000, immutable";
  // A music file's name carries a version (sound/musicTracks.ts), so a new render gets a new name.
  if (pathname.startsWith("/music/")) return "public, max-age=31536000, immutable";
  // Country flags (apps/web/public/flags, from flag-icons): a board asks for many at once, and they change only with a new set.
  if (pathname.startsWith("/flags/")) return "public, max-age=604800";
  const inRoot = pathname.lastIndexOf("/") === 0;
  return inRoot && ROOT_IMAGE_EXTENSIONS.has(extname(pathname).toLowerCase()) ? ROOT_IMAGE_CACHE : "no-cache";
}

function fileResponse(path: string, pathname: string): Response {
  // Bun.file names the content type from the extension (image/png, image/svg+xml, text/javascript).
  return new Response(Bun.file(path), { headers: { "cache-control": cacheFor(pathname) } });
}

/** index.html with absolute preview addresses. The type is named, because a string body would go out as text/plain. */
async function indexResponse(path: string, pathname: string, origin: string | null): Promise<Response> {
  const headers = { "cache-control": "no-cache", "content-type": "text/html; charset=utf-8" };
  const html = await readFile(path, "utf8");
  if (origin === null) return new Response(html, { headers });
  const safeOrigin = escapeAttribute(origin);
  const withPreview = html.replace(
    OG_IMAGE_TAG,
    (_tag, imagePath: string) =>
      `<meta property="og:image" content="${safeOrigin}${imagePath}" />\n    <meta property="og:url" content="${safeOrigin}${escapeAttribute(pathname)}" />`,
  );
  return new Response(withPreview, { headers });
}

/**
 * `root` is the directory to serve and `pathname` is the URL path as the client sent it.
 * `origin` (requestOrigin) goes in front of index.html's preview image; null leaves it relative.
 */
export async function serveStatic(root: string, pathname: string, origin: string | null = null): Promise<Response> {
  let decoded: string;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return notFound();
  }
  if (decoded.includes("\0")) return notFound();

  const rootPath = resolve(root);
  const target = resolve(rootPath, `.${decoded}`);
  // Path traversal guard: after decoding and resolving ".." the target must still be inside the root.
  if (target !== rootPath && !target.startsWith(rootPath + sep)) return notFound();

  const index = resolve(rootPath, INDEX);
  if (await isFile(target)) return target === index ? indexResponse(index, pathname, origin) : fileResponse(target, pathname);

  // A missing asset such as /assets/old.js must fail loudly. Returning HTML for it
  // would load as a script and break with a confusing error.
  if (extname(decoded) !== "") return notFound();

  return (await isFile(index)) ? indexResponse(index, pathname, origin) : notFound();
}

/** The entry script in the built index.html, as Vite writes it: `<script type="module" crossorigin src="/assets/index-…js">`. */
const ENTRY_SCRIPT = /<script type="module"[^>]*\ssrc="(\/assets\/[^"]+\.js)"/;

/**
 * The page's build: the address of its entry script, which changes with every release (Vite names
 * it by content). The API answers carry it (server.ts, x-page-build), so a tab left open on an
 * older release can offer a reload. Null when there is no built page, as in the server's tests.
 */
export function pageBuildOf(root: string): string | null {
  let html: string;
  try {
    html = readFileSync(resolve(root, INDEX), "utf8");
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return null;
    throw error;
  }
  return ENTRY_SCRIPT.exec(html)?.[1] ?? null;
}
