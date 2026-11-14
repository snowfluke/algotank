# 6. Monitoring

## Health check

`GET /api/health` answers `{"ok":true,"startedAt":"<ISO time>","arenas":<count>}` without a session. It reads no file, so a slow disk does not fail it. `startedAt` changes at each restart, so a new value that you did not cause shows a crash and a restart by systemd.

1. Point an uptime monitor at `https://game.example.com/api/health`. Let it alert you when the status is not 200. This checks Cloudflare, Caddy and the game server together.

2. To check the game server alone, run this on the server.

   ```sh
   curl -fsS http://127.0.0.1:3000/api/health
   ```

## Server health (`/metrics`)

`GET /metrics` gives the server's health in the Prometheus text format. It answers only when `METRICS_TOKEN` is set in `/etc/algotank/env`, and only to a request with that token. Without the setting, the route does not exist.

1. Read the values once on the server. Use your token in place of `TOKEN`.

   ```sh
   curl -fsS -H "Authorization: Bearer TOKEN" http://127.0.0.1:3000/metrics
   ```

2. Read the result with this table. A value with `_total` counts up from the last start.

   | Name | Value |
   |------|-------|
   | `algotank_uptime_seconds` | Seconds since the server started |
   | `algotank_memory_rss_bytes`, `algotank_memory_heap_used_bytes` | Memory of the process, and the part of it that JavaScript uses |
   | `algotank_open_streams` | Open event streams of arenas and leagues |
   | `algotank_arenas{kind}`, `algotank_rounds_running` | Arenas by kind, and arena rounds that run now |
   | `algotank_turn_compute_milliseconds{loop}` | Histogram: the time to compute one turn (`arena`: one round; `league`: every league) |
   | `algotank_turn_late_milliseconds{loop}` | Histogram: how much later than planned a turn's timer fired |
   | `algotank_requests_total{group,status}` | Answers by route group and status class, for example `group="arenas",status="5xx"` |
   | `algotank_errors_total{where}` | Errors that the server caught and wrote to the log (`request`, `round`, `league`, `stats`). `stats` counts a failure of the players' statistics, after which the round goes on. |
   | `algotank_emails_total{result}` | Emails sent and failed |
   | `algotank_rate_limited_total` | Requests refused with 429 |
   | `algotank_league_seats`, `algotank_leagues` | Tanks and leagues of the monthly league |
   | `algotank_league_checkpoint_age_seconds` | Seconds since the league's checkpoint was written. It must stay below about 120. |

3. To collect the values over time, add this job to the Prometheus configuration of your monitor. Put the token in the file that `credentials_file` names, and make that file readable by Prometheus only.

   ```yaml
   scrape_configs:
     - job_name: algotank
       scrape_interval: 30s
       authorization:
         type: Bearer
         credentials_file: /etc/prometheus/algotank-token
       static_configs:
         - targets: ["127.0.0.1:3000"]
   ```

   Note: a monitor on another machine must use `https://game.example.com` with `scheme: https`, because the server listens on 127.0.0.1 only.

4. Add these three alerts. They tell you that the process stopped, that turns fire late, and that memory grows.

   ```yaml
   groups:
     - name: algotank
       rules:
         - alert: AlgoTankDown
           expr: up{job="algotank"} == 0
           for: 2m
         - alert: AlgoTankTurnsLate
           # More than 1 turn in 10 fired 250 ms or more late over 10 minutes.
           expr: |
             1 - (sum(rate(algotank_turn_late_milliseconds_bucket{le="250"}[10m]))
                  / sum(rate(algotank_turn_late_milliseconds_count[10m]))) > 0.1
           for: 10m
         - alert: AlgoTankMemoryGrows
           # The memory grew by more than 200 MB in 6 hours and is above 800 MB.
           expr: delta(algotank_memory_rss_bytes[6h]) > 200e6 and algotank_memory_rss_bytes > 800e6
           for: 30m
   ```

## Usage numbers

The accounts in `ADMIN_EMAILS` see the usage numbers on `https://game.example.com/admin/metrics`: today against yesterday, the last 30 days, and how far new devices get on their first visit. The day files are in `/var/lib/algotank/metrics/`, one per day, and the server removes a file after 400 days. `PRIVACY.md` says what is counted.

## Logs

1. Show the game server's log as it grows. Push Ctrl-C to stop.

   ```sh
   sudo journalctl -u algotank -f
   ```

2. Show the log since the last start of the service.

   ```sh
   sudo journalctl -u algotank -b --no-pager | tail -n 100
   ```

3. Show the last requests through Caddy. `client_ip` is the address that the game server receives, and `status` is the answer.

   ```sh
   sudo journalctl -u caddy -n 20 -o cat
   ```

   Note: Caddy writes one line per request, with the visitor's address. Delete the journal when your privacy rules require it.

4. Show how many restarts systemd made.

   ```sh
   systemctl show algotank -p NRestarts
   ```

## Disk

1. Show the free space for the data and the backups.

   ```sh
   df -h /var/lib/algotank /var/backups/algotank
   ```

2. Show the size of the data, the backups and the releases.

   ```sh
   sudo du -sh /var/lib/algotank /var/backups/algotank /opt/algotank/releases
   ```

3. Show the size of the journal.

   ```sh
   journalctl --disk-usage
   ```

## Cloudflare address ranges (once a month)

Cloudflare's ranges are written into `/etc/caddy/Caddyfile` and into the firewall. Compare them with Cloudflare's lists once a month.

1. Compare the Caddyfile with Cloudflare's lists.

   ```sh
   { curl -fsSL https://www.cloudflare.com/ips-v4; echo; curl -fsSL https://www.cloudflare.com/ips-v6; echo; } | grep / | sort > /tmp/cloudflare-now.txt
   grep trusted_proxies /etc/caddy/Caddyfile | tr ' \t' '\n\n' | grep / | sort > /tmp/cloudflare-caddy.txt
   diff /tmp/cloudflare-caddy.txt /tmp/cloudflare-now.txt && echo "Caddyfile ranges are current"
   ```

2. If `diff` shows a difference, change the `trusted_proxies` line in `/etc/caddy/Caddyfile` and in `deploy/Caddyfile` to the list in `/tmp/cloudflare-now.txt`. Then run `sudo -u caddy caddy validate --config /etc/caddy/Caddyfile` and `sudo systemctl reload caddy`.

3. If `diff` showed a difference, add a firewall rule for each new range. Use the new range in place of `198.51.100.0/24`.

   ```sh
   sudo ufw allow proto tcp from 198.51.100.0/24 to any port 80,443 comment cloudflare
   ```

4. Remove the two temporary files.

   ```sh
   rm /tmp/cloudflare-now.txt /tmp/cloudflare-caddy.txt
   ```
