#!/usr/bin/env bash
# Installs one release of the game and switches the server to it. A failed health
# check switches back to the release that ran before. See docs/deployment/04-update-and-rollback.md.
#
# On your computer, in the project folder, make the archive:
#   bash deploy/release.sh --pack ~/algotank-release.tar.gz
# On the server, install it:
#   sudo algotank-release /tmp/algotank-release.tar.gz
#   sudo algotank-release /path/to/source-folder
#
# Layout: $APP_ROOT/releases/<UTC timestamp>/ and $APP_ROOT/current -> that folder.
# APP_ROOT and ENV_FILE can be changed only for a dry run in a temporary folder.
set -euo pipefail

APP_ROOT="${APP_ROOT:-/opt/algotank}"
ENV_FILE="${ENV_FILE:-/etc/algotank/env}"
SERVICE="${SERVICE:-algotank}"
# systemd (deploy/algotank.service) or pm2 (deploy/ecosystem.config.cjs).
SERVICE_MANAGER="${SERVICE_MANAGER:-systemd}"
RELEASES="$APP_ROOT/releases"
CURRENT="$APP_ROOT/current"
KEEP_RELEASES=5
# One try per second. The server answers within a few seconds of its start.
HEALTH_TRIES=30
RELEASE_NAME_PATTERN='^[0-9]{8}T[0-9]{6}Z$'

# The files a release needs. node_modules, the built client and the data are made on the server.
RELEASE_FILES=(package.json bun.lock bunfig.toml tsconfig.base.json apps packages deploy)
RELEASE_EXCLUDES=(--exclude=node_modules --exclude=apps/web/dist --exclude=apps/server/data --exclude=.DS_Store)

step() { printf '==> %s\n' "$*"; }
fail() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }

usage() {
  printf 'Usage:\n  %s --pack <archive.tar.gz>        (on your computer, in the project folder)\n  sudo %s <source-folder | archive.tar.gz>   (on the server)\n' "$0" "$0" >&2
  exit 2
}

pack() {
  local out="$1"
  local root
  root="$(cd "$(dirname "$0")/.." && pwd)"
  step "Packing ${RELEASE_FILES[*]} from $root into $out"
  # COPYFILE_DISABLE stops macOS tar from adding ._ metadata files.
  COPYFILE_DISABLE=1 tar -C "$root" "${RELEASE_EXCLUDES[@]}" -czf "$out" "${RELEASE_FILES[@]}"
  step "Done. Copy $out to the server and run: sudo algotank-release <archive>"
}

health_url() {
  local port host
  port="$(sed -n 's/^PORT=//p' "$ENV_FILE" | tail -n 1)"
  host="$(sed -n 's/^HOST=//p' "$ENV_FILE" | tail -n 1)"
  case "$host" in
    "" | 0.0.0.0 | ::) host=127.0.0.1 ;;
    *:*) host="[$host]" ;;
  esac
  printf 'http://%s:%s/api/health' "$host" "${port:-8787}"
}

restart_service() {
  step "Restarting the service ($SERVICE_MANAGER)"
  case "$SERVICE_MANAGER" in
    systemd)
      # A release that crashes at start uses up StartLimitBurst, and the limit also refuses
      # manual starts. reset-failed clears the counter, so the rollback can start the old release.
      systemctl reset-failed "$SERVICE" || step "reset-failed did not succeed; restarting anyway"
      systemctl restart "$SERVICE"
      ;;
    # startOrRestart reads the file again, so the cwd /opt/algotank/current resolves to the new release.
    # pm2 keeps its state in $HOME/.pm2, outside the data folder (docs/deployment/08-pm2.md).
    pm2) sudo -u algotank HOME=/var/lib/algotank-pm2 pm2 startOrRestart "$CURRENT/deploy/ecosystem.config.cjs" ;;
    *) fail "SERVICE_MANAGER must be systemd or pm2, but it is \"$SERVICE_MANAGER\"." ;;
  esac
}

wait_until_healthy() {
  local url try
  url="$(health_url)"
  step "Waiting for 200 from $url (up to $HEALTH_TRIES s)"
  for ((try = 1; try <= HEALTH_TRIES; try++)); do
    if curl -fsS --max-time 2 -o /dev/null "$url"; then
      step "Health check passed after $try try(s)"
      return 0
    fi
    sleep 1
  done
  return 1
}

