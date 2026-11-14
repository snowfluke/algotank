# 5. Backup and restore

`algotank-backup.timer` runs `/usr/local/sbin/algotank-backup` (`deploy/backup.sh`) every day at 03:00 server time, with up to 15 minutes of random delay. The script writes `/var/backups/algotank/algotank-data-<UTC timestamp>.tar.gz` and keeps the newest 14 archives. A backup that was missed while the server was off runs at the next start ([systemd.timer](https://www.freedesktop.org/software/systemd/man/latest/systemd.timer.html), `Persistent=`).

The archive holds all of `/var/lib/algotank`: accounts with password hashes and sessions, arenas with player tokens, play styles, "My tank", the league, the champions, the tournament winners and the chats. Keep each copy as private as the server.

## What a backup can miss

The server writes each file to a temporary name and then renames it, so each file in the archive is whole. The files can still disagree with each other, because the backup reads them one after another while the game runs:

- An arena file and its chat file can come from different seconds.
- A month's league file and `league/champions.json` can disagree at the end of a month.
- An account file and its play style or "My tank" file can disagree.
- The server keeps up to one second of play-style, look and bot-fill edits, and of chat lines, in memory before it writes them, so the archive does not have them.

For a backup in which all files agree, stop the service, run the backup, and start the service again (see "Make a backup now").

## Check the backups

1. Show when the timer runs next and when it ran last.

   ```sh
   systemctl list-timers algotank-backup.timer --no-pager
   ```

2. Show the output of the last runs.

   ```sh
   sudo journalctl -u algotank-backup -n 20 --no-pager
   ```

3. Show the archives.

   ```sh
   sudo ls -lh /var/backups/algotank
   ```

## Make a backup now

1. Start the backup.

   ```sh
   sudo systemctl start algotank-backup.service
   ```

2. Read the result. The last line is `==> Backup algotank-data-<timestamp>.tar.gz is done (<size>).`

   ```sh
   sudo journalctl -u algotank-backup -n 10 --no-pager
   ```

For a backup in which all files agree, stop the game first and start it after the backup. This interrupts play.

```sh
sudo systemctl stop algotank && sudo systemctl start algotank-backup.service && sudo systemctl start algotank
```

## Copy the backups off the server

A backup on the same disk is lost with the disk. Copy the archives to another machine regularly.

On your computer:

1. Copy the archives from the server. The server user needs read access, so this command runs `sudo tar` on the server.

   ```sh
   mkdir -p ~/algotank-backups && ssh ubuntu@203.0.113.10 'sudo tar -C /var/backups -cf - algotank' | tar -C ~/algotank-backups -xf -
   ```

## Restore

> **WARNING:** A restore replaces all data. Accounts, games and chats from after the backup are lost.

1. Show the archives, and choose one. Use its name in place of `algotank-data-20261112T030000Z.tar.gz`.

   ```sh
   sudo ls /var/backups/algotank
   ```

2. Stop the game.

   ```sh
   sudo systemctl stop algotank
   ```

3. Move the current data aside. Do not delete it until the restored server works.

   ```sh
   sudo mv /var/lib/algotank /var/lib/algotank.before-restore
   ```

4. Unpack the archive. It makes `/var/lib/algotank`.

   ```sh
   sudo tar -C /var/lib -xzf /var/backups/algotank/algotank-data-20261112T030000Z.tar.gz
   ```

5. Give the folder to the user `algotank`, and make it private.

   ```sh
   sudo chown -R algotank:algotank /var/lib/algotank && sudo chmod 0700 /var/lib/algotank
   ```

6. Start the game.

   ```sh
   sudo systemctl start algotank
   ```

7. Make sure that the server answers.

   ```sh
   curl -fsS http://127.0.0.1:3000/api/health
   ```

8. When the game works, delete the old data.

   ```sh
   sudo rm -r /var/lib/algotank.before-restore
   ```
