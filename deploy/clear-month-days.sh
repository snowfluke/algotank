#!/usr/bin/env bash
# Gives the monthly league a fresh start inside a month: deletes the counted days before a day,
# with the server stopped (apps/server/scripts/clear-month-days.ts says what is kept).
#
#   sudo bash /opt/algotank/current/deploy/clear-month-days.sh 2026-11-17
#
# Run it after 00:00 of that day in LEAGUE_TIME_ZONE. It checks the day first, so a run at the
# wrong time stops before the server does. A backup goes to /var/backups/algotank first. When
# the delete fails, the server starts again with the data unchanged.
set -euo pipefail

DAY="${1:-}"
[[ "$DAY" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]] || { echo "Usage: sudo bash $0 <first day to keep, YYYY-MM-DD>" >&2; exit 2; }
[[ "$(id -u)" == 0 ]] || { echo "Run it with sudo." >&2; exit 2; }

APP=/opt/algotank/current
ENV_FILE=/etc/algotank/env
SERVICE=algotank
BACKUP_DIR=/var/backups/algotank
DATA_DIR="$(sed -n 's/^DATA_DIR=//p' "$ENV_FILE" | tail -n 1)"
PORT="$(sed -n 's/^PORT=//p' "$ENV_FILE" | tail -n 1)"
DATA_DIR="${DATA_DIR:-/var/lib/algotank}"
PORT="${PORT:-8787}"

as_app() { (cd "$APP" && sudo -u algotank env DATA_DIR="$DATA_DIR" BUN_RUNTIME_TRANSPILER_CACHE_PATH=0 /usr/local/bin/bun "$@"); }

echo "==> Checking the day (nothing changes yet)"
as_app apps/server/scripts/clear-month-days.ts "$DAY" --dry-run

BACKUP="$BACKUP_DIR/before-clear-$DAY-$(date -u +%Y%m%dT%H%M%SZ).sqlite"
echo "==> Backing up to $BACKUP"
as_app apps/server/scripts/backup.ts "$BACKUP"

echo "==> Stopping the server"
systemctl stop "$SERVICE"

echo "==> Deleting the counted days before $DAY"
if ! as_app apps/server/scripts/clear-month-days.ts "$DAY"; then
  echo "The delete failed, so the server starts again with the data unchanged." >&2
  systemctl start "$SERVICE"
  exit 1
fi

echo "==> Starting the server"
systemctl start "$SERVICE"
for _ in $(seq 1 30); do
  if curl -sf "http://127.0.0.1:$PORT/api/health" >/dev/null; then break; fi
  sleep 1
done
curl -sf "http://127.0.0.1:$PORT/api/health" >/dev/null || { echo "The server did not answer its health check. See: journalctl -u $SERVICE -n 50" >&2; exit 1; }

echo "==> This month in League 1 (name, counted days, points today)"
curl -s "http://127.0.0.1:$PORT/api/monthly/leagues/1/ranking" | python3 -c '
import json, sys
d = json.load(sys.stdin)
today = {r["seatId"]: r["points"] for r in d["today"]}
for r in d["thisMonth"]:
    print("  " + r["name"] + ": " + str(r["countedDays"]) + " counted days, " + str(today.get(r["seatId"], 0)) + " points today")
'
echo "==> Done. The backup is $BACKUP"
