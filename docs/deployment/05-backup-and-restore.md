# 5. Backup and restore

`algotank-backup.timer` runs `/usr/local/sbin/algotank-backup` (`deploy/backup.sh`) every day at 03:00 server time, with up to 15 minutes of random delay. The script runs as the user `algotank`. It calls the backup command of the current release, compresses the copy to `/var/backups/algotank/algotank-<UTC timestamp>.sqlite.gz`, and keeps the newest 14 copies. A backup that was missed while the server was off runs at the next start ([systemd.timer](https://www.freedesktop.org/software/systemd/man/latest/systemd.timer.html), `Persistent=`).

The copy holds the whole database `/var/lib/algotank/algotank.sqlite`: accounts with password hashes and sessions, arenas with player tokens, play styles, "My tank", the league, the champions, the tournament winners, the results and the chats. Keep each copy as private as the server. The copy has mode 0600.

## The backup command

The backup command writes a copy of the database to a new file. It is safe while the game runs, because SQLite writes the copy of one moment (`VACUUM INTO`). The target file must not exist.

```sh
cd /opt/algotank/current && sudo -u algotank env DATA_DIR=/var/lib/algotank BUN_RUNTIME_TRANSPILER_CACHE_PATH=0 /usr/local/bin/bun run backup /var/backups/algotank/manual.sqlite
```

> **WARNING:** Do not copy or archive the data folder of a running server with `cp`, `tar` or `rsync`. The database is in WAL mode: the last writes can be only in the `algotank.sqlite-wal` file, and a copy taken during a write can hold half of it. Such a copy can lose data or fail to open. Use the backup command.

## What a backup can miss

The copy is one moment of the database, so all its tables agree. The server keeps some changes in memory before it writes them, so the copy does not have them:

- Up to one second of play-style, look and bot-fill edits in an arena.
- Up to one minute of the league's points and statistics of the day (the checkpoint).
- The usage numbers of up to one minute.

## Check the backups

1. Show when the timer runs next and when it ran last.

   ```sh
   systemctl list-timers algotank-backup.timer --no-pager
   ```

2. Show the output of the last runs.

   ```sh
   sudo journalctl -u algotank-backup -n 20 --no-pager
   ```

3. Show the copies.

   ```sh
   sudo ls -lh /var/backups/algotank
   ```

## Make a backup now

1. Start the backup.

   ```sh
   sudo systemctl start algotank-backup.service
   ```

2. Read the result. The last line is `==> Backup algotank-<timestamp>.sqlite.gz is done (<size>).`

   ```sh
   sudo journalctl -u algotank-backup -n 10 --no-pager
   ```

The game keeps running during the backup.

## Copy the backups off the server

A backup on the same disk is lost with the disk. Copy the backups to another machine regularly.

On your computer:

1. Copy the backups from the server. The server user needs read access, so this command runs `sudo tar` on the server. `tar` is safe here, because each copy is a finished file that nothing writes to.

   ```sh
   mkdir -p ~/algotank-backups && ssh ubuntu@203.0.113.10 'sudo tar -C /var/backups -cf - algotank' | tar -C ~/algotank-backups -xf -
   ```

## Restore

> **WARNING:** A restore replaces all data. Accounts, games and chats from after the backup are lost.

1. Show the copies, and choose one. Use its name in place of `algotank-20261112T030000Z.sqlite.gz`.

   ```sh
   sudo ls /var/backups/algotank
   ```

2. Stop the game.

   ```sh
   sudo systemctl stop algotank
   ```

3. Move the current database and its `-wal` and `-shm` files aside. Do not delete them until the restored server works.

   ```sh
   sudo install -d -m 0700 /var/lib/algotank.before-restore && sudo sh -c 'mv /var/lib/algotank/algotank.sqlite* /var/lib/algotank.before-restore/'
   ```

4. Unpack the copy into the data folder as `algotank.sqlite`, owned by the user `algotank`, with mode 0600.

   ```sh
   sudo sh -c 'gunzip -c /var/backups/algotank/algotank-20261112T030000Z.sqlite.gz > /var/lib/algotank/algotank.sqlite' && sudo chown algotank:algotank /var/lib/algotank/algotank.sqlite && sudo chmod 0600 /var/lib/algotank/algotank.sqlite
   ```

5. Start the game.

   ```sh
   sudo systemctl start algotank
   ```

6. Make sure that the server answers.

   ```sh
   curl -fsS http://127.0.0.1:3000/api/health
   ```

7. When the game works, delete the old database.

   ```sh
   sudo rm -r /var/lib/algotank.before-restore
   ```
