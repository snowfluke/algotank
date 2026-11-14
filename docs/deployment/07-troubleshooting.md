# 7. Troubleshooting

## The event stream disconnects, or turns arrive in bursts

The game shows a connection message, or the tanks stop and then jump.

1. Watch one stream through Cloudflare. Use the 6-letter code of an arena in place of `ABC123`.

   ```sh
   curl -sN https://game.example.com/api/arenas/ABC123/events
   ```

2. Read the result.

   | What you see | Cause | Fix |
   |--------------|-------|-----|
   | `: keep-alive` every 15 s, and events at once | The path works. | Look at the visitor's network, for example a venue Wi-Fi that closes long connections. |
   | Nothing for a long time, then many events together | Something holds back the stream. | Make sure that `/etc/caddy/Caddyfile` has no `encode` line. Then add the Cloudflare Configuration Rule with response body buffering "None" (`03-cloudflare.md`, "Event streams and timeouts"). |
   | The stream ends after about 100 to 125 s with error 524 | The keep-alive does not arrive. | Run step 1 on the server against `http://127.0.0.1:3000/api/arenas/ABC123/events`. If `: keep-alive` arrives there, the cause is between the server and Cloudflare. |
   | An HTML page | A Cloudflare challenge. | Turn off Bot Fight Mode and I'm Under Attack Mode (`03-cloudflare.md`). |

## Sign-in is refused for everyone

Every sign-in answers "Too many attempts. Wait a moment and try again." (status 429). All visitors share one address in the game server, so one counter fills for everyone.

1. Show the addresses that the game server receives.

   ```sh
   sudo journalctl -u caddy -n 50 -o cat | grep -o '"client_ip":"[^"]*"' | sort | uniq -c
   ```

2. Read the result.

   | What you see | Cause | Fix |
   |--------------|-------|-----|
   | One address of Cloudflare (for example `172.70.x.x`) for everyone | The request came from a Cloudflare range that is not in `trusted_proxies`. | Update the ranges (`06-monitoring.md`, "Cloudflare address ranges"). |
   | `127.0.0.1` for everyone | Something on the server sends the requests, for example a Cloudflare Tunnel without the tunnel Caddyfile. | Use the Caddyfile from `09-cloudflare-tunnel.md`. |
   | Different addresses | Caddy works. | Make sure that `/etc/algotank/env` has `TRUST_PROXY=1`, then run `sudo systemctl restart algotank`. |

## Sign-in works but the player is not signed in

The sign-in answers 200, but the next page asks for a sign-in again.

1. Make sure that the site opens with `https://`. With `COOKIE_SECURE=1`, the browser keeps the cookie for HTTPS only.

2. Make sure that **Always Use HTTPS** is on in Cloudflare (`03-cloudflare.md`, step 4).

## A request answers "This request did not come from this site." (403)

The server compares the `Origin` header with `X-Forwarded-Host`.

1. Make sure that the Caddyfile has `header_up X-Forwarded-Host {host}` (or the domain, behind a tunnel).

2. Make sure that the domain in the browser is the domain in the Caddyfile.

## Cloudflare shows an error page

| Error | Meaning | Check |
|-------|---------|-------|
| 502 | Caddy cannot reach the game server, and Caddy sends this answer. | `systemctl status algotank`. Make sure that `PORT` in `/etc/algotank/env` and the port in the `reverse_proxy` line of the Caddyfile are the same. |
| 521 | Cloudflare cannot connect to the server. | `systemctl status caddy`, and `sudo ufw status` has the Cloudflare rules. |
| 522 | The connection to the server timed out. | The server provider's firewall, and `sudo ufw status`. |
| 525 or 526 | TLS between Cloudflare and Caddy failed. | The certificate files in `/etc/caddy/`, and that the Origin CA certificate names the domain. |
| 524 | The server sent nothing for 125 s. | See "The event stream disconnects". |

The error codes are from [Cloudflare 5xx errors](https://developers.cloudflare.com/support/troubleshooting/http-status-codes/cloudflare-5xx-errors/).

## The game server does not start

1. Show the last lines of the log.

   ```sh
   sudo journalctl -u algotank -n 50 --no-pager
   ```

2. Read the message, and do the fix.

   | Message | Cause | Fix |
   |---------|-------|-----|
   | `The row <key> of the table <table> is not valid` | A row of the database is damaged. The server stops on purpose, so that it does not hide an event or lose accounts. | Do the procedure "Repair damaged data". |
   | `The database has schema version <n>, and this version of AlgoTank knows only up to <m>` | A newer release wrote the database, and an older release runs now. | Start the newer release again, or restore the backup from before the update (`05-backup-and-restore.md`). |
   | `The database /var/lib/algotank/algotank.sqlite cannot be opened` | The file or its folder has the wrong owner or mode, or the disk is full. | Run `sudo ls -l /var/lib/algotank` and `df -h /var/lib/algotank`. The files must belong to `algotank` with mode 0600. |
   | `PORT must ...`, `LEAGUE_TIME_ZONE must ...` or another variable name | A value in `/etc/algotank/env` is wrong. | Correct the value, then run `sudo systemctl restart algotank`. |
   | `Operation not permitted`, `Permission denied` or `Read-only file system` | A hardening line in `algotank.service` blocks Bun. | Do the procedure "Find a blocking hardening line". |
   | `Start request repeated too quickly` | systemd stopped after 5 failed starts in 60 s. | Find the first error higher in the log, fix it, then run `sudo systemctl reset-failed algotank && sudo systemctl start algotank`. |

### Repair damaged data

The database is one file, so there is no single data file to move aside. Restore the last backup (`05-backup-and-restore.md`, "Restore"). The changes after that backup are lost.

> **CAUTION:** Only a person who knows SQL should edit a row. Make a backup first (`05-backup-and-restore.md`, "The backup command"), stop the game, then open the database with `sudo -u algotank sqlite3 /var/lib/algotank/algotank.sqlite`. Correct or delete the row that the log names, by its table and key, and start the game.

### Find a blocking hardening line

1. Open the unit file.

   ```sh
   sudo nano /etc/systemd/system/algotank.service
   ```

2. Put `#` in front of one hardening line. Start with `RestrictAddressFamilies=`, then `ProtectHome=`, then `PrivateDevices=`.

3. Load the unit and start the service.

   ```sh
   sudo systemctl daemon-reload && sudo systemctl restart algotank
   ```

4. If the service now starts, keep the line off, and write it in `deploy/algotank.service` too. If not, do steps 2 and 3 with the next line.

## A player forgot the password

With mail settings, a player sets a new password with "Forgot password" and a code by email (`10-mail.md`). Without mail settings, the game has no password recovery by email, and the person who runs the server sets a new password with `apps/server/scripts/reset-password.ts`. The script ends the account's sessions. It works while the game runs, because the server reads the account from the database on each request.

1. Type the new password. The terminal does not show it.

   ```sh
   read -rs PASSWORD
   ```

2. Set the password. Use the player's email address in place of `player@example.com`.

   ```sh
   cd /opt/algotank/current && printf '%s\n' "$PASSWORD" | sudo -u algotank env DATA_DIR=/var/lib/algotank BUN_RUNTIME_TRANSPILER_CACHE_PATH=0 /usr/local/bin/bun apps/server/scripts/reset-password.ts player@example.com
   ```

   The result is `The password of player@example.com is changed, and <n> session(s) ended.`

3. Remove the password from the shell.

   ```sh
   unset PASSWORD
   ```

4. Give the new password to the player through a private channel.
