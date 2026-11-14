import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { serveStatic } from "./static.ts";
import { createTestArena, startTestServer, type TestServer } from "./test-helpers.ts";

let base: string;
let root: string;

beforeAll(async () => {
  base = await mkdtemp(join(tmpdir(), "static-test-"));
  root = join(base, "dist");
  await mkdir(join(root, "assets"), { recursive: true });
  await writeFile(join(root, "index.html"), "<!doctype html><title>app</title>");
  await writeFile(join(root, "assets", "app-1a2b.js"), "console.log(1)");
  await mkdir(join(root, "music"));
  await writeFile(join(root, "music", "a-mallets-v1.mp3"), "mp3");
  await writeFile(join(base, "secret.txt"), "secret");
});

afterAll(async () => {
  await rm(base, { recursive: true, force: true });
});

describe("serveStatic", () => {
  test("serves a file, and index.html for the root and for client-side routes", async () => {
    const asset = await serveStatic(root, "/assets/app-1a2b.js");
    expect(asset.status).toBe(200);
    expect(await asset.text()).toBe("console.log(1)");
    expect(asset.headers.get("cache-control")).toContain("immutable");

    for (const path of ["/", "/arena/ABC234", "/arena/ABC234/"]) {
      const page = await serveStatic(root, path);
      expect(await page.text()).toContain("<title>app</title>");
      expect(page.headers.get("cache-control")).toBe("no-cache");
    }
  });

  test("lets a browser keep a music file for a year, because its name changes with each render", async () => {
    const track = await serveStatic(root, "/music/a-mallets-v1.mp3");
    expect(track.status).toBe(200);
    expect(track.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
  });

  test("answers a name over the file system limit and a symlink loop like a missing path", async () => {
    // A name with an extension is a missing asset. One without is a client-side route.
    expect((await serveStatic(root, `/${"a".repeat(300)}.js`)).status).toBe(404);
    const route = await serveStatic(root, `/${"a".repeat(300)}`);
    expect(await route.text()).toContain("<title>app</title>");

    await symlink("loop.js", join(root, "loop.js"));
    expect((await serveStatic(root, "/loop.js")).status).toBe(404);
  });

  test("answers 404 for a missing file with an extension", async () => {
    expect((await serveStatic(root, "/assets/old.js")).status).toBe(404);
  });

  test("never leaves the root", async () => {
    for (const path of ["/../secret.txt", "/%2e%2e/secret.txt", "/..%2fsecret.txt", "/assets/../../secret.txt", "/%00", "/%zz"]) {
      const res = await serveStatic(root, path);
      expect(res.status).toBe(404);
      expect(await res.text()).not.toContain("secret");
    }
  });

  test("answers 404 when the build folder does not exist", async () => {
    expect((await serveStatic(join(base, "missing"), "/")).status).toBe(404);
  });
});

describe("server routing", () => {
  let t: TestServer;
  beforeAll(() => {
    t = startTestServer({ staticDir: root });
  });
  afterAll(async () => {
    await t.server.stop();
  });

  test("serves the app for non-api paths and JSON 404 for unknown api paths", async () => {
    expect(await (await fetch(`${t.server.url}/join/XYZ`)).text()).toContain("<title>app</title>");
    const api = await fetch(`${t.server.url}/api/nothing`);
    expect(api.status).toBe(404);
    expect(((await api.json()) as { error: string }).error).toBeString();
    expect((await fetch(`${t.server.url}/other`, { method: "POST" })).status).toBe(404);
  });

  test("an arena created beside the static files still works", async () => {
    expect((await createTestArena(t)).arenaId).toHaveLength(6);
  });
});

describe("link previews and the root images", () => {
  const OG = '<meta property="og:image" content="/og-image.png" />';
  let site: string;
  const servers: TestServer[] = [];

  beforeAll(async () => {
    site = join(base, "site");
    await mkdir(site, { recursive: true });
    await writeFile(join(site, "index.html"), `<!doctype html><head><title>AlgoTank</title>\n    ${OG}\n</head>`);
    await writeFile(join(site, "og-image.png"), new Uint8Array([0x89, 0x50, 0x4e, 0x47]));
    await writeFile(join(site, "favicon.svg"), "<svg xmlns='http://www.w3.org/2000/svg'/>");
  });
  afterAll(async () => {
    for (const t of servers) await t.server.stop();
  });

  function serve(options: { trustProxy: boolean; secureCookies: boolean }): TestServer {
    const t = startTestServer({ staticDir: site, ...options });
    servers.push(t);
    return t;
  }

  test("a direct request gets its own Host as the origin of og:image, and an og:url for the page", async () => {
    const t = serve({ trustProxy: false, secureCookies: false });
    const res = await fetch(`${t.server.url}/a/K7M2QX`, { headers: { host: "game.example:8080", "x-forwarded-host": "evil.example" } });
    expect(res.headers.get("content-type")).toBe("text/html; charset=utf-8");
    expect(res.headers.get("cache-control")).toBe("no-cache");
    const html = await res.text();
    expect(html).toContain('<meta property="og:image" content="http://game.example:8080/og-image.png" />');
    expect(html).toContain('<meta property="og:url" content="http://game.example:8080/a/K7M2QX" />');
    expect(html).not.toContain("evil.example");
  });

  test("behind a trusted proxy with COOKIE_SECURE the origin is https and the forwarded host", async () => {
    const t = serve({ trustProxy: true, secureCookies: true });
    const html = await (await fetch(`${t.server.url}/`, { headers: { "x-forwarded-host": "algotank.example" } })).text();
    expect(html).toContain('<meta property="og:image" content="https://algotank.example/og-image.png" />');
    expect(html).toContain('<meta property="og:url" content="https://algotank.example/" />');
  });

  test("a host that is not a plain host leaves the address relative", async () => {
    const t = serve({ trustProxy: true, secureCookies: false });
    const html = await (await fetch(`${t.server.url}/`, { headers: { "x-forwarded-host": 'evil.example/"><script>' } })).text();
    expect(html).toContain(OG);
    expect(html).not.toContain("og:url");
    expect(html).not.toContain("<script>");
  });

  test("the icons and the preview image have their content type and a day of cache", async () => {
    const t = serve({ trustProxy: false, secureCookies: false });
    const png = await fetch(`${t.server.url}/og-image.png`);
    expect(png.headers.get("content-type")).toBe("image/png");
    expect(png.headers.get("cache-control")).toBe("public, max-age=86400");
    const svg = await fetch(`${t.server.url}/favicon.svg`);
    expect(svg.headers.get("content-type")).toStartWith("image/svg+xml");
    expect(svg.headers.get("cache-control")).toBe("public, max-age=86400");
  });
});
