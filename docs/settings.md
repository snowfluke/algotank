# Server settings

The server reads these environment variables once at start (`apps/server/src/config.ts`). A value that is not valid stops the start with a message that names the variable. `deploy/env.example` holds the production values.

| Variable | Meaning | Default |
|----------|---------|---------|
| `PORT` | The port of the server. | 8787 |
| `HOST` | The address the server listens on, for example `127.0.0.1` behind a proxy on the same machine. | every interface |
| `DATA_DIR` | The folder of the database `algotank.sqlite`, which holds everything the server keeps. `PRIVACY.md` lists what each table holds and for how long. Back it up with `bun run backup <target file>` (`docs/deployment/05-backup-and-restore.md`), not with a copy of the folder. | `./data`, from the folder the server starts in |
| `STATIC_DIR` | The folder with the built web client. Set it to serve another build, for example one made with `vite build --outDir`. | `apps/web/dist` |
| `COOKIE_SECURE` | `1` sends the sign-in cookie over HTTPS only. Turn it on in production. | off |
| `TRUST_PROXY` | `1` reads the client address from the first `X-Forwarded-For` entry and the host from `X-Forwarded-Host`. Turn it on only behind a proxy that replaces `X-Forwarded-For` with the visitor's address and sets `X-Forwarded-Host` (`deploy/Caddyfile`), because otherwise a client can choose its address and pass the per-address limits. | off |
| `ARENA_TTL_HOURS` | A private or presenter arena with no activity for this many hours is removed. A number above 0; fractions are allowed. | 24 |
| `PUBLIC_ARENA_MAX` | The most practice arenas the server keeps at once. A whole number of at least 1. | 20 |
| `LEAGUE_TIME_ZONE` | The time zone whose calendar days and months the monthly league follows, as an IANA name such as `Europe/Berlin`. The server checks it at start. | `Asia/Jakarta` |
| `SMTP_HOST` | The mail server for the verification and password-reset codes, for example `smtp.gmail.com`. Without it the server sends no email: accounts stay unverified, the server refuses to create an arena for players with a verified email, and the operator resets a forgotten password with `apps/server/scripts/reset-password.ts`. | not set |
| `SMTP_PORT` | `465` (TLS from the start) or a port that offers STARTTLS, such as `587`. | 465 |
| `SMTP_USER` | The login at the mail server. Set it together with `SMTP_PASS`, or neither. | not set |
| `SMTP_PASS` | Its password. For Gmail, an app password (`docs/deployment/10-mail.md`). A Gmail account sends about 500 emails a day. | not set |
| `MAIL_FROM` | The sender: a name and the sender's address in angle brackets, as `AlgoTank <...>`. Required with `SMTP_HOST`. | not set |
| `PUBLIC_TIME_DIVISOR` | For scripted runs only. Divides the public arenas' turn length (down to 100 ms) and their countdowns, breaks and result times by this whole number from 1 to 9. It divides the monthly league's turn too, but not its day. | 1 |
| `ADMIN_EMAILS` | Comma-separated emails of the accounts that may open `/admin/metrics`, the usage numbers. With `SMTP_HOST` set, the email must also be verified. Without email, whoever registers the address first is the admin, so register it before you share the site. | not set: nobody |
| `METRICS_TOKEN` | The bearer token of `GET /metrics`, the server health in the Prometheus text format (`docs/deployment/06-monitoring.md`). At least 16 characters, no spaces. | not set: the route does not exist |
| `LEAGUE_SHORT_DAYS` | For scripted runs only. `<ISO time>/<seconds per day>/<days per month>`, for example `2026-11-14T10:00:00Z/120/3`: from that moment the league's days last that many seconds and a month has that many days, so a day close and a month close happen within minutes. | not set |

Two server processes must not share one `DATA_DIR`. Each holds the arenas and the league in memory and overwrites the other's changes. The reset-password tool and the backup command may run while the server runs.
