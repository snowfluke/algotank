#!/usr/bin/env bash
# Builds the offline tank workshop (src/offline/target.ts) and packs it as a ZIP for a game portal:
# index.html at the root, every link relative, no source maps, and a central directory under 64 KiB.
#
#   bash apps/web/scripts/pack-offline.sh ~/algotank-offline.zip
#
# The build lands in apps/web/dist-offline. scripts/offline-check.mjs plays it in a browser.
set -euo pipefail

[[ $# -eq 1 && -n "$1" ]] || { printf 'Usage: %s <archive.zip>\n' "$0" >&2; exit 2; }
WEB="$(cd "$(dirname "$0")/.." && pwd)"
OUT_DIR="$WEB/dist-offline"
ARCHIVE="$(cd "$(dirname "$1")" && pwd)/$(basename "$1")"
# The portal reads the central directory up to about 64 KiB.
CENTRAL_DIRECTORY_MAX=65536

fail() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }

(cd "$WEB" && bunx vite build --mode offline)

# A root-based address ("/assets/...") would load from the portal's host, not from the game's folder.
if grep -nE '(src|href)="/' "$OUT_DIR/index.html"; then fail "index.html links to a root-based address (above)."; fi
if grep -lE 'url\(/' "$OUT_DIR"/assets/*.css; then fail "A stylesheet links to a root-based address (file above)."; fi
if [[ -n "$(find "$OUT_DIR" -name '*.map')" ]]; then fail "The build holds source maps."; fi

# The bundled fonts are under the SIL Open Font License, which must travel with them. The flags carry
# their own license in public/flags, and the game's is the repository's LICENSE.
mkdir -p "$OUT_DIR/licenses"
for font in figtree fredoka; do
  cp "$WEB/node_modules/@fontsource-variable/$font/LICENSE" "$OUT_DIR/licenses/$font-font.txt"
done
cp "$WEB/../../LICENSE" "$OUT_DIR/LICENSE"

rm -f "$ARCHIVE"
# -D leaves out folder entries, which the portal does not need, so the central directory stays small.
(cd "$OUT_DIR" && COPYFILE_DISABLE=1 zip -qr -X -D "$ARCHIVE" . -x '.DS_Store' '*/.DS_Store')

# The list is read whole first: grep -q stops at the first match, and pipefail would count unzip's broken pipe.
entries="$(unzip -Z1 "$ARCHIVE")"
grep -qx 'index.html' <<<"$entries" || fail "index.html is not at the root of $ARCHIVE."
central="$(zipinfo -v "$ARCHIVE" | sed -nE 's/.*central directory is ([0-9]+) .*/\1/p')"
[[ -n "$central" ]] || fail "zipinfo did not report the size of the central directory."
(( central < CENTRAL_DIRECTORY_MAX )) || fail "The central directory is $central bytes, over $CENTRAL_DIRECTORY_MAX."
printf '==> %s: %s files, central directory %s bytes\n' "$ARCHIVE" "$(wc -l <<<"$entries" | tr -d ' ')" "$central"
