# 2. First deploy on a fresh Ubuntu LTS server

## Placeholders

Replace each placeholder in this runbook and in `deploy/` with your own value.

| Placeholder | Meaning |
|-------------|---------|
| `game.example.com` | The domain of the game. It is in `deploy/Caddyfile` and in the commands. |
| `203.0.113.10` | The public IPv4 address of the server. |
| `ubuntu` | The user name that your server provider gave you for SSH. |
| `3000` | The port of the game server on the server. Change it in `/etc/algotank/env` and in `/etc/caddy/Caddyfile` together. |
| `Asia/Jakarta` | `LEAGUE_TIME_ZONE` in `/etc/algotank/env`, the calendar of the monthly league. |
| `20261112T030000Z` | The name of a release folder in `/opt/algotank/releases/`. |
| `player@example.com` | The email address of a player account. |
| `play.your-domain.org` | Your real domain, in the command that replaces `game.example.com` in the Caddyfile. |
| `ABC123` | The 6-letter code of an arena. |
| `algotank-data-20261112T030000Z.tar.gz` | The name of a backup archive in `/var/backups/algotank/`. |
| `/var/lib/algotank/arenas/ABC123.json` | The path of a damaged data file, as the log names it. |
| `198.51.100.0/24` | A new Cloudflare address range. |
| `6ff42ae2-765d-4adf-8112-31c55c1551ef` | The ID of a Cloudflare Tunnel (`09-cloudflare-tunnel.md`). |

The addresses `203.0.113.99`, `203.0.113.1` to `203.0.113.11` and `198.51.100.x` in the checks are false addresses on purpose. Do not replace them.

## Before you start

You need:

- A server with Ubuntu LTS, a public IPv4 address and SSH access with sudo.
- A domain whose DNS is at Cloudflare.
- The project folder on your computer, with Bun installed there.

Run the commands in "On your computer" sections in the project folder on your computer. Run all other commands on the server.

## A. Prepare the server

1. Connect to the server.

   ```sh
   ssh ubuntu@203.0.113.10
   ```

2. Install the updates.

   ```sh
   sudo apt update && sudo apt upgrade -y
   ```

3. Install the tools that the next steps use.

   ```sh
   sudo apt install -y curl unzip ufw debian-keyring debian-archive-keyring apt-transport-https
   ```

4. Make the system user `algotank`. The user has no home folder and cannot log in.

   ```sh
   sudo useradd --system --home-dir /nonexistent --no-create-home --shell /usr/sbin/nologin algotank
   ```

