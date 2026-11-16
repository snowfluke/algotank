#!/usr/bin/env bash
# Gives the monthly seats that play an old preset the retuned preset (apps/server/scripts/update-preset-seats.ts
# says what is kept), with the server stopped. The same steps as clear-month-days.sh.
#
#   sudo bash /opt/algotank/current/deploy/update-preset-seats.sh
#
# A dry run lists the tanks first. A backup goes to /var/backups/algotank first. When the change
# fails, the server starts again with the data unchanged.
set -euo pipefail

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

echo "==> Listing the seats (nothing changes yet)"
as_app apps/server/scripts/update-preset-seats.ts --dry-run

BACKUP="$BACKUP_DIR/before-update-presets-$(date -u +%Y%m%dT%H%M%SZ).sqlite"
echo "==> Backing up to $BACKUP"
as_app apps/server/scripts/backup.ts "$BACKUP"

echo "==> Stopping the server"
systemctl stop "$SERVICE"

echo "==> Updating the seats that play an old preset"
if ! as_app apps/server/scripts/update-preset-seats.ts; then
  echo "The change failed, so the server starts again with the data unchanged." >&2
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
