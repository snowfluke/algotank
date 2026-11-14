#!/usr/bin/env bash
# Copies the game's database with the release's backup command, compresses the copy and
# keeps the newest 14 copies. algotank-backup.timer runs it once a day as the user algotank.
# See docs/deployment/05-backup-and-restore.md.
#
# The backup command (bun run backup, apps/server/src/db/backup.ts) uses SQLite's VACUUM INTO,
# which writes one consistent moment of the database while the game runs. A tar or cp of the
# data folder is not a safe backup: in WAL mode the last writes can be only in the -wal file,
# and a copy taken during a write can hold half of it. The server keeps up to one second of
# play-style, look and bot-fill edits, and up to one minute of league points, in memory
# before it writes them, so a copy does not have them.
set -euo pipefail

DATA_DIR="${DATA_DIR:-/var/lib/algotank}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/algotank}"
APP_DIR="${APP_DIR:-/opt/algotank/current}"
BUN="${BUN:-/usr/local/bin/bun}"
KEEP_BACKUPS=14
COPY_PATTERN='^algotank-[0-9]{8}T[0-9]{6}Z\.sqlite\.gz$'

step() { printf '==> %s\n' "$*"; }
fail() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }

[[ -f "$DATA_DIR/algotank.sqlite" ]] || fail "$DATA_DIR/algotank.sqlite does not exist."
[[ -d "$BACKUP_DIR" ]] || fail "$BACKUP_DIR does not exist. Make it with: install -d -m 0700 -o algotank -g algotank $BACKUP_DIR"
[[ -f "$APP_DIR/package.json" ]] || fail "$APP_DIR has no release."
[[ -x "$BUN" ]] || fail "$BUN is not an executable Bun."

# The copy holds password hashes, sessions and player tokens.
umask 077

name="algotank-$(date -u +%Y%m%dT%H%M%SZ).sqlite"
partial="$BACKUP_DIR/.$name.partial"
step "Copying $DATA_DIR/algotank.sqlite to $BACKUP_DIR/$name.gz"

# The backup command refuses a target that exists, so a partial copy of an earlier failed run goes first.
rm -f -- "$partial" "$partial.gz"
if ! (cd "$APP_DIR" && DATA_DIR="$DATA_DIR" "$BUN" run --silent backup "$partial"); then
  rm -f -- "$partial"
  fail "The backup command failed. No copy was written."
fi

step "Compressing the copy"
if ! gzip -9 -- "$partial" || ! gzip -t -- "$partial.gz"; then
  rm -f -- "$partial" "$partial.gz"
  fail "The copy could not be compressed. No copy was written."
fi
mv -- "$partial.gz" "$BACKUP_DIR/$name.gz"

copies=()
for path in "$BACKUP_DIR"/algotank-*.sqlite.gz; do
  [[ -f "$path" ]] || continue
  file="$(basename "$path")"
  [[ "$file" =~ $COPY_PATTERN ]] && copies+=("$file")
done
count=${#copies[@]}
step "Keeping the newest $KEEP_BACKUPS of $count copy(ies)"
# A glob sorts by name, and the names hold UTC timestamps, so the oldest come first.
for ((i = 0; i < count - KEEP_BACKUPS; i++)); do
  step "Removing old copy ${copies[$i]}"
  rm -f -- "${BACKUP_DIR:?}/${copies[$i]:?}"
done
step "Backup $name.gz is done ($(du -h "$BACKUP_DIR/$name.gz" | cut -f1))."
