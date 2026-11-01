#!/bin/bash
# record-sample.sh -- Record every host-parity recipe with the C recorder.
#
# Usage: experiments/host-parity/record-sample.sh <out-dir> [jobs] [recipe ...]
#
# Writes <out-dir>/<id>.session.json for each recipe, a log per recipe under
# <out-dir>/logs/, and the ids of recipes that failed to record to
# <out-dir>/failed.txt. With no recipe arguments it records every file in
# experiments/host-parity/recipes/. jobs defaults to the number of CPUs; the
# recordings can run in parallel because scripts/record-session.mjs gives
# each one a private copy of the install. The recorder must already be built
# (nethack-c/build-recorder.sh); NETHACK_BINARY and NETHACK_INSTALL select
# another build, as for record-session.mjs. The macOS workflow
# (.github/workflows/macos-recorder.yml) and a local Linux run both use this
# script, so both hosts record the same way. Exits 1 if any recipe failed.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$HERE/../.." && pwd)"
OUT="${1:?usage: record-sample.sh <out-dir> [jobs] [recipe ...]}"
JOBS="${2:-$(getconf _NPROCESSORS_ONLN)}"
shift $(( $# >= 2 ? 2 : 1 ))
if [ $# -eq 0 ]; then
    set -- "$HERE"/recipes/*.session.json
fi

# record-session.mjs puts the game's HOME under os.tmpdir(), and NetHack
# prints HOME/.nethackrc in the options help text. The default temporary
# directory is /tmp on Linux but a longer /var/folders/... path on macOS,
# which would change where that text wraps. Using /tmp on both hosts leaves
# only the 6-character mkdtemp() suffix to differ, which
# scripts/compare-host-recordings.mjs masks.
export TMPDIR=/tmp

mkdir -p "$OUT/logs"
OUT="$(cd "$OUT" && pwd)"
: > "$OUT/failed.txt"
export OUT REPO_ROOT

record_one() {
    local recipe=$1
    local id
    id="$(basename "$recipe" .session.json)"
    if ! node "$REPO_ROOT/scripts/record-session.mjs" "$recipe" "$OUT/$id.session.json" \
        > "$OUT/logs/$id.log" 2>&1; then
        echo "$id" >> "$OUT/failed.txt"
        echo "[fail] $id: $(tail -n 1 "$OUT/logs/$id.log")" >&2
    fi
}
export -f record_one

printf '%s\n' "$@" | xargs -P "$JOBS" -I{} bash -c 'record_one "$1"' _ {}

failed=$(wc -l < "$OUT/failed.txt" | tr -d ' ')
echo "Recorded $(( $# - failed )) of $# recipes into $OUT ($failed failed)."
[ "$failed" -eq 0 ]
