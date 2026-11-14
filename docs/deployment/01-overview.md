# 1. Overview

This runbook puts the game on one Ubuntu LTS server behind Cloudflare. Nothing in it was tested on a real server yet. Each step that needs a check on the first deploy is in `02-first-deploy.md`, section "Checklist for the first deploy".

## The path of a request

```
visitor (browser)
   |  HTTPS
   v
Cloudflare  ---- DNS, TLS for the visitor, cache of /assets/*, attack protection
   |  HTTPS (Origin CA certificate, mode "Full (strict)")
   |  only Cloudflare's addresses pass the firewall (ports 80, 443)
   v
Caddy on the server (:443)  ---- sets X-Forwarded-For to the visitor's address
   |  HTTP
   v
Bun game server (127.0.0.1:3000)  ---- arenas in memory, a timer per turn, one event stream per player
   |
   v
disk: /var/lib/algotank  ---- accounts, arenas, league, chat, tournament winners
```

## Where the files are on the server

| Path | Holds |
|------|-------|
| `/opt/algotank/releases/<UTC timestamp>/` | One release: the code, `node_modules` and the built client. `deploy/release.sh` keeps the newest 5. |
| `/opt/algotank/current` | A symlink to the release that runs. |
| `/etc/algotank/env` | The server's settings (`deploy/env.example`). |
| `/var/lib/algotank/` | The data. Mode 0700, owner `algotank`. |
| `/var/backups/algotank/` | Daily archives of the data, 14 kept. Mode 0700, owner root. |
| `/etc/caddy/Caddyfile` | The proxy (`deploy/Caddyfile`). |
| `/etc/caddy/origin-cert.pem`, `/etc/caddy/origin-key.pem` | The Cloudflare Origin CA certificate and its key. |
| `/etc/systemd/system/algotank.service` | The service (`deploy/algotank.service`). |
| `/usr/local/sbin/algotank-release`, `/usr/local/sbin/algotank-backup` | `deploy/release.sh` and `deploy/backup.sh`. |

## Files in `deploy/`

| File | What it does |
|------|--------------|
| `algotank.service` | Runs the server as the user `algotank` under systemd, restarts it when it stops, and limits what it can touch. |
| `env.example` | Every setting the server reads, with the production value. |
| `Caddyfile` | The site, the client address behind Cloudflare, and the proxy to the server. |
| `release.sh` | Packs a release on your computer, and installs, starts and checks a release on the server. A failed health check switches back. |
| `backup.sh`, `algotank-backup.service`, `algotank-backup.timer` | A daily archive of the data folder. |
| `ecosystem.config.cjs` | The pm2 alternative to the systemd unit (`08-pm2.md`). |

## The sections of this runbook

1. Overview (this file)
2. `02-first-deploy.md`: first deploy on a fresh server
3. `03-cloudflare.md`: Cloudflare settings
4. `04-update-and-rollback.md`: update and rollback
5. `05-backup-and-restore.md`: backup and restore
6. `06-monitoring.md`: monitoring
7. `07-troubleshooting.md`: troubleshooting, and the password reset
8. `08-pm2.md`: pm2 in place of systemd
9. `09-cloudflare-tunnel.md`: a Cloudflare Tunnel in place of open ports

## Limits

- One process runs the game. A restart interrupts play: a running round counts for nothing and starts again, and lobby countdowns start again. There is no second instance to take over.
- Two servers must not use one data folder.
- Without mail settings, email addresses are not verified and there is no password recovery by email. Then the person who runs the server resets a password with a script (`07-troubleshooting.md`, "A player forgot the password"). With mail settings, the server sends a code that verifies an email address and a code that sets a new password (`10-mail.md`).
- The rate-limit counters (sign-in, registration, seats, joins, email codes) are in memory, so a restart sets them to zero.
- A private or presenter arena without activity for `ARENA_TTL_HOURS` (default 24) is removed with its chat.
- Cloudflare's address ranges are written into `/etc/caddy/Caddyfile` and into the firewall. When Cloudflare adds a range, the firewall blocks Cloudflare's servers in that range. Add each new range to the Caddyfile and to the firewall (`06-monitoring.md`).
