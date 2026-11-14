# 4. Update and rollback

An update makes a new folder in `/opt/algotank/releases/`, builds it there, and points `/opt/algotank/current` at it. The old folders stay, so a rollback points the symlink back. `deploy/release.sh` does all of it and keeps the newest 5 releases.

## Before an update

A restart interrupts play. A running round counts for nothing and starts again, and lobby countdowns start again. The rate-limit counters go back to zero. Players' pages connect again by themselves.

1. Choose a time when no event runs. Ask the people who run presenter arenas, because the server does not show private and presenter games from outside.

2. Look at the public arenas. Do not update while `tournament.phase` is `running` or `break`, because a tournament is then in progress.

   ```sh
   curl -s https://game.example.com/api/public
   ```

## Update

On your computer:

1. Pack the release.

   ```sh
   bash deploy/release.sh --pack ~/algotank-release.tar.gz
   ```

2. Copy the archive to the server.

   ```sh
   scp ~/algotank-release.tar.gz ubuntu@203.0.113.10:/tmp/
   ```

On the server:

3. If `deploy/release.sh`, `deploy/backup.sh` or a unit file changed in this release, install them again first. Do steps 3 to 5 of `02-first-deploy.md`, section D.

4. Install the release.

   ```sh
   sudo algotank-release /tmp/algotank-release.tar.gz
   ```

5. Read the last line of the output.

   | Last line | Meaning | Next step |
   |-----------|---------|-----------|
   | `==> Release <timestamp> is live.` | The new release answers the health check. | Do step 6. |
   | `ERROR: bun install failed ...` or `ERROR: The build failed ...` | The old release still runs. | Fix the cause on your computer, then pack again. |
   | `ERROR: Switched back to <timestamp>, which answers again ...` | The new release did not start. The old release runs again. | Read `sudo journalctl -u algotank -n 100`. |
   | `ERROR: ... does not answer either ...` | Neither release answers. | Read `07-troubleshooting.md`. |

6. Remove the archive.

   ```sh
   rm /tmp/algotank-release.tar.gz
   ```

## Rollback by hand

Do this when a release starts but does not work correctly.

1. Show the releases and the one that runs.

   ```sh
   ls /opt/algotank/releases && readlink /opt/algotank/current
   ```

2. Point `current` at the older release. Use a folder name from step 1 in place of `20261112T030000Z`.

   ```sh
   sudo ln -sfn /opt/algotank/releases/20261112T030000Z /opt/algotank/current
   ```

3. Restart the service.

   ```sh
   sudo systemctl restart algotank
   ```

4. Make sure that the server answers.

   ```sh
   curl -fsS http://127.0.0.1:3000/api/health
   ```

> **CAUTION:** A newer release can add tables to the database. An older release then refuses to start, and the log says that the database has a schema version that this version of AlgoTank does not know. Restore the backup from before the update (`05-backup-and-restore.md`). Make a backup before each update ("Make a backup now" in that file).

## What `release.sh` does

1. It makes `/opt/algotank/releases/<UTC timestamp>/` and unpacks the archive (or copies the source folder) into it.
2. It runs `bun install --frozen-lockfile` and `bun run build` in that folder. If either fails, it stops, and the old release keeps running.
3. It points `/opt/algotank/current` at the new folder and runs `systemctl restart algotank`.
4. It asks `http://127.0.0.1:<PORT>/api/health` once a second, up to 30 times. `PORT` and `HOST` come from `/etc/algotank/env`.
5. If the health check passes, it removes the oldest releases until 5 are left. It never removes the release that runs or the one before it.
6. If the health check fails, it points `current` back at the previous release, restarts the service, and checks again.

A release that failed stays in `/opt/algotank/releases/` and counts toward the 5.
