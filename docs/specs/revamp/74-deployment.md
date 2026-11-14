# Work package D2: deployment on an Ubuntu VPS behind Cloudflare

Read `00-overview.md` (rules for every package) and the README (environment variables, routes). Owner, 2026-11-12: "target deployment are custom vps or in cloudflare" and "for vps probably ubuntu plain service".

## Decided by the lead

| Question | Decision | Reason |
|----------|----------|--------|
| Where the game runs | One Bun process on an Ubuntu LTS VPS | The server keeps arenas in memory, runs a timer per turn, holds one stream per player and stores files. That is one long-lived process with a disk. |
| Cloudflare's part | Proxy in front of the VPS: DNS, TLS at the edge, caching of the page files, attack protection | It needs no rewrite. A Workers and Durable Objects port would rewrite the server; Cloudflare Containers have a disk that resets. |
| Process manager | systemd is the default. A pm2 file is the alternative (`instances: 1`, `exec_mode: "fork"`). | systemd is on Ubuntu already. Arenas live in memory, so the game must run as exactly one instance. |
| Origin proxy | Caddy on the VPS in front of the Bun process. A Cloudflare Tunnel is described as the alternative for a VPS without open ports. | Caddy gives TLS to the origin and streams without buffering with little configuration. |
| Layout on the server | `/opt/algotank/releases/<timestamp>` with a `current` symlink; data in `/var/lib/algotank`; settings in `/etc/algotank/env`; a system user `algotank` | An update is a new folder and a symlink switch, so a rollback is the old symlink. Data and settings are outside the release. |

## What you build

You own a new `deploy/` folder, a new `docs/deployment/` folder, the README's deployment section, and in `apps/server/**` only what the checks below show is missing.

1. `deploy/algotank.service`: the systemd unit (user `algotank`, `EnvironmentFile=/etc/algotank/env`, `WorkingDirectory=/opt/algotank/current`, `Restart=always`, a stop timeout long enough for the server's own shutdown, and the hardening options that a Bun process which writes only to its data folder allows, each with a comment that says what it prevents).
2. `deploy/env.example`: every environment variable the server reads (`apps/server/src/config.ts` is the source), with the production value and one line of explanation. `PUBLIC_TIME_DIVISOR` must be absent in production; say so.
3. `deploy/Caddyfile`: the site with a placeholder domain, a reverse proxy to the local port that does not buffer the event stream (`/api/arenas/*/events` is `text/event-stream`), and the client address handled correctly behind Cloudflare. This last point decides whether the sign-in rate limits work: the server takes the first `X-Forwarded-For` entry when `TRUST_PROXY=1` (`apps/server/src/auth/request.ts`). Behind Cloudflare and Caddy that entry must be the visitor's address and must not be forgeable. Work out the exact configuration from Caddy's and Cloudflare's current documentation (trusted proxies with Cloudflare's published address ranges, and a firewall that lets only Cloudflare reach ports 80 and 443), and write in the runbook how to check it on the live server.
4. `deploy/ecosystem.config.cjs`: the pm2 alternative.
5. `deploy/release.sh`: run on the server with a source folder or archive as its argument. It makes a new release folder, runs `bun install --frozen-lockfile` and `bun run build` there, switches `current`, restarts the service, and waits until `GET /api/health` answers 200; when it does not, it switches back and says so. It keeps the newest 5 releases. `set -euo pipefail`, no `rm -rf` on a variable that can be empty, every step prints what it does.
6. `deploy/backup.sh` with `deploy/algotank-backup.service` and `.timer`: a daily archive of `/var/lib/algotank` to a backup folder, 14 kept. The server writes its files atomically, so a copy during play is consistent per file; say what can still be inconsistent between files.
7. `docs/deployment/`: one file per section, in plain numbered steps with copy-paste commands (follow `~/.claude/skills/ste100/SKILL.md` for procedure text): 1 overview with a small diagram (visitor, Cloudflare, Caddy, Bun, disk); 2 first deploy on a fresh Ubuntu LTS server (user, Bun, Caddy, firewall, files, service, first start, checks); 3 Cloudflare settings (DNS record proxied, TLS mode, a cache rule that bypasses `/api/*`, what must stay off because it would break the stream or the page, and that the proxy closes a silent stream after about 100 s while the server sends a keep-alive every 15 s); 4 update and rollback (deploy when no event runs: a restart ends running rounds and restarts lobby countdowns); 5 backup and restore; 6 monitoring (`/api/health`, `journalctl`, disk); 7 troubleshooting (stream disconnects, sign-in refused for everyone, 502, a damaged data file stops the start with its name); 8 the pm2 alternative; 9 the Cloudflare Tunnel alternative.

## Check in the server code, and fix only when missing

| Check | When missing |
|-------|--------------|
| The process listens on the local interface only, or can be told to | Add a `HOST` variable (default as today) in `config.ts` with a test |
| `SIGTERM` stops the server cleanly (stores flushed, streams closed) within the unit's stop timeout | Report it; fix when small |
| Files with a content hash in their name are served with a long cache lifetime and `index.html` with none | Fix in `static.ts` with a test |
| `COOKIE_SECURE` and `TRUST_PROXY` behave as the README says behind a proxy that sets `X-Forwarded-Proto`, `-Host` and `-For` | Report |
| `/api/health` answers without a session | It exists; use it |

## Limits to state in the runbook

One process, so a restart interrupts play and there is no second instance. Email addresses are not verified and there is no password recovery by email (`auth/reset-password.ts` is the manual way; describe it). Rate-limit counters reset on a restart. An arena without activity for `ARENA_TTL_HOURS` (default 24) is removed with its chat.

## Checks you can run here

This Mac is not the target, so nothing can be proven on Ubuntu. Do what can be done: `bash -n` and `shellcheck` (when installed) on the scripts, a dry run of `release.sh` against a temporary folder with the service commands stubbed, `bun test` and `bun run type-check` when you changed server code. Use documentation lookups for Caddy, systemd and Cloudflare facts and cite the pages in the runbook. Never put the project's name, the owner's name or any address of theirs into a web request.

Never run `bun run build` in the project folder, never use port 8787, never stop the server on it. Other builders are changing `apps/web/**`; do not edit it.

## Report

The common report, plus: each file with one line on what it does; every fact you took from documentation with its source; every step you could not verify on a real server, as a list the owner can tick off at the first deploy; server changes and their tests.