switch_to() {
  step "Pointing $CURRENT at $1"
  ln -sfn "$1" "$CURRENT"
}

prune_releases() {
  local keep_a="$1" keep_b="$2"
  local names=() path name count i
  for path in "$RELEASES"/*; do
    [[ -d "$path" ]] || continue
    name="$(basename "$path")"
    [[ "$name" =~ $RELEASE_NAME_PATTERN ]] && names+=("$name")
  done
  count=${#names[@]}
  step "Keeping the newest $KEEP_RELEASES of $count release(s)"
  # A glob sorts by name, and the names are UTC timestamps, so the oldest come first.
  for ((i = 0; i < count - KEEP_RELEASES; i++)); do
    name="${names[$i]}"
    if [[ "$RELEASES/$name" == "$keep_a" || "$RELEASES/$name" == "$keep_b" ]]; then
      step "Keeping $name, because the server uses it or rolls back to it"
      continue
    fi
    step "Removing old release $name"
    rm -rf -- "${RELEASES:?}/${name:?}"
  done
}

install_release() {
  local source="$1" new previous
  # Checked before anything changes, so a typo cannot leave current pointing at an unstarted release.
  [[ "$SERVICE_MANAGER" == systemd || "$SERVICE_MANAGER" == pm2 ]] || fail "SERVICE_MANAGER must be systemd or pm2, but it is \"$SERVICE_MANAGER\"."
  [[ -e "$source" ]] || fail "$source does not exist."
  [[ -r "$ENV_FILE" ]] || fail "$ENV_FILE is missing or not readable. Run this script with sudo."

  step "Making $RELEASES"
  mkdir -p "$RELEASES" || fail "Cannot write to $RELEASES. Run this script with sudo."

  new="$RELEASES/$(date -u +%Y%m%dT%H%M%SZ)"
  step "Making the release folder $new"
  mkdir "$new"

  if [[ -d "$source" ]]; then
    step "Copying ${RELEASE_FILES[*]} from the folder $source"
    tar -C "$source" "${RELEASE_EXCLUDES[@]}" -cf - "${RELEASE_FILES[@]}" | tar -C "$new" --no-same-owner -xf -
  else
    step "Unpacking the archive $source"
    tar -C "$new" --no-same-owner -xf "$source"
  fi
  [[ -f "$new/package.json" && -f "$new/bun.lock" ]] || fail "$new has no package.json or bun.lock. Make the archive with --pack."

  # The service user reads the code and cannot change it.
  step "Making the release readable by every user and writable by root only"
  chmod -R u=rwX,go=rX "$new"

  step "Installing dependencies (bun install --frozen-lockfile)"
  (cd "$new" && bun install --frozen-lockfile) || fail "bun install failed. The server still runs the old release."
  step "Building the web client (bun run build)"
  (cd "$new" && bun run build) || fail "The build failed. The server still runs the old release."

  previous=""
  if [[ -L "$CURRENT" ]]; then previous="$(readlink "$CURRENT")"; fi
  step "The release that runs now: ${previous:-none}"

  switch_to "$new"
  restart_service || step "The restart command failed"
  if wait_until_healthy; then
    prune_releases "$new" "$previous"
    step "Release $(basename "$new") is live."
    return 0
  fi

  printf 'ERROR: Release %s did not answer the health check.\n' "$(basename "$new")" >&2
  if [[ -z "$previous" ]]; then
    fail "No release ran before this one, so there is nothing to switch back to. Read: journalctl -u $SERVICE -n 100"
  fi
  step "Switching back to $previous"
  switch_to "$previous"
  restart_service || step "The restart command failed"
  if wait_until_healthy; then
    fail "Switched back to $(basename "$previous"), which answers again. The failed release stays in $new. Read: journalctl -u $SERVICE -n 100"
  fi
  fail "Switched back to $(basename "$previous"), but it does not answer either. Read: journalctl -u $SERVICE -n 100"
}

[[ $# -ge 1 ]] || usage
case "$1" in
  --pack)
    [[ $# -eq 2 && -n "$2" ]] || usage
    pack "$2"
    ;;
  -*) usage ;;
  *)
    [[ $# -eq 1 ]] || usage
    install_release "$1"
    ;;
esac
