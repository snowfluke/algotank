#!/usr/bin/env bash
# Archives the game's data folder and keeps the newest 14 archives.
# algotank-backup.timer runs it once a day. See docs/deployment/05-backup-and-restore.md.
#
# The server writes each file to a temporary name and renames it, so every file in the
# archive is whole. Files can still disagree with each other, because tar reads them one
# after another while the game runs: for example an arena file and its chat file, or a
# month's league file and champions.json. The server also keeps up to one second of
# play-style, look and bot-fill edits, and of chat lines, in memory before it writes them.
set -euo pipefail

DATA_DIR="${DATA_DIR:-/var/lib/algotank}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/algotank}"
KEEP_BACKUPS=14
ARCHIVE_PATTERN='^algotank-data-[0-9]{8}T[0-9]{6}Z\.tar\.gz$'

step() { printf '==> %s\n' "$*"; }
fail() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }

[[ -d "$DATA_DIR" ]] || fail "$DATA_DIR does not exist."
[[ -d "$BACKUP_DIR" ]] || fail "$BACKUP_DIR does not exist. Make it with: install -d -m 0700 $BACKUP_DIR"

# The archive holds password hashes, sessions and player tokens.
umask 077

name="algotank-data-$(date -u +%Y%m%dT%H%M%SZ).tar.gz"
partial="$BACKUP_DIR/.$name.partial"
step "Archiving $DATA_DIR into $BACKUP_DIR/$name"

status=0
# The server's temporary files (.<name>.tmp) can vanish while tar reads the folder.
tar -C "$(dirname "$DATA_DIR")" --exclude='.*.tmp' -czf "$partial" "$(basename "$DATA_DIR")" || status=$?
# GNU tar exits with 1 when a file changed while it was read. The archive is still usable,
# and the next run takes a new copy of that file.
if [[ $status -ne 0 && $status -ne 1 ]]; then
  rm -f -- "$partial"
  fail "tar failed with status $status. No archive was written."
fi
if [[ $status -eq 1 ]]; then
  step "WARNING: a file changed while tar read it. The archive keeps the version tar read."
fi

step "Checking that the archive can be read"
if ! tar -tzf "$partial" >/dev/null; then
  rm -f -- "$partial"
  fail "The archive cannot be read. No archive was written."
fi
mv -- "$partial" "$BACKUP_DIR/$name"

archives=()
for path in "$BACKUP_DIR"/algotank-data-*.tar.gz; do
  [[ -f "$path" ]] || continue
  file="$(basename "$path")"
  [[ "$file" =~ $ARCHIVE_PATTERN ]] && archives+=("$file")
done
count=${#archives[@]}
step "Keeping the newest $KEEP_BACKUPS of $count archive(s)"
# A glob sorts by name, and the names hold UTC timestamps, so the oldest come first.
for ((i = 0; i < count - KEEP_BACKUPS; i++)); do
  step "Removing old archive ${archives[$i]}"
  rm -f -- "${BACKUP_DIR:?}/${archives[$i]:?}"
done
step "Backup $name is done ($(du -h "$BACKUP_DIR/$name" | cut -f1))."