5. Install Bun 1.4.2 into `/usr/local/bin`. The install script puts Bun into `$BUN_INSTALL/bin` ([install script](https://bun.com/install), line `install_dir=${!install_env:-$HOME/.bun}`).

   ```sh
   curl -fsSL https://bun.com/install | sudo env BUN_INSTALL=/usr/local bash -s "bun-v1.4.2"
   ```

6. Make sure that Bun runs.

   ```sh
   /usr/local/bin/bun --version
   ```

   The result is `1.4.2`.

7. Install Caddy from its Debian repository ([Caddy install](https://caddyserver.com/docs/install)).

   ```sh
   curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
   curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
   sudo chmod o+r /usr/share/keyrings/caddy-stable-archive-keyring.gpg
   sudo chmod o+r /etc/apt/sources.list.d/caddy-stable.list
   sudo apt update && sudo apt install -y caddy
   ```

   The package starts Caddy as the systemd service `caddy`, which reads `/etc/caddy/Caddyfile` ([Running Caddy](https://caddyserver.com/docs/running)).

## B. Set the firewall

The firewall lets SSH in from everywhere, and ports 80 and 443 only from Cloudflare. A visitor then cannot go around Cloudflare.

> **WARNING:** Add the SSH rule before you enable the firewall. If you do not, the firewall disconnects you and you cannot connect again.

1. Allow SSH.

   ```sh
   sudo ufw allow OpenSSH
   ```

2. Allow ports 80 and 443 from each Cloudflare address range ([IPv4 list](https://www.cloudflare.com/ips-v4), [IPv6 list](https://www.cloudflare.com/ips-v6)).

   ```sh
   for range in $( { curl -fsSL https://www.cloudflare.com/ips-v4; echo; curl -fsSL https://www.cloudflare.com/ips-v6; echo; } | grep / ); do
     sudo ufw allow proto tcp from "$range" to any port 80,443 comment cloudflare
   done
   ```

3. Block all other incoming connections, and enable the firewall.

   ```sh
   sudo ufw default deny incoming
   sudo ufw enable
   ```

4. Show the rules. Make sure that the list has the OpenSSH rule and 22 Cloudflare rules for IPv4 and IPv6 together (15 IPv4 and 7 IPv6 ranges on 2026-11-12).

   ```sh
   sudo ufw status numbered
   ```

5. If your server provider has its own firewall in its control panel, open ports 22, 80 and 443 there too.

## C. Make the folders

1. Make the folders for the releases, the settings and the backups.

   ```sh
   sudo install -d -m 0755 /opt/algotank /opt/algotank/releases
   sudo install -d -m 0750 -o root -g algotank /etc/algotank
   sudo install -d -m 0700 /var/backups/algotank
   ```

   systemd makes the data folder `/var/lib/algotank` at the first start (`StateDirectory=algotank`).

## D. Copy the release to the server

On your computer:

1. Pack the release. The archive has the source only, without `node_modules`, the built client and the data.

   ```sh
   bash deploy/release.sh --pack ~/algotank-release.tar.gz
   ```

2. Copy the archive to the server.

   ```sh
   scp ~/algotank-release.tar.gz ubuntu@203.0.113.10:/tmp/
   ```

On the server:

3. Unpack the `deploy/` folder from the archive.

   ```sh
   mkdir -p /tmp/algotank-deploy && tar -xzf /tmp/algotank-release.tar.gz -C /tmp/algotank-deploy deploy
   ```

4. Install the two scripts.

   ```sh
   sudo install -m 0755 /tmp/algotank-deploy/deploy/release.sh /usr/local/sbin/algotank-release
   sudo install -m 0755 /tmp/algotank-deploy/deploy/backup.sh /usr/local/sbin/algotank-backup
   ```

5. Install the three systemd units.

   ```sh
   sudo install -m 0644 /tmp/algotank-deploy/deploy/algotank.service /tmp/algotank-deploy/deploy/algotank-backup.service /tmp/algotank-deploy/deploy/algotank-backup.timer /etc/systemd/system/
   sudo systemctl daemon-reload
   ```

6. Install the settings. The file is readable by root and by the group `algotank` only.

   ```sh
   sudo install -m 0640 -o root -g algotank /tmp/algotank-deploy/deploy/env.example /etc/algotank/env
   ```

7. Open the settings and change `LEAGUE_TIME_ZONE` if the league must follow another time zone. Do not add `PUBLIC_TIME_DIVISOR`.

   ```sh
   sudo nano /etc/algotank/env
   ```

## E. Set up Cloudflare and the origin certificate

1. Do steps 1 to 4 of `03-cloudflare.md`. Step 3 gives you a certificate and a private key.

2. Write the certificate into `/etc/caddy/origin-cert.pem`. Paste the certificate, then push Ctrl-D.

   ```sh
   sudo tee /etc/caddy/origin-cert.pem >/dev/null
   ```

3. Write the private key into `/etc/caddy/origin-key.pem`. Paste the key, then push Ctrl-D.

   ```sh
   sudo tee /etc/caddy/origin-key.pem >/dev/null
   ```

4. Let only root and the user `caddy` read the two files.

   ```sh
   sudo chown root:caddy /etc/caddy/origin-cert.pem /etc/caddy/origin-key.pem
   sudo chmod 0640 /etc/caddy/origin-cert.pem /etc/caddy/origin-key.pem
   ```

## F. Set up Caddy

1. Install the Caddyfile.

   ```sh
   sudo install -m 0644 /tmp/algotank-deploy/deploy/Caddyfile /etc/caddy/Caddyfile
   ```

2. Replace `game.example.com` with your domain. Change `play.your-domain.org` in this command to your domain.

   ```sh
   sudo sed -i 's/game\.example\.com/play.your-domain.org/' /etc/caddy/Caddyfile
   ```

3. Check the file as the user `caddy`, which can read the key.

   ```sh
   sudo -u caddy caddy validate --config /etc/caddy/Caddyfile
   ```

   The last line is `Valid configuration`.

4. Load the file.

   ```sh
   sudo systemctl reload caddy
   ```

## G. Start the game

1. Enable the service, so that it starts when the server starts.

   ```sh
   sudo systemctl enable algotank
   ```

2. Install the first release. The script installs the dependencies, builds the client, starts the service and waits for the health check.

   ```sh
   sudo algotank-release /tmp/algotank-release.tar.gz
   ```

   The last line is `==> Release <timestamp> is live.`

3. Enable the daily backup.

   ```sh
   sudo systemctl enable --now algotank-backup.timer
   ```

4. Remove the copies in `/tmp`.

   ```sh
   rm -r /tmp/algotank-deploy && rm /tmp/algotank-release.tar.gz
   ```

## H. Do the checks

1. Make sure that the service runs.

   ```sh
   systemctl status algotank --no-pager
   ```

   The status is `active (running)`.

2. Make sure that the server listens on the local interface only.

   ```sh
   sudo ss -ltnp | grep ':3000'
   ```

   The address is `127.0.0.1:3000`, not `0.0.0.0:3000` or `*:3000`.

3. Make sure that the server answers on the server.

   ```sh
   curl -fsS http://127.0.0.1:3000/api/health
   ```

   The answer starts with `{"ok":true`.

On your computer:

4. Make sure that the site answers through Cloudflare.

   ```sh
   curl -sS https://game.example.com/api/health
   curl -sSI https://game.example.com/ | head -n 1
   ```

   The first answer starts with `{"ok":true`. The second line has the status 200.

5. Make sure that a direct connection to the server does not get through the firewall.

   ```sh
   curl -sk --connect-timeout 5 --resolve game.example.com:443:203.0.113.10 https://game.example.com/api/health
   ```

   The command stops after 5 seconds with a timeout and shows nothing.

6. Open `https://game.example.com/` in a browser, press "Play now", and make sure that the tanks move. The tanks move only when the event stream works.

### Check the visitor's address

The sign-in limits count attempts per visitor address. These steps make sure that the address that the game server reads is the visitor's real address, and that a visitor cannot choose it.

On your computer:

7. Show the address that Cloudflare sees for you, in the `ip=` line of Cloudflare's trace page ([/cdn-cgi/ endpoint](https://developers.cloudflare.com/fundamentals/reference/cdn-cgi-endpoint/)). Write it down.

   ```sh
   curl -s https://game.example.com/cdn-cgi/trace | grep '^ip='
   ```

8. Send a request with a false address in both headers.

   ```sh
   curl -s -H 'X-Forwarded-For: 203.0.113.99' -H 'CF-Connecting-IP: 203.0.113.99' https://game.example.com/api/health
   ```

On the server:

9. Show the address that Caddy gave to the game server for the last requests.

   ```sh
   sudo journalctl -u caddy -n 20 -o cat | grep -o '"client_ip":"[^"]*"'
   ```

   Each value is the address from step 7. If a value is `203.0.113.99`, stop: the rate limits do not work. Read `07-troubleshooting.md`, "Sign-in is refused for everyone".

On your computer:

> **CAUTION:** The next step blocks sign-in from your own address for 15 minutes.

10. Send 11 failed sign-ins, each with a different false address.

    ```sh
    for i in $(seq 1 11); do
      curl -s -o /dev/null -w '%{http_code} ' -X POST -H 'content-type: application/json' \
        -H "X-Forwarded-For: 203.0.113.$i" -H "CF-Connecting-IP: 203.0.113.$i" \
        -d "{\"email\":\"check$i@example.com\",\"password\":\"wrong-password-$i\"}" \
        https://game.example.com/api/auth/login
    done; echo
    ```

    The result is ten times `401` and then `429`. The server allows 10 sign-ins per address in 15 minutes, so the 11th is refused when the false addresses are ignored.

## Checklist for the first deploy

Nothing in this runbook was tested on a real server. Tick each item when it works.

- [ ] Bun installs into `/usr/local/bin/bun` with `BUN_INSTALL=/usr/local` (step A5).
- [ ] The Caddy repository commands work on your Ubuntu version (step A7).
- [ ] The ufw loop adds 22 rules, and SSH still works after `ufw enable` (section B).
- [ ] `sudo -u caddy caddy validate` accepts the Caddyfile with your certificate files (step F3).
- [ ] `bun install --frozen-lockfile` and `bun run build` succeed as root in the release folder (step G2).
- [ ] The service starts with every hardening line in `algotank.service`. If it does not, the journal names the error (`07-troubleshooting.md`).
- [ ] Bun runs without its transpiler cache and with `ProtectHome=yes` (no write error in `journalctl -u algotank`).
- [ ] The server listens on `127.0.0.1:3000` only (step H2).
- [ ] The site answers through Cloudflare with the Origin CA certificate in "Full (strict)" mode (step H4).
- [ ] A direct connection to `203.0.113.10` times out (step H5).
- [ ] The event stream delivers turns at once through Cloudflare and Caddy (step H6).
- [ ] A stream stays open for more than 2 minutes without events. Run `curl -N https://game.example.com/api/arenas/ABC123/events` with a lobby's code. It prints `: keep-alive` every 15 s.
- [ ] Cloudflare replaces a `CF-Connecting-IP` header that the visitor sends (step H9).
- [ ] The sign-in limit triggers on the 11th attempt with false addresses (step H10).
- [ ] `sudo systemctl stop algotank` ends within a few seconds, and `journalctl -u algotank` shows no SIGKILL.
- [ ] `sudo systemctl start algotank-backup.service` writes an archive into `/var/backups/algotank` (`05-backup-and-restore.md`).
- [ ] A second release with `sudo algotank-release` switches and keeps the old folder (`04-update-and-rollback.md`).
- [ ] The sign-in cookie has `Secure` in the browser's developer tools after a sign-in.
